// Otto's brain — Gemini integration + tool calling + rate limiting.
// All server-side. The API key is loaded from DB (user override) or env
// (the bundled default that ships with the app).

import { GoogleGenerativeAI, type Part } from '@google/generative-ai'
import { db } from '@/lib/db'
import { executeTool, functionDeclarations, type ToolCall, type ToolResult } from '@/lib/otto-tools'
import { loadBrainConfig } from '@/lib/brain-config'
import { zegrateChatWithTools } from '@/lib/zegrate-gateway'
import { fallbackChain } from '@/lib/model-chain'

const BUNDLED_API_KEY = process.env.GEMINI_API_KEY
const BUNDLED_MODEL = process.env.OTTO_MODEL || 'gemini-3.5-flash-lite'

// Cache the loaded config for 30s to avoid hitting the DB on every chat turn
let cachedConfig: { key: string; model: string; ts: number } | null = null
const CONFIG_CACHE_MS = 30_000

async function getActiveConfig(): Promise<{ key: string; model: string }> {
  const now = Date.now()
  if (cachedConfig && now - cachedConfig.ts < CONFIG_CACHE_MS) {
    return { key: cachedConfig.key, model: cachedConfig.model }
  }
  try {
    const cfg = await loadBrainConfig()
    cachedConfig = { key: cfg.apiKey, model: cfg.model, ts: now }
    return { key: cfg.apiKey, model: cfg.model }
  } catch {
    // DB not ready (first run before db:push) — fall back to bundled
    return { key: BUNDLED_API_KEY || '', model: BUNDLED_MODEL }
  }
}

// Note: genAI instance is created per-request because the key may change
// if the user pastes their own. Don't cache it at module load.

// Otto's brain model. Loaded from DB config (user override) or env (bundled default).
// Use this for display; the actual model used per-request is from getActiveConfig().
export const MODEL_NAME = BUNDLED_MODEL

// ─── Free-tier-safe rate limits ────────────────────────────────────────────
// Gemini free tier for gemini-3.5-flash-lite: 10 RPM, 500 RPD.
// We keep a safety buffer so it never runs out even with multi-agent spawns.
const LIMITS = {
  minute: parseInt(process.env.OTTO_RATE_LIMIT_MINUTE || '8', 10),
  hourly: parseInt(process.env.OTTO_RATE_LIMIT_HOURLY || '50', 10),
  peakHourly: parseInt(process.env.OTTO_RATE_LIMIT_PEAK_HOURLY || '30', 10),
  daily: parseInt(process.env.OTTO_RATE_LIMIT_DAILY || '400', 10),
  monthlyTokens: parseInt(process.env.OTTO_RATE_LIMIT_MONTHLY_TOKENS || '1000000', 10),
}

const PEAK_START = parseInt(process.env.OTTO_PEAK_HOUR_START || '9', 10)
const PEAK_END = parseInt(process.env.OTTO_PEAK_HOUR_END || '18', 10)

// User timezone: Asia/Kolkata (IST = UTC+5:30)
function istNow(): Date {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000)
}

export function getUserHour(): { hour: number; isPeak: boolean } {
  const ist = istNow()
  const hour = ist.getUTCHours()
  const isPeak = hour >= PEAK_START && hour < PEAK_END
  return { hour, isPeak }
}

type BucketKind = 'minute' | 'hourly' | 'daily' | 'monthly' | 'peak'

function getBucketKey(kind: BucketKind): string {
  const ist = istNow()
  const y = ist.getUTCFullYear()
  const mo = String(ist.getUTCMonth() + 1).padStart(2, '0')
  const d = String(ist.getUTCDate()).padStart(2, '0')
  const h = String(ist.getUTCHours()).padStart(2, '0')
  const mi = String(ist.getUTCMinutes()).padStart(2, '0')
  switch (kind) {
    case 'minute': return `minute:${y}-${mo}-${d}-${h}-${mi}`
    case 'hourly': return `hourly:${y}-${mo}-${d}-${h}`
    case 'daily': return `daily:${y}-${mo}-${d}`
    case 'monthly': return `monthly:${y}-${mo}`
    case 'peak': return `peak:${y}-${mo}-${d}-${h}`
  }
}

