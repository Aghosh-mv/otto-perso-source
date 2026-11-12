'use client'

import { useEffect, useState } from 'react'
import { OttoMascot } from '@/components/mascot/OttoMascot'
import { DEFAULT_MASCOT, type MascotConfig } from '@/components/mascot/wardrobe'

// Lok overlay — loaded inside a transparent, frameless, always-on-top Electron
// window. Renders the mascot floating on top of everything. Draggable anywhere
// on screen. Listens for mood/config updates from the main app (via localStorage
// events + a custom event), so Otto can pop Lok in with an emote when something
// happens (task done → love, working → think, notification → alert, idle → sleep).

const STORAGE_KEY = 'otto.mascot'

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
  const [peek, setPeek] = useState(true) // visible by default

  useEffect(() => {
    setCfg(loadConfig())

    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setCfg(loadConfig())
    }
    // Custom event lets the main app push a mood without persisting config:
    //   window.opener/dispatcher does: localStorage.setItem('otto.mascot.mood', 'alert')
    const onMood = (e: StorageEvent) => {
      if (e.key === 'otto.mascot.mood' && e.newValue) {
        setCfg((c) => ({ ...c, mood: e.newValue as string }))
        setPeek(true)
        // auto-relax back to 'content' after a few seconds
        window.setTimeout(() => {
          setCfg((c) => ({ ...c, mood: 'content' }))
          localStorage.removeItem('otto.mascot.mood')
        }, 4000)
      }
    }
    const onVisibility = (e: StorageEvent) => {
      if (e.key === 'otto.mascot.show') setPeek(e.newValue === '1')
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('storage', onMood)
    window.addEventListener('storage', onVisibility)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('storage', onMood)
      window.removeEventListener('storage', onVisibility)
    }
  }, [])

  return (
    <main
      style={{
        position: 'fixed',
        inset: 0,
        background: 'transparent',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        // The whole mascot is draggable in Electron; right-click area is pass-through.
        // WebkitAppRegion isn't in React's CSSProperties type, so cast via computed key.
        ['WebkitAppRegion' as string]: 'drag',
        cursor: 'grab',
      } as React.CSSProperties}
    >
      {peek && <OttoMascot skin={cfg.skin} accessories={cfg.accessories} mood={cfg.mood} size={260} />}
    </main>
  )
}
