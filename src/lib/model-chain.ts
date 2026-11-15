// Otto's model fallback chain — multiple models across MULTIPLE free providers
// (Hugging Face + Groq + OpenRouter) tried in order when Gemini fails. Each
// provider has its OWN rate limit, so the chain draws from 3 independent free
// tiers — much more resilient than a single provider. ALL models receive the
// SAME Otto system prompt + tool catalog → seamless handoff. Free tokens, no card.

import { executeTool, functionDeclarations, type ToolCall, type ToolResult } from '@/lib/otto-tools'

export type ChainModel = {
  id: string
  model: string
  label: string
  provider: 'hf' | 'groq' | 'openrouter' | 'zai' | 'space'
  tokenEnv?: string   // which env var holds the API key
  spaceUrlEnv?: string // for 'space' provider only
}

// Chain order: HF models first, then Groq (fast + generous free tier), then
// OpenRouter (free models). Each provider is skipped if its token isn't set.
export const FALLBACK_CHAIN: ChainModel[] = [
  // ── Hugging Face (HF_TOKEN) ──
  { id: 'zegrate', model: 'yimn-Aghosh/zegrate-ai', label: 'Zegrate AI', provider: 'hf', tokenEnv: 'HF_TOKEN' },
  { id: 'deepseek-r1', model: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek R1', provider: 'hf', tokenEnv: 'HF_TOKEN' },
  { id: 'qwen3', model: 'Qwen/Qwen3-32B', label: 'Qwen3 32B', provider: 'hf', tokenEnv: 'HF_TOKEN' },
  { id: 'deepseek-v4.1-flash', model: 'deepseek-ai/DeepSeek-V4.1-Flash', label: 'DeepSeek V4.1 Flash', provider: 'hf', tokenEnv: 'HF_TOKEN' },
  { id: 'qwen3.6-27b', model: 'Qwen/Qwen3.6-27B', label: 'Qwen3.6 27B', provider: 'hf', tokenEnv: 'HF_TOKEN' },
  { id: 'glm-5.3-flash', model: 'glm-4-flash', label: 'GLM-4 Flash (Z.ai)', provider: 'zai', tokenEnv: 'GLM_API_KEY' },
  { id: 'phi-4', model: 'microsoft/Phi-4', label: 'Phi-4', provider: 'hf', tokenEnv: 'HF_TOKEN' },
  { id: 'qwen3.8-27b', model: 'Qwen/Qwen3.8-27B', label: 'Qwen3.8 27B', provider: 'hf', tokenEnv: 'HF_TOKEN' },
  // ── Groq (GROQ_API_KEY — free, 30 RPM / 14,400/day, very fast) ──
  { id: 'groq-llama3.3-70b', model: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (Groq)', provider: 'groq', tokenEnv: 'GROQ_API_KEY' },
  { id: 'groq-mixtral', model: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B (Groq)', provider: 'groq', tokenEnv: 'GROQ_API_KEY' },
  { id: 'groq-gemma2-9b', model: 'gemma2-9b-it', label: 'Gemma 2 9B (Groq)', provider: 'groq', tokenEnv: 'GROQ_API_KEY' },
  { id: 'groq-llama3.1-8b', model: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (Groq)', provider: 'groq', tokenEnv: 'GROQ_API_KEY' },
  // ── OpenRouter (OPENROUTER_API_KEY — free models, 20 RPM) ──
  { id: 'or-llama3.3-70b', model: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (OpenRouter)', provider: 'openrouter', tokenEnv: 'OPENROUTER_API_KEY' },
  { id: 'or-qwen2.5-7b', model: 'qwen/qwen-2.5-7b-instruct:free', label: 'Qwen 2.5 7B (OpenRouter)', provider: 'openrouter', tokenEnv: 'OPENROUTER_API_KEY' },
  { id: 'or-gemma2-9b', model: 'google/gemma-2-9b-it:free', label: 'Gemma 2 9B (OpenRouter)', provider: 'openrouter', tokenEnv: 'OPENROUTER_API_KEY' },
  { id: 'or-mistral-7b', model: 'mistralai/mistral-7b-instruct:free', label: 'Mistral 7B (OpenRouter)', provider: 'openrouter', tokenEnv: 'OPENROUTER_API_KEY' },
]

function providerEndpoint(m: ChainModel): string | null {
  switch (m.provider) {
    case 'hf': return `https://router.huggingface.co/hf-inference/models/${m.model}/v1/chat/completions`
    case 'groq': return 'https://api.groq.com/openai/v1/chat/completions'
    case 'openrouter': return 'https://openrouter.ai/api/v1/chat/completions'
    case 'zai': return 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
    default: return null
  }
}

function providerToken(m: ChainModel): string | undefined {
  return process.env[m.tokenEnv || '']
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
  const endpoint = providerEndpoint(opts.entry)
  if (!endpoint) throw new Error(`skipped (${opts.entry.label}: no endpoint configured)`)
  const token = providerToken(opts.entry)
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
    // Groq + OpenRouter need the model name in the body (HF has it in the URL)
    if (opts.entry.provider === 'groq' || opts.entry.provider === 'openrouter' || opts.entry.provider === 'zai') body.model = opts.entry.model
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
    // Skip if the provider's token isn't configured
    if (!process.env[m.tokenEnv || '']) { opts.onThought?.(`  ⊘ ${m.label}: skipped (no ${m.tokenEnv})\n`); continue }
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
