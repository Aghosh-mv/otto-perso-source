// Zegrate gateway — remote fallback brain (yimn-Aghosh/zegrate-ai, 15B) via
// Hugging Face's Inference Router. The 15B runs on HF, NOT on the Otto server
// (gateway only). Free HF token (HF_TOKEN), no card.
//
// zegrateChatWithTools does a full OpenAI-style function-calling loop: passes
// Otto's tool declarations to the model, executes any tool_calls via executeTool,
// feeds results back, and loops until a final text answer. So Zegrate (your
// fallback model) keeps full tool access when it takes over from Gemini — it's
// not degraded to text-only.
//
// If the model doesn't emit tool_calls (or the endpoint rejects tools), it
// gracefully falls back to text-only. Best of both.

import { executeTool, functionDeclarations, type ToolCall, type ToolResult } from '@/lib/otto-tools'

const ZEGRATE_MODEL = 'yimn-Aghosh/zegrate-ai'
const HF_ROUTER = `https://router.huggingface.co/hf-inference/models/${ZEGRATE_MODEL}/v1/chat/completions`

async function hfChat(token: string, body: any): Promise<any> {
  const res = await fetch(HF_ROUTER, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    const err: any = new Error(`Zegrate gateway HTTP ${res.status}: ${t.slice(0, 180)}`)
    err.status = res.status
    err.body = t
    throw err
  }
  return res.json()
}

export async function zegrateChatWithTools(opts: {
  systemPrompt: string
  history: { role: 'user' | 'assistant'; content: string }[]
  userMessage: string
  onToolCall?: (c: ToolCall) => void
  onToolResult?: (r: ToolResult) => void
  onThought?: (chunk: string) => void
  maxRounds?: number
}): Promise<{ content: string; toolCalls: ToolCall[]; toolResults: ToolResult[] }> {
  const token = process.env.HF_TOKEN
  if (!token) throw new Error('HF_TOKEN not set — cannot fall back to Zegrate. Free token: huggingface.co/settings/tokens')
  const tools = functionDeclarations().map((d) => ({ type: 'function', function: d }))
  const messages: any[] = [
    { role: 'system', content: opts.systemPrompt },
    ...opts.history.slice(-6), // 15B — keep recent context only
    { role: 'user', content: opts.userMessage },
  ]
  const toolCalls: ToolCall[] = []
  const toolResults: ToolResult[] = []
  const maxRounds = opts.maxRounds ?? 4
  let toolsEnabled = true

  for (let round = 0; round < maxRounds; round++) {
    const body: any = { messages, max_tokens: 1024, temperature: 0.7 }
    if (toolsEnabled && tools.length) {
      body.tools = tools
      body.tool_choice = 'auto'
    }
    let data: any
    try {
      data = await hfChat(token, body)
    } catch (e: any) {
      // If the endpoint rejects tools, retry this round text-only.
      if (toolsEnabled && tools.length && /tool|function|not.*support|400|422/i.test(String(e.message) + String(e.status))) {
        toolsEnabled = false
        const b2 = { ...body }; delete b2.tools; delete b2.tool_choice
        data = await hfChat(token, b2)
      } else {
        throw e
      }
    }
    const msg = data?.choices?.[0]?.message
    if (!msg) throw new Error('Zegrate gateway returned no message')
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
      continue // model sees tool results, next round
    }
    // no tool calls (or tools disabled) — final answer
    return { content: String(msg.content || ''), toolCalls, toolResults }
  }
  return { content: '(Zegrate reached max tool rounds)', toolCalls, toolResults }
}

// Text-only version (kept for callers that don't want tools).
export async function zegrateComplete(opts: {
  systemPrompt: string
  history: { role: 'user' | 'assistant'; content: string }[]
  userMessage: string
}): Promise<string> {
  const r = await zegrateChatWithTools({ ...opts, maxRounds: 1 })
  return r.content
}