export interface RateLimitStatus {
  allowed: boolean
  reason?: string
  reasonCode?: 'minute' | 'hourly' | 'daily' | 'peak' | 'monthly' | null
  minute: { used: number; limit: number; resetsInSec: number }
  hourly: { used: number; limit: number }
  daily: { used: number; limit: number }
  peak: { used: number; limit: number; isPeak: boolean }
  monthly: { used: number; limit: number }
}

export async function checkRateLimit(): Promise<RateLimitStatus> {
  const { isPeak } = getUserHour()

  const [minuteRow, hourlyRow, dailyRow, peakRow, monthlyRow] = await Promise.all([
    db.usageEvent.findUnique({ where: { bucket: getBucketKey('minute') } }),
    db.usageEvent.findUnique({ where: { bucket: getBucketKey('hourly') } }),
    db.usageEvent.findUnique({ where: { bucket: getBucketKey('daily') } }),
    db.usageEvent.findUnique({ where: { bucket: getBucketKey('peak') } }),
    db.usageEvent.findUnique({ where: { bucket: getBucketKey('monthly') } }),
  ])

  const minuteUsed = minuteRow?.count ?? 0
  const hourlyUsed = hourlyRow?.count ?? 0
  const dailyUsed = dailyRow?.count ?? 0
  const peakUsed = peakRow?.count ?? 0
  const monthlyTokensUsed = monthlyRow?.tokens ?? 0

  // Seconds until the current minute rolls over
  const sec = new Date().getUTCSeconds()
  const resetsInSec = 60 - sec

  let allowed = true
  let reason: string | undefined
  let reasonCode: RateLimitStatus['reasonCode'] = null

  if (minuteUsed >= LIMITS.minute) {
    allowed = false
    reasonCode = 'minute'
    reason = `Per-minute limit reached (${minuteUsed}/${LIMITS.minute}). Otto needs ~${resetsInSec}s to catch its breath.`
  } else if (hourlyUsed >= LIMITS.hourly) {
    allowed = false
    reasonCode = 'hourly'
    reason = `Hourly limit reached (${hourlyUsed}/${LIMITS.hourly}). Try again next hour — this keeps the free tier from ever running dry.`
  } else if (dailyUsed >= LIMITS.daily) {
    allowed = false
    reasonCode = 'daily'
    reason = `Daily limit reached (${dailyUsed}/${LIMITS.daily}). Free tier is 250/day — Otto reserves a buffer. Back tomorrow.`
  } else if (isPeak && peakUsed >= LIMITS.peakHourly) {
    allowed = false
    reasonCode = 'peak'
    reason = `Peak-hour limit reached (${peakUsed}/${LIMITS.peakHourly}, ${PEAK_START}:00–${PEAK_END}:00 IST). Try again after ${PEAK_END}:00.`
  } else if (monthlyTokensUsed >= LIMITS.monthlyTokens) {
    allowed = false
    reasonCode = 'monthly'
    reason = `Monthly token budget exhausted (${monthlyTokensUsed.toLocaleString()}/${LIMITS.monthlyTokens.toLocaleString()}). Resets next month.`
  }

  return {
    allowed,
    reason,
    reasonCode,
    minute: { used: minuteUsed, limit: LIMITS.minute, resetsInSec },
    hourly: { used: hourlyUsed, limit: LIMITS.hourly },
    daily: { used: dailyUsed, limit: LIMITS.daily },
    peak: { used: peakUsed, limit: LIMITS.peakHourly, isPeak },
    monthly: { used: monthlyTokensUsed, limit: LIMITS.monthlyTokens },
  }
}

