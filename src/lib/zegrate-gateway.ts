// Zegrate gateway — a remote fallback brain for when Gemini is down/quota.
// Calls yimn-Aghosh/zegrate-ai (a 15B conversational model — the user's old
// project) via Hugging Face's Inference Router (chat-completions compatible).
// The model is too big to host on the Otto server, so this is a GATEWAY only:
// it sends the conversation to HF, which runs the model, and returns the text.
// Free HF token (HF_TOKEN) — no card. Text-only (no tool-calling) fallback.

const ZEGRATE_MODEL = 'yimn-Aghosh/zegrate-ai'
const HF_ROUTER = `https://router.huggingface.co/hf-inference/models/${ZEGRATE_MODEL}/v1/chat/completions`

export async function zegrateComplete(opts: {
  systemPrompt: string
  history: { role: 'user' | 'assistant'; content: string }[]
  userMessage: string
}): Promise<string> {
  const token = process.env.HF_TOKEN
  if (!token) throw new Error('HF_TOKEN not set — cannot fall back to Zegrate. Get a free token at huggingface.co/settings/tokens.')
  // Keep recent context only — 15B has a smaller window than Gemini.
  const messages = [
    { role: 'system', content: opts.systemPrompt },
    ...opts.history.slice(-6),
    { role: 'user', content: opts.userMessage },
  ]
  const res = await fetch(HF_ROUTER, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, max_tokens: 1024, temperature: 0.7 }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Zegrate gateway HTTP ${res.status}: ${t.slice(0, 200)}`)
  }
  const data: any = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error('Zegrate gateway returned no text')
  return String(text)
}
