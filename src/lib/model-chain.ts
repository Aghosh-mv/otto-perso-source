// Otto's model fallback chain — multiple Hugging Face models tried in order
// when Gemini (primary) fails, so Otto effectively never runs out of capacity.
// ALL models in the chain receive the SAME Otto system prompt + the SAME tool
// catalog, so the user feels no change when the underlying model shifts — same
// Otto, same tools, same behavior. The active model is transparent in metadata
// only. Free HF token (HF_TOKEN), no card. The 15B+ models run on HF's
// Inference Router (gateway) — never mounted on the Otto server.

import { executeTool, functionDeclarations, type ToolCall, type ToolResult } from '@/lib/otto-tools'

export type ChainModel = { id: string; model: string; label: string }

// Order = priority. Each is tried in turn until one responds. Edit freely.
export const FALLBACK_CHAIN: ChainModel[] = [
  { id: 'zegrate', model: 'yimn-Aghosh/zegrate-ai', label: 'Zegrate AI' },
  { id: 'llama3.3-70b', model: 'meta-llama/Llama-3.3-70B-Instruct', label: 'Llama 3.3 70B' },
  { id: 'qwen2.5-72b', model: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen 2.5 72B' },
  { id: 'mistral-nemo', model: 'mistralai/Mistral-Nemo-Instruct-2407', label: 'Mistral Nemo' },
  { id: 'gemma2-9b', model: 'google/gemma-2-9b-it', label: 'Gemma 2 9B' },
  { id: 'phi3.5', model: 'microsoft/Phi-3.5-mini-instruct', label: 'Phi 3.5' },
  { id: 'hermes3-8b', model: 'NousResearch/Hermes-3-Llama-3.1-8B', label: 'Hermes 3 8B' },
  { id: 'zephyr-7b', model: 'HuggingFaceH4/zephyr-7b-beta', label: 'Zephyr 7B' },
]

const HF_ROUTER = (model: string) => `https://router.huggingface.co/hf-inference/models/${model}/v1/chat/completions`

async function hfCall(token: string, model: string, body: any): Promise<any> {
  const res = await fetch(HF_ROUTER(model), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    const err: any = new Error(`HF ${model} HTTP ${res.status}: ${t.slice(0, 120)}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

// One model, full tool-calling loop (OpenAI-style). Gracefully degrades to
// text-only if the model rejects tools.
export async function hfChatWithTools(opts: {
  model: string
  systemPrompt: string
  history: { role: 'user' | 'assistant'; content: string }[]
  userMessage: string
  onToolCall?: (c: ToolCall) => void
  onToolResult?: (r: ToolResult) => void
  onThought?: (chunk: string) => void
  maxRounds?: number
}): Promise<{ content: string; toolCalls: ToolCall[]; toolResults: ToolResult[] }> {
  const token = process.env.HF_TOKEN
  if (!token) throw new Error('HF_TOKEN not set')
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
      data = await hfCall(token, opts.model, body)
    } catch (e: any) {
      if (toolsEnabled && tools.length && /tool|function|not.*support|400|422/i.test(String(e.message) + String(e.status))) {
        toolsEnabled = false
        const b2 = { ...body }; delete b2.tools; delete b2.tool_choice
        data = await hfCall(token, opts.model, b2)
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
    try {
      opts.onThought?.(`  → trying ${m.label}…\n`)
      const r = await hfChatWithTools({ ...opts, model: m.model })
      return { ...r, modelId: m.id, label: m.label }
    } catch (e: any) {
      opts.onThought?.(`  ✗ ${m.label}: ${String(e?.message || e).slice(0, 80)}\n`)
      continue
    }
  }
  throw new Error('All fallback models failed (chain exhausted).')
}