async function recordUsage(tokens: number): Promise<void> {
  const { isPeak } = getUserHour()
  const kinds: BucketKind[] = ['minute', 'hourly', 'daily', 'monthly']
  if (isPeak) kinds.push('peak')

  for (const kind of kinds) {
    const key = getBucketKey(kind)
    await db.usageEvent.upsert({
      where: { bucket: key },
      update: {
        count: { increment: 1 },
        tokens: kind === 'monthly' ? { increment: tokens } : 0,
      },
      create: {
        bucket: key,
        count: 1,
        tokens: kind === 'monthly' ? tokens : 0,
      },
    })
  }
}

export interface ChatOptions {
  systemPrompt: string
  history: { role: 'user' | 'assistant'; content: string }[]
  userMessage: string
  onToken?: (chunk: string) => void
  onThought?: (chunk: string) => void
  onToolCall?: (call: ToolCall) => void
  onToolResult?: (result: ToolResult) => void
  maxToolRounds?: number  // default 5
}

export interface ChatResult {
  content: string
  thoughts: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  model: string
  toolCalls: ToolCall[]
  toolResults: ToolResult[]
}

export async function streamChat(opts: ChatOptions): Promise<ChatResult> {
  // Otto's brain is Google Gemini — the API key the user provided.
  // No fallback. If Gemini fails (quota, network, region, key issue),
  // the error propagates to the user so they know something is wrong.
  return streamGeminiWithTools(opts)
}

