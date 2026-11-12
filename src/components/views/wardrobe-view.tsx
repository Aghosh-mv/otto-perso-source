'use client'

import { useState, useEffect } from 'react'
import { OttoMascot } from '@/components/mascot/OttoMascot'
import {
  SKINS, ACCESSORIES, MOODS, PRESETS, EYE_COLORS, DEFAULT_MASCOT, type MascotConfig,
} from '@/components/mascot/wardrobe'
import { fetchMascotConfig, saveMascotConfig } from '@/components/mascot/sync'

// Wardrobe — customize Lok. Body preset, skin, eye color, expressiveness, size,
// accessories (grouped, incl. an opt-in Spicy pack of cheeky non-explicit gags),
// and mood. Persists to localStorage; the desktop overlay picks it up live.

const STORAGE_KEY = 'otto.mascot'
const HAT_IDS = ACCESSORIES.filter((a) => a.group === 'hat').map((a) => a.id)
const EYE_IDS = ACCESSORIES.filter((a) => a.group === 'eyewear').map((a) => a.id)
const GROUPS: { id: 'hat' | 'eyewear' | 'face' | 'body' | 'spicy'; label: string }[] = [
  { id: 'hat', label: 'Hats' },
  { id: 'eyewear', label: 'Eyewear' },
  { id: 'face', label: 'Face' },
  { id: 'body', label: 'Body & hands & back' },
  { id: 'spicy', label: 'Spicy (opt-in)' },
]

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
  const [showSpicy, setShowSpicy] = useState(false)

  // Sync mascot config from the DB (cross-device) on mount.
  useEffect(() => {
    fetchMascotConfig().then((c) => { setCfg(c); setAcc(new Set(c.accessories)) })
  }, [])

  const persist = (next: MascotConfig) => {
    setCfg(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
    saveMascotConfig(next) // DB-backed — travels to other devices on the account
  }
  const set = <K extends keyof MascotConfig>(k: K, v: MascotConfig[K]) => persist({ ...cfg, [k]: v })
  const toggleAcc = (id: string) => {
    const next = new Set(acc)
    if (next.has(id)) next.delete(id)
    else {
      next.add(id)
      if (HAT_IDS.includes(id)) HAT_IDS.forEach((h) => h !== id && next.delete(h))
      if (EYE_IDS.includes(id)) EYE_IDS.forEach((h) => h !== id && next.delete(h))
    }
    setAcc(next)
    persist({ ...cfg, accessories: [...next] })
  }

  const randomize = () => {
    const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]
    const skin = pick(SKINS).id
    const preset = pick(PRESETS).id
    const eyeColor = pick(EYE_COLORS).id
    const mood = pick(MOODS).id
    const expressiveness = Math.round(Math.random() * 100) / 100
    const hat = HAT_IDS[Math.floor(Math.random() * (HAT_IDS.length + 1)) - 1]
    const eye = EYE_IDS[Math.floor(Math.random() * (EYE_IDS.length + 1)) - 1]
    const extras = ['bowtie', 'mustache', 'headphones', 'scarf', 'mittens', 'wings', 'cape', 'halo', 'devils_advocate', 'jetpack']
    const extra = extras[Math.floor(Math.random() * (extras.length + 1)) - 1]
    const nextAcc = new Set<string>([hat, eye, extra].filter(Boolean) as string[])
    setAcc(nextAcc)
    persist({ ...cfg, skin, preset, eyeColor, mood, expressiveness, accessories: [...nextAcc] })
  }

  const notify = () => {
    persist({ ...cfg, mood: 'alert' })
    try {
      localStorage.setItem('otto.mascot.mood', 'alert')
      setTimeout(() => { localStorage.removeItem('otto.mascot.mood'); persist({ ...cfg, mood: 'content' }) }, 4000)
    } catch {}
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', height: '100%', minHeight: 560 }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(900px 600px at 30% 20%, #1a1730 0%, transparent 60%), radial-gradient(700px 500px at 80% 80%, #15102a 0%, transparent 60%), #0b0b12' }}>
        <OttoMascot preset={cfg.preset} skin={cfg.skin} eyeColor={cfg.eyeColor} expressiveness={cfg.expressiveness}
          accessories={cfg.accessories} mood={cfg.mood} size={cfg.size} />
      </div>

      <div style={{ background: '#14141f', borderLeft: '1px solid #262636', padding: 18, overflowY: 'auto', color: '#e8e8f0' }}>
        <h1 style={{ fontSize: 16, margin: '0 0 4px' }}>Lok — your Otto companion</h1>
        <p style={{ color: '#8a8aa0', fontSize: 12, margin: '0 0 16px' }}>Shape, dress, and tune your floating buddy. Drag it anywhere on screen.</p>

        <section style={{ marginBottom: 16 }}>
          <h2 style={groupH}>Body</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {PRESETS.map((p) => (
              <span key={p.id} title={p.blurb} onClick={() => set('preset', p.id)} style={chipStyle(cfg.preset === p.id)}>{p.label}</span>
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 16 }}>
          <h2 style={groupH}>Skin</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 7 }}>
            {SKINS.map((s) => (
              <button key={s.id} title={s.name} onClick={() => set('skin', s.id)} style={{
                aspectRatio: 1, borderRadius: '50%', border: `2px solid ${cfg.skin === s.id ? '#fff' : 'transparent'}`,
                transform: cfg.skin === s.id ? 'scale(1.08)' : 'scale(1)', cursor: 'pointer',
                background: `radial-gradient(circle at 35% 30%, ${s.a}, ${s.b} 55%, ${s.c})`,
              }} />
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 16 }}>
          <h2 style={groupH}>Eye color</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {EYE_COLORS.map((e) => (
              <span key={e.id} title={e.name} onClick={() => set('eyeColor', e.color)} style={{
                ...chipStyle(cfg.eyeColor === e.color),
                borderBottom: `3px solid ${e.color}`,
              }}>{e.name}</span>
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 16 }}>
          <h2 style={groupH}>Expressiveness · <span style={{ color: '#b794f4' }}>{Math.round(cfg.expressiveness * 100)}%</span></h2>
          <input type="range" min={0} max={1} step={0.05} value={cfg.expressiveness}
            onChange={(e) => set('expressiveness', parseFloat(e.target.value))} style={{ width: '100%', accentColor: '#b794f4' }} />
        </section>

        <section style={{ marginBottom: 16 }}>
          <h2 style={groupH}>Size · <span style={{ color: '#b794f4' }}>{cfg.size}px</span></h2>
          <input type="range" min={180} max={460} step={10} value={cfg.size}
            onChange={(e) => set('size', parseInt(e.target.value, 10))} style={{ width: '100%', accentColor: '#b794f4' }} />
        </section>

        {GROUPS.map((g) => {
          const items = ACCESSORIES.filter((a) => a.group === g.id)
          if (items.length === 0) return null
          if (g.id === 'spicy' && !showSpicy) {
            return (
              <section key="spicy" style={{ marginBottom: 16 }}>
                <h2 style={groupH}>Spicy (opt-in)</h2>
                <button onClick={() => setShowSpicy(true)} style={btnStyle}>Show cheeky pack →</button>
                <p style={{ color: '#8a8aa0', fontSize: 11, marginTop: 6 }}>Suggestive-but-non-explicit gags. Lok is a cute orb, so it stays playful.</p>
              </section>
            )
          }
          return (
            <section key={g.id} style={{ marginBottom: 16 }}>
              <h2 style={groupH}>{g.label}</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {items.map((a) => (
                  <span key={a.id} onClick={() => toggleAcc(a.id)} style={chipStyle(acc.has(a.id))}>{a.label}</span>
                ))}
              </div>
              {g.id === 'hat' && <p style={noteS}>One hat + one eyewear at a time.</p>}
              {g.id === 'spicy' && <p style={noteS}>Cartoon gags — nothing explicit. Toggle off anytime.</p>}
            </section>
          )
        })}

        <section style={{ marginBottom: 16 }}>
          <h2 style={groupH}>Mood / emote</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
            {MOODS.map((m) => (
              <button key={m.id} title={m.label} onClick={() => set('mood', m.id)} style={{
                fontSize: 20, aspectRatio: 1, borderRadius: 10, background: cfg.mood === m.id ? '#2a2342' : '#1e1e2e',
                border: `1px solid ${cfg.mood === m.id ? '#b794f4' : '#262636'}`, cursor: 'pointer',
              }}>{m.emoji}</button>
            ))}
          </div>
        </section>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={randomize} style={btnStyle}>🎲 Randomize</button>
          <button onClick={notify} style={{ ...btnStyle, background: '#b794f4', color: '#1a1030', borderColor: '#b794f4', fontWeight: 600 }}>🔔 Notify me</button>
        </div>
      </div>
    </div>
  )
}

const groupH: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#8a8aa0', margin: '0 0 8px', fontWeight: 600 }
const noteS: React.CSSProperties = { color: '#8a8aa0', fontSize: 11, marginTop: 6, lineHeight: 1.4 }
function chipStyle(on: boolean): React.CSSProperties {
  return {
    fontSize: 11, padding: '5px 9px', borderRadius: 999, background: on ? '#b794f4' : '#1e1e2e',
    color: on ? '#1a1030' : '#e8e8f0', border: `1px solid ${on ? '#b794f4' : '#262636'}`,
    fontWeight: on ? 600 : 400, cursor: 'pointer', userSelect: 'none',
  }
}
const btnStyle: React.CSSProperties = { flex: 1, padding: 9, borderRadius: 10, border: '1px solid #262636', background: '#1e1e2e', color: '#e8e8f0', fontSize: 12, cursor: 'pointer' }
