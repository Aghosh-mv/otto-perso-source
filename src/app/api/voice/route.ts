import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { streamChat } from '@/lib/otto-brain'

// /api/voice — a lightweight voice-conversation endpoint for the "Hey Otto"
// voice call. Takes { message }, returns { reply }. Uses the same Otto brain
// (Gemini + tools) but with a concise, speakable system prompt — voice replies
// are short and conversational, no markdown.

const VOICE_SYSTEM = `You are Otto, the user's personal AI agent, talking to them out loud over voice.
Reply briefly and conversationally — usually one short sentence, two at most,
since the user hears you spoken. No markdown, no bullet lists, no code blocks.
Just talk naturally and warmly. If the user asks you to do something that needs
a tool (search, read a file, check weather, etc.), use it — then tell them the
result in one sentence. Sign off subtly; don't say "as an AI".`

export async function POST(req: Request) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { message } = await req.json()
  if (!message || typeof message !== 'string') {
    return NextResponse.json({ error: 'message required' }, { status: 400 })
  }
  try {
    const result = await streamChat({
      systemPrompt: VOICE_SYSTEM,
      history: [],
      userMessage: message,
    })
    return NextResponse.json({ reply: result.content })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'voice failed' }, { status: 500 })
  }
}