// ─── Gemini + tools (function-calling loop) ────────────────────────────────
async function streamGeminiWithTools(opts: ChatOptions): Promise<ChatResult> {
  const { key: apiKey, model: modelName } = await getActiveConfig()
  if (!apiKey) {
    throw new Error('No Gemini API key configured. Otto ships with a bundled key — set GEMINI_API_KEY in .env, or paste your own in Settings → Brain.')
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const maxRounds = opts.maxToolRounds ?? 5
  const tools = functionDeclarations()

  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: opts.systemPrompt,
    generationConfig: {
      thinkingConfig: { includeThoughts: true },
    } as any,
    tools: [{ functionDeclarations: tools as any }],
  })

  // Convert history to Gemini format (alternating user/model turns)
  const contents: Part[] = []
  for (const m of opts.history) {
    contents.push({
      text: m.content,
      // Gemini infers role from order; we just need text parts
    } as Part)
  }
  contents.push({ text: opts.userMessage } as Part)

  // Gemini SDK wants the contents array as the right type — rebuild it
  type GContent = { role: string; parts: Part[] }
  const gContents: GContent[] = []
  for (const m of opts.history) {
    gContents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content } as Part],
    })
  }
  gContents.push({ role: 'user', parts: [{ text: opts.userMessage } as Part] })

  let allContent = ''
  let allThoughts = ''
  let promptTokens = 0
  let completionTokens = 0
  const allToolCalls: ToolCall[] = []
  const allToolResults: ToolResult[] = []

  // ─── Function-calling loop (Gemini primary; falls back to Zegrate on failure) ──
  try {
  for (let round = 0; round < maxRounds; round++) {
    const result = await model.generateContentStream({ contents: gContents })

    let roundContent = ''
    let roundThoughts = ''
    let functionCalls: { name: string; args: Record<string, unknown> }[] = []
    let lastUsage: { prompt?: number; completion?: number } | null = null

    for await (const chunk of result.stream) {
      const c = chunk as unknown as {
        text?: string
        candidates?: { content?: { parts?: (Part & { thought?: boolean; functionCall?: { name: string; args: unknown } })[] } }[]
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
      }
      const parts = c.candidates?.[0]?.content?.parts
      if (parts && parts.length > 0) {
        for (const part of parts) {
          if (part.thought && (part as any).text) {
            roundThoughts += (part as any).text
            opts.onThought?.((part as any).text)
          } else if ((part as any).text) {
            roundContent += (part as any).text
            opts.onToken?.((part as any).text)
          } else if ((part as any).functionCall) {
            const fc = (part as any).functionCall
            functionCalls.push({
              name: fc.name,
              args: (fc.args || {}) as Record<string, unknown>,
            })
          }
        }
      } else if (c.text) {
        roundContent += c.text
        opts.onToken?.(c.text)
      }
      const usage = c.usageMetadata
      if (usage) {
        lastUsage = {
          prompt: usage.promptTokenCount,
          completion: usage.candidatesTokenCount,
        }
      }
    }

    allContent += roundContent
    allThoughts += roundThoughts
    if (lastUsage) {
      promptTokens = lastUsage.prompt ?? promptTokens
      completionTokens = (lastUsage.completion ?? 0) + completionTokens
    }

    // If no function calls, we're done
    if (functionCalls.length === 0) {
      break
    }

    // Append the model's response (with function calls) to the running history
    gContents.push({
      role: 'model',
      parts: functionCalls.map((fc) => ({ functionCall: { name: fc.name, args: fc.args } } as Part)),
    })

    // Execute each tool call, append the functionResponse parts
    const responseParts: Part[] = []
    for (const fc of functionCalls) {
      const call: ToolCall = { name: fc.name, args: fc.args }
      allToolCalls.push(call)
      opts.onToolCall?.(call)

      // Stream a thought that Otto is acting
      opts.onThought?.(`\n\n▸ Calling tool: ${fc.name}(${JSON.stringify(fc.args).slice(0, 200)})\n`)

      const toolResult = await executeTool(call)
      allToolResults.push(toolResult)
      opts.onToolResult?.(toolResult)

      // Record activity log entry if the tool provided one
      if (toolResult.activity) {
        try {
          await db.activityLog.create({
            data: {
              agentName: 'Otto',
              action: toolResult.activity.action,
              target: toolResult.activity.target,
              summary: toolResult.activity.summary,
              riskTier: toolResult.activity.riskTier,
              undoable: toolResult.activity.undoable ?? false,
              autonomyLevel: 2,
            },
          })
        } catch {}
      }

      // Gemini wants functionResponse parts with { name, response }
      responseParts.push({
        functionResponse: {
          name: fc.name,
          response: { ok: toolResult.ok, summary: toolResult.summary, data: toolResult.data },
        },
      } as Part)

      opts.onThought?.(`  → ${toolResult.summary}\n`)
    }

    gContents.push({ role: 'user', parts: responseParts })
    // Loop continues — model will see the tool results and either call more
    // tools or produce a final answer
  }
  } catch (geminiErr: any) {
    // Gemini is down / quota / region — try the HF fallback chain.
    opts.onThought?.(`\n⚠️ Gemini failed (${String(geminiErr?.message || geminiErr).slice(0, 120)}). Trying fallback models (all share Otto's identity + tools)…\n`)
    try {
      const fb = await fallbackChain({
        systemPrompt: opts.systemPrompt,
        history: opts.history,
        userMessage: opts.userMessage,
        onToolCall: opts.onToolCall,
        onToolResult: opts.onToolResult,
        onThought: opts.onThought,
        maxRounds,
      })
      return {
        content: fb.content,
        thoughts: '',
        promptTokens: 0, completionTokens: 0, totalTokens: 0,
        model: `${fb.label} (fallback)`,
        toolCalls: fb.toolCalls,
        toolResults: fb.toolResults,
      }
    } catch (zErr: any) {
      throw new Error(`All brains failed. Gemini: ${geminiErr?.message || geminiErr} | Chain: ${zErr?.message || zErr}`)
    }
  }

  const totalTokens = promptTokens + completionTokens
  await recordUsage(totalTokens)

  return {
    content: allContent,
    thoughts: allThoughts,
    promptTokens,
    completionTokens,
    totalTokens,
    model: 'Otto Perso',
    toolCalls: allToolCalls,
    toolResults: allToolResults,
  }
}

export { LIMITS, PEAK_START, PEAK_END }
