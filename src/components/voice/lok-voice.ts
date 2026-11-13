'use client'

// Lok voice — free, client-side, no API key. Uses the Web Speech API
// (speechSynthesis for speaking, SpeechRecognition for listening).
// Works inside Electron (Chromium) and modern browsers.

declare global {
  interface Window {
    webkitSpeechRecognition?: any
    SpeechRecognition?: any
  }
}

let chosenVoice: SpeechSynthesisVoice | null = null

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null
  return (
    voices.find((v) => /Google US English|Samantha|Aria|Jenny|Google Hindi/i.test(v.name)) ||
    voices.find((v) => v.lang.startsWith('en')) ||
    voices[0]
  )
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  chosenVoice = pickVoice()
  window.speechSynthesis.onvoiceschanged = () => { chosenVoice = pickVoice() }
}

export function speak(text: string, opts?: { rate?: number; pitch?: number; volume?: number; onEnd?: () => void }) {
  if (typeof window === 'undefined' || !window.speechSynthesis) { opts?.onEnd?.(); return }
  const u = new SpeechSynthesisUtterance(text)
  u.rate = opts?.rate ?? 1.04
  u.pitch = opts?.pitch ?? 1.15
  u.volume = opts?.volume ?? 1
  if (!chosenVoice) chosenVoice = pickVoice()
  if (chosenVoice) u.voice = chosenVoice
  if (opts?.onEnd) u.onend = opts.onEnd
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
}

export function stopSpeaking() {
  if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel()
}

export function isSpeaking(): boolean {
  return typeof window !== 'undefined' && !!window.speechSynthesis?.speaking
}

export type Listener = { start: () => void; stop: () => void; abort: () => void } | null

export function createListener(opts: {
  onHeard: (text: string) => void
  onError?: (e: string) => void
  continuous?: boolean
  lang?: string
}): Listener {
  if (typeof window === 'undefined') return null
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) return null
  const rec = new SR()
  rec.continuous = opts.continuous ?? true
  rec.interimResults = false
  rec.lang = opts.lang || 'en-US'
  rec.onresult = (e: any) => {
    const last = e.results[e.results.length - 1]
    if (last && last[0]) opts.onHeard(String(last[0].transcript).trim().toLowerCase())
  }
  rec.onerror = (e: any) => opts.onError?.(String(e.error || 'unknown'))
  return {
    start: () => { try { rec.start() } catch {} },
    stop: () => { try { rec.stop() } catch {} },
    abort: () => { try { rec.abort() } catch {} },
  }
}

// Wake-word detector — listens continuously for "hey otto" / "ok otto".
export function startWakeWord(onWake: (fullPhrase: string) => void): Listener {
  const l = createListener({
    onHeard: (text) => { if (/\b(hey|ok|okay)\s+otto\b/.test(text)) onWake(text) },
    continuous: true,
  })
  l?.start()
  return l
}
