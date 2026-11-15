// Otto's model fallback chain — multiple Hugging Face models tried in order
// when Gemini (primary) fails, so Otto effectively never runs out of capacity.
// ALL models in the chain receive the SAME Otto system prompt + the SAME tool
// catalog, so the user feels no change when the underlying model shifts — same
// Otto, same tools, same behavior. The active model is transparent in metadata
// only. Free HF token (HF_TOKEN), no card. The 15B+ models run on HF's
// Inference Router (gateway) — never mounted on the Otto server.

import { executeTool, functionDeclarations, type ToolCall, type ToolResult } from '@/lib/otto-tools'

export type ChainModel = { id: string; model: string; label: string; kind?: 'router' | 'space'; spaceUrlEnv?: string }

// The user's exact chain (Gemini primary, not listed here). Tried in order.
// GLM-5.3-Flash is loaded ONLY from an HF Space (GLM_SPACE_URL env) — never via
// the router or any external URL, per instruction. If GLM_SPACE_URL isn't set,
// GLM is skipped (the chain continues to the next model).
export const FALLBACK_CHAIN: ChainModel[] = [
  { id: 'zegrate', model: 'yimn-Aghosh/zegrate-ai', label: 'Zegrate AI' },
  { id: 'deepseek-r1', model: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek R1' },
  { id: 'qwen3', model: 'Qwen/Qwen3-32B', label: 'Qwen3 32B' },
  { id: 'deepseek-v4.1-flash', model: 'deepseek-ai/DeepSeek-V4.1-Flash', label: 'DeepSeek V4.1 Flash' },
  { id: 'deepseek-v4-pro', model: 'deepseek-ai/DeepSeek-V4-Pro', label: 'DeepSeek V4 Pro' },
  { id: 'qwen3.6-27b', model: 'Qwen/Qwen3.6-27B', label: 'Qwen3.6 27B' },
  { id: 'kimi-k2.6', model: 'moonshotai/Kimi-K2.6', label: 'Kimi K2.6' },
  { id: 'glm-5.3-flash', model: 'zai-org/GLM-5.3-Flash', label: 'GLM-5.3 Flash', kind: 'space', spaceUrlEnv: 'GLM_SPACE_URL' },
  { id: 'phi-4', model: 'microsoft/Phi-4', label: 'Phi-4' },
  { id: 'qwen3.8-27b', model: 'Qwen/Qwen3.8-27B', label: 'Qwen3.8 27B' },
]

const HF_ROUTER = (model: string) => `https://router.huggingface.co/hf-inference/models/${model}/v1/chat/completions`

function endpointFor(m: ChainModel): string | null {
  if (m.kind === 'space') {
    // GLM: only from an HF Space URL — never the router or external URLs.
    const url = process.env[m.spaceUrlEnv || '']
    if (!url) return null // skip — no Space configured
    return `${url.replace(/\/$/, '')}/v1/chat/completions`
  }
  return HF_ROUTER(m.model)
}

async function hfCall(endpoint: string, body: any, token?: string): Promise<any> {
  const headers: any = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    const err: any = new Error(`HTTP ${res.status}: ${t.slice(0, 120)}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

// One model, full tool-calling loop (OpenAI-style). Gracefully degrades to
// text-only if the model rejects tools.
export async function hfChatWithTools(opts: {
  entry: ChainModel
  systemPrompt: string
  history: { role: 'user' | 'assistant'; content: string }[]
  userMessage: string
  onToolCall?: (c: ToolCall) => void
  onToolResult?: (r: ToolResult) => void
  onThought?: (chunk: string) => void
  maxRounds?: number
}): Promise<{ content: string; toolCalls: ToolCall[]; toolResults: ToolResult[] }> {
  const endpoint = endpointFor(opts.entry)
  if (!endpoint) throw new Error(`skipped (${opts.entry.label}: no Space URL configured)`)
  const token = process.env.HF_TOKEN // optional for Spaces (router needs it)
  const tools = functionDeclarations().map((d) => ({ type: 'function', function: d }))
  const messages: any[] = [
    { role: 'system', content: opts.systemPrompt },
    ...opts.history.slice(-6),
    { role: 'user', content: opts.userMessage },
  ]
  const toolCalls: ToolCall[] = []
  const toolResults: ToolResult[] = []
  const maxRounds = opts.maxRounds ?? 4
  let toolsEnabled = true

  for (let round = 0; round < maxRounds; round++) {
    const body: any = { messages, max_tokens: 1024, temperature: 0.7 }
    if (toolsEnabled && tools.length) { body.tools = tools; body.tool_choice = 'auto' }
    let data: any
    try {
      data = await hfCall(endpoint, body, token)
    } catch (e: any) {
      if (toolsEnabled && tools.length && /tool|function|not.*support|400|422/i.test(String(e.message) + String(e.status))) {
        toolsEnabled = false
        const b2 = { ...body }; delete b2.tools; delete b2.tool_choice
        data = await hfCall(endpoint, b2, token)
      } else { throw e }
    }
    const msg = data?.choices?.[0]?.message
    if (!msg) throw new Error('no message in response')
    const calls = msg.tool_calls
    if (calls && calls.length && toolsEnabled) {
      messages.push({ role: 'assistant', content: msg.content || '', tool_calls: calls })
      for (const tc of calls) {
        const name = tc.function?.name
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(tc.function?.arguments || '{}') } catch {}
        const call: ToolCall = { name, args }
        toolCalls.push(call)
        opts.onToolCall?.(call)
        opts.onThought?.(`  → ${name}\n`)
        const result = await executeTool(call)
        toolResults.push(result)
        opts.onToolResult?.(result)
        opts.onThought?.(`    ${result.summary}\n`)
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ ok: result.ok, summary: result.summary, data: result.data }) })
      }
      continue
    }
    return { content: String(msg.content || ''), toolCalls, toolResults }
  }
  return { content: '(max tool rounds reached)', toolCalls, toolResults }
}

// Try the chain in order; return the first model that succeeds. All share the
// same Otto system prompt + tools, so the handoff is seamless to the user.
export async function fallbackChain(opts: {
  systemPrompt: string
  history: { role: 'user' | 'assistant'; content: string }[]
  userMessage: string
  onToolCall?: (c: ToolCall) => void
  onToolResult?: (r: ToolResult) => void
  onThought?: (chunk: string) => void
  maxRounds?: number
}): Promise<{ content: string; toolCalls: ToolCall[]; toolResults: ToolResult[]; modelId: string; label: string }> {
  for (const m of FALLBACK_CHAIN) {
    if (m.kind === 'space' && !process.env[m.spaceUrlEnv || '']) {
      opts.onThought?.(`  ⊘ ${m.label}: skipped (no Space URL set)\n`)
      continue
    }
    try {
      opts.onThought?.(`  → trying ${m.label}…\n`)
      const r = await hfChatWithTools({ ...opts, entry: m })
      return { ...r, modelId: m.id, label: m.label }
    } catch (e: any) {
      opts.onThought?.(`  ✗ ${m.label}: ${String(e?.message || e).slice(0, 80)}\n`)
      continue
    }
  }
  throw new Error('All fallback models failed (chain exhausted).')
}
