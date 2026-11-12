'use client'

import { useEffect, useRef, useState } from 'react'
import { useOtto } from '@/components/otto/store'
import { speak, stopSpeaking, createListener, startWakeWord, type Listener } from './lok-voice'

// "Hey Otto" voice call — a small floating mic that's always listening for the
// wake word. When you say "hey Otto", Lok answers out loud (knowing which tab
// you're in), then takes a voice command, hits /api/voice, and speaks the reply.
// Loops until you say "stop"/"bye". Small speech caption only — voice is primary.

const VIEW_LABELS: Record<string, string> = {
  chat: 'Chat', dashboard: 'Dashboard', autonomy: 'Autonomy', tasks: 'Tasks',
  agents: 'Agents', bots: 'Bots', vault: 'Vault', credentials: 'Credentials',
  models: 'Models', recipes: 'Recipes', timeline: 'Timeline', analytics: 'Analytics',
  settings: 'Settings', wardrobe: 'the Lok wardrobe',
}

type Mode = 'idle' | 'listening' | 'thinking' | 'speaking'

export function VoiceCall() {
  const { view } = useOtto()
  const [mode, setMode] = useState<Mode>('idle')
  const [caption, setCaption] = useState('')
  const [supported, setSupported] = useState(true)
  const wake = useRef<Listener>(null)
  const cmd = useRef<Listener>(null)
  const active = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR || !window.speechSynthesis) { setSupported(false); return }
    wake.current = startWakeWord(() => activate())
    return () => { wake.current?.abort(); cmd.current?.abort(); stopSpeaking() }
  }, [])

  async function activate() {
    if (active.current) return
    active.current = true
    setMode('speaking')
    const where = VIEW_LABELS[view] || 'Otto'
    const greeting = `hey — you're in ${where}. what's up?`
    setCaption(greeting)
    speak(greeting, { onEnd: () => listenForCommand() })
  }

  function listenForCommand() {
    setMode('listening')
    setCaption('listening…')
    cmd.current?.abort()
    cmd.current = createListener({
      continuous: false,
      onHeard: async (text) => {
        if (/\b(stop|bye|that'?s all|never ?mind|quiet|shush)\b/.test(text)) {
          setMode('speaking'); setCaption("okay — i'm here if you need me.")
          speak("okay, i'm here if you need me.", { onEnd: () => { setMode('idle'); setCaption(''); active.current = false } })
          return
        }
        setMode('thinking'); setCaption(`"${text}"`)
        try {
          const r = await fetch('/api/voice', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text }),
          })
          const data = await r.json()
          const reply = data.reply || "hmm, i didn't catch that."
          setMode('speaking'); setCaption(reply)
          speak(reply, { onEnd: () => listenForCommand() })
        } catch {
          setMode('speaking'); setCaption('sorry — something broke. try again.')
          speak('sorry, something broke. try again.', { onEnd: () => { setMode('idle'); setCaption(''); active.current = false } })
        }
      },
      onError: () => { setMode('idle'); setCaption(''); active.current = false },
    })
    cmd.current?.start()
  }

  if (!supported) return null

  const color =
    mode === 'speaking' ? '#b794f4' :
    mode === 'listening' ? '#6ee7b7' :
    mode === 'thinking' ? '#fbbf24' : '#3a3a52'

  return (
    <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
      {caption && (
        <div style={bubbleStyle(color)}>{caption}</div>
      )}
      <button
        onClick={() => (active.current ? (cmd.current?.abort(), stopSpeaking(), setMode('idle'), setCaption(''), active.current = false) : activate())}
        title='Say "Hey Otto" — or click to start a voice call'
        style={{
          width: 52, height: 52, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: color, boxShadow: `0 8px 26px ${color}66, 0 0 0 4px rgba(255,255,255,0.06)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background .2s, box-shadow .2s', animation: mode === 'idle' ? 'vcPulse 2.4s infinite' : 'none',
        }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" fill="#1a1030"/>
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="#1a1030" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>
      <style>{`
        @keyframes vcPulse{0%,100%{box-shadow:0 8px 26px #3a3a5266,0 0 0 0 rgba(183,148,244,.35)}50%{box-shadow:0 8px 26px #3a3a5266,0 0 0 10px rgba(183,148,244,0)}}}
      `}</style>
    </div>
  )
}

function bubbleStyle(color: string): React.CSSProperties {
  return {
    maxWidth: 260, padding: '9px 13px', borderRadius: 16,
    background: 'rgba(20,20,31,0.78)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    border: `1px solid ${color}55`, color: '#e8e8f0', fontSize: 12.5, lineHeight: 1.4,
    boxShadow: '0 10px 30px rgba(0,0,0,0.4)', fontWeight: 400,
  }
}
