'use client'

import { DEFAULT_MASCOT, type MascotConfig } from './wardrobe'

// Lok config sync — DB-backed (SystemState 'mascot' row) so the same mascot
// travels across devices on the same account. localStorage stays as a fast
// write-through cache so the UI is instant and works offline.

export async function fetchMascotConfig(): Promise<MascotConfig> {
  try {
    const r = await fetch('/api/mascot-config', { cache: 'no-store' })
    if (!r.ok) return readLocal()
    const data = await r.json()
    const cfg = { ...DEFAULT_MASCOT, ...data }
    try { localStorage.setItem('otto.mascot', JSON.stringify(cfg)) } catch {}
    return cfg
  } catch {
    return readLocal()
  }
}

export async function saveMascotConfig(cfg: MascotConfig) {
  try { localStorage.setItem('otto.mascot', JSON.stringify(cfg)) } catch {}
  try {
    await fetch('/api/mascot-config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    })
  } catch {}
}

function readLocal(): MascotConfig {
  try {
    const raw = localStorage.getItem('otto.mascot')
    if (raw) return { ...DEFAULT_MASCOT, ...JSON.parse(raw) }
  } catch {}
  return DEFAULT_MASCOT
}
