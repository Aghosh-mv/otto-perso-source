'use client'

import { useState } from 'react'
import { OttoMascot } from '@/components/mascot/OttoMascot'
import { SKINS, ACCESSORIES, MOODS, DEFAULT_MASCOT, BACK_ACCESSORIES, type MascotConfig } from '@/components/mascot/wardrobe'

// Wardrobe — customize Lok (Otto's mascot). Pick a skin, toggle accessories,
// set a mood. Selection persists to localStorage and is picked up live by the
// desktop overlay. Includes a "Notify me" demo that triggers the alert emote.

const STORAGE_KEY = 'otto.mascot'

const HAT_IDS = ACCESSORIES.filter((a) => a.group === 'hat').map((a) => a.id)
const EYE_IDS = ACCESSORIES.filter((a) => a.group === 'eyewear').map((a) => a.id)

export function WardrobeView() {
  const [cfg, setCfg] = useState<MascotConfig>(() => {
    if (typeof window === 'undefined') return DEFAULT_MASCOT
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) return { ...DEFAULT_MASCOT, ...JSON.parse(raw) }
    } catch {}
    return DEFAULT_MASCOT
  })
  const [acc, setAcc] = useState<Set<string>>(new Set(cfg.accessories))

  const persist = (next: MascotConfig) => {
    setCfg(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {}
  }

  const setSkin = (skin: string) => persist({ ...cfg, skin })
  const setMood = (mood: string) => persist({ ...cfg, mood })
  const toggleAcc = (id: string) => {
    const next = new Set(acc)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
      // mutual exclusion: one hat, one eyewear at a time
      if (HAT_IDS.includes(id)) HAT_IDS.forEach((h) => h !== id && next.delete(h))
      if (EYE_IDS.includes(id)) EYE_IDS.forEach((h) => h !== id && next.delete(h))
    }
    setAcc(next)
    persist({ ...cfg, accessories: [...next] })
  }

  const randomize = () => {
    const skin = SKINS[Math.floor(Math.random() * SKINS.length)].id
    const hat = HAT_IDS[Math.floor(Math.random() * (HAT_IDS.length + 1)) - 1]
    const eye = EYE_IDS[Math.floor(Math.random() * (EYE_IDS.length + 1)) - 1]
    const extras = ['bowtie', 'mustache', 'headphones', 'scarf', 'mittens', 'wings', 'cape']
    const extra = extras[Math.floor(Math.random() * (extras.length + 1)) - 1]
    const nextAcc = new Set<string>([hat, eye, extra].filter(Boolean) as string[])
    const mood = MOODS[Math.floor(Math.random() * MOODS.length)].id
    setAcc(nextAcc)
    persist({ skin, accessories: [...nextAcc], mood })
  }

  const notify = () => {
    persist({ ...cfg, mood: 'alert' })
    try {
      localStorage.setItem('otto.mascot.mood', 'alert')
      window.setTimeout(() => {
        localStorage.removeItem('otto.mascot.mood')
        persist({ ...cfg, mood: 'content' })
      }, 4000)
    } catch {}
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', height: '100%', minHeight: 540 }}>
      {/* stage */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background:
            'radial-gradient(900px 600px at 30% 20%, #1a1730 0%, transparent 60%), radial-gradient(700px 500px at 80% 80%, #15102a 0%, transparent 60%), #0b0b12',
        }}
      >
        <OttoMascot skin={cfg.skin} accessories={cfg.accessories} mood={cfg.mood} size={320} />
      </div>

      {/* panel */}
      <div style={{ background: '#14141f', borderLeft: '1px solid #262636', padding: 20, overflowY: 'auto', color: '#e8e8f0' }}>
        <h1 style={{ fontSize: 16, margin: '0 0 4px' }}>Lok — your Otto companion</h1>
        <p style={{ color: '#8a8aa0', fontSize: 12, margin: '0 0 18px' }}>
          A floating desktop buddy. Appears anywhere on screen to notify you. Fully dressable.
        </p>

        <section style={{ marginBottom: 18 }}>
          <h2 style={groupH}>Skin</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
            {SKINS.map((s) => (
              <button
                key={s.id}
                title={s.name}
                onClick={() => setSkin(s.id)}
                style={{
                  aspectRatio: 1,
                  borderRadius: '50%',
                  border: `2px solid ${cfg.skin === s.id ? '#fff' : 'transparent'}`,
                  transform: cfg.skin === s.id ? 'scale(1.08)' : 'scale(1)',
                  cursor: 'pointer',
                  background: `radial-gradient(circle at 35% 30%, ${s.a}, ${s.b} 55%, ${s.c})`,
                }}
              />
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 18 }}>
          <h2 style={groupH}>Outfit &amp; accessories</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ACCESSORIES.map((a) => (
              <span
                key={a.id}
                onClick={() => toggleAcc(a.id)}
                style={chipStyle(acc.has(a.id))}
              >
                {a.label}
              </span>
            ))}
          </div>
          <p style={{ color: '#8a8aa0', fontSize: 11, marginTop: 8 }}>
            One hat + one eyewear at a time. Body items stack freely.
          </p>
        </section>

        <section style={{ marginBottom: 18 }}>
          <h2 style={groupH}>Mood / emote</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
            {MOODS.map((m) => (
              <button
                key={m.id}
                title={m.label}
                onClick={() => setMood(m.id)}
                style={{
                  fontSize: 20,
                  aspectRatio: 1,
                  borderRadius: 10,
                  background: cfg.mood === m.id ? '#2a2342' : '#1e1e2e',
                  border: `1px solid ${cfg.mood === m.id ? '#b794f4' : '#262636'}`,
                  cursor: 'pointer',
                }}
              >
                {m.emoji}
              </button>
            ))}
          </div>
        </section>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={randomize} style={btnStyle}>🎲 Randomize</button>
          <button onClick={notify} style={{ ...btnStyle, background: '#b794f4', color: '#1a1030', borderColor: '#b794f4', fontWeight: 600 }}>
            🔔 Notify me
          </button>
        </div>
        <p style={{ color: '#8a8aa0', fontSize: 11, marginTop: 14, lineHeight: 1.5 }}>
          In the desktop app, Lok lives as a transparent always-on-top overlay window. It pops in
          with an alert emote when Otto finishes a task or has a message, then chills (or sleeps)
          when idle. Drag it anywhere on screen.
        </p>
      </div>
    </div>
  )
}

const groupH: React.CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: '#8a8aa0',
  margin: '0 0 8px',
  fontWeight: 600,
}
const chipStyle = (on: boolean): React.CSSProperties => ({
  fontSize: 11,
  padding: '5px 9px',
  borderRadius: 999,
  background: on ? '#b794f4' : '#1e1e2e',
  color: on ? '#1a1030' : '#e8e8f0',
  border: `1px solid ${on ? '#b794f4' : '#262636'}`,
  fontWeight: on ? 600 : 400,
  cursor: 'pointer',
  userSelect: 'none',
})
const btnStyle: React.CSSProperties = {
  flex: 1,
  padding: 9,
  borderRadius: 10,
  border: '1px solid #262636',
  background: '#1e1e2e',
  color: '#e8e8f0',
  fontSize: 12,
  cursor: 'pointer',
}
