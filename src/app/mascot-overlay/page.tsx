'use client'

import { useEffect, useState, useRef } from 'react'
import { OttoMascot } from '@/components/mascot/OttoMascot'
import { DEFAULT_MASCOT, type MascotConfig } from '@/components/mascot/wardrobe'
import { pickProactive, nextDelay, wantsFollowUp, canFireNow, markFired, randomPosition, type Proactive, type ProactiveAction } from '@/components/mascot/proactive'

// Lok overlay — a transparent, frameless, always-on-top Electron window.
// Lok is INDEPENDENT: it pops in on its own schedule (even when you didn't ask),
// can message you more than once, surfaces drafts/work it did while you were
// away, and appears at random spots on screen. Speech bubbles are smooth glass.
// CTAs signal the main app (same-origin localStorage) to open the right view.

const STORAGE_KEY = 'otto.mascot'
declare global {
  interface Window { mascotAPI?: { move: (x: number, y: number) => void; show: () => void; hide: () => void } }
}

function loadConfig(): MascotConfig {
  if (typeof window === 'undefined') return DEFAULT_MASCOT
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_MASCOT, ...JSON.parse(raw) }
  } catch {}
  return DEFAULT_MASCOT
}

export default function MascotOverlayPage() {
  const [cfg, setCfg] = useState<MascotConfig>(DEFAULT_MASCOT)
  const [spoken, setSpoken] = useState<Proactive | null>(null)
  const timers = useRef<number[]>([])

  useEffect(() => {
    setCfg(loadConfig())
    const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) setCfg(loadConfig()) }
    const onMood = (e: StorageEvent) => {
      if (e.key === 'otto.mascot.mood' && e.newValue) {
        setCfg((c) => ({ ...c, mood: e.newValue as string }))
        window.setTimeout(() => {
          setCfg((c) => ({ ...c, mood: 'content' }))
          try { localStorage.removeItem('otto.mascot.mood') } catch {}
        }, 4000)
      }
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('storage', onMood)

    // ─── Proactive engine: Lok decides when to pop in ────────────────────────
    const fire = () => {
      if (!canFireNow(4)) return
      const p = pickProactive()
      setCfg((c) => ({ ...c, mood: p.mood }))
      setSpoken(p)
      markFired()
      // move to a random screen spot
      try {
        const sw = window.screen.availWidth || 1440
        const sh = window.screen.availHeight || 900
        const pos = randomPosition(sw, sh)
        window.mascotAPI?.move(pos.x, pos.y)
        window.mascotAPI?.show()
      } catch {}
      // auto-dismiss the bubble after a while
      const t1 = window.setTimeout(() => setSpoken(null), 14000)
      timers.current.push(t1)
      // sometimes a follow-up nudge
      if (wantsFollowUp()) {
        const t2 = window.setTimeout(() => {
          const p2 = pickProactive()
          setCfg((c) => ({ ...c, mood: p2.mood }))
          setSpoken(p2)
          markFired()
          const t3 = window.setTimeout(() => setSpoken(null), 12000)
          timers.current.push(t3)
        }, 16000)
        timers.current.push(t2)
      }
    }

    // First prompt — even if the user didn't ask. Short delay after launch.
    const first = window.setTimeout(fire, 9000)
    timers.current.push(first)
    // Then on Lok's own randomized schedule.
    const scheduleNext = () => {
      const t = window.setTimeout(() => { fire(); scheduleNext() }, nextDelay())
      timers.current.push(t)
    }
    scheduleNext()

    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('storage', onMood)
      timers.current.forEach(clearTimeout)
    }
  }, [])

  const doCta = (cta?: { label: string; action: ProactiveAction }) => {
    if (!cta || cta.action === 'dismiss') { setSpoken(null); return }
    try { localStorage.setItem('otto.mascot.cta', cta.action) } catch {}
    setSpoken(null)
  }

  return (
    <main
      style={{
        position: 'fixed', inset: 0, background: 'transparent',
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'flex-end',
        ['WebkitAppRegion' as string]: 'drag', cursor: 'grab',
      } as React.CSSProperties}
    >
      {spoken && (
        <div
          style={{
            alignSelf: 'center', maxWidth: 300, marginBottom: 6,
            background: 'rgba(20,20,31,0.72)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
            border: '1px solid rgba(183,148,244,0.35)', borderRadius: 20, padding: '12px 14px',
            color: '#e8e8f0', fontSize: 13, lineHeight: 1.45,
            boxShadow: '0 12px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
            animation: 'lkPop 0.35s cubic-bezier(0.2,0.9,0.3,1.2)',
            ['WebkitAppRegion' as string]: 'no-drag',
          } as React.CSSProperties}
        >
          <div style={{ fontWeight: 600, marginBottom: 4, color: '#b794f4', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Lok</div>
          <div>{spoken.message}</div>
          {spoken.cta && (
            <button
              onClick={() => doCta(spoken.cta!)}
              style={{
                marginTop: 10, padding: '6px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
                background: '#b794f4', color: '#1a1030', fontWeight: 600, fontSize: 12,
                boxShadow: '0 4px 14px rgba(183,148,244,0.4)',
              }}
            >{spoken.cta.label} →</button>
          )}
          <style>{`@keyframes lkPop{from{opacity:0;transform:translateY(8px) scale(.96)}to{opacity:1;transform:none}}`}</style>
        </div>
      )}
      <div style={{ alignSelf: 'center' }}>
        <OttoMascot preset={cfg.preset} skin={cfg.skin} eyeColor={cfg.eyeColor} expressiveness={cfg.expressiveness}
          accessories={cfg.accessories} mood={cfg.mood} size={Math.min(cfg.size || 260, 300)} float />
      </div>
    </main>
  )
}
