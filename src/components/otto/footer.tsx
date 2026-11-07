'use client'

import { useOtto } from './store'
import { useEffect, useState } from 'react'

export function Footer() {
  const { currentAutonomyLevel, emergencyActive } = useOtto()
  const [now, setNow] = useState<string>('')

  useEffect(() => {
    const tick = () => {
      const d = new Date()
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      const ss = String(d.getSeconds()).padStart(2, '0')
      setNow(`${hh}:${mm}:${ss}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const items = [
    { label: 'Engine', value: 'qwen3-coder-32b · local' },
    { label: 'Vault', value: 'synced · 1,284 files' },
    { label: 'Heartbeat', value: '0.4s' },
    { label: 'Local time', value: now || '—' },
  ]

  return (
    <footer
      className="mt-auto h-10 border-t border-hair bg-background px-4 md:px-6 flex items-center gap-4 md:gap-6 overflow-x-auto"
      style={{ borderColor: 'var(--hair)' }}
    >
      <div className="flex items-center gap-2 shrink-0">
        <span
          className="otto-signal-dot otto-pulse"
          style={{ background: emergencyActive ? 'var(--signal)' : 'var(--good)' }}
        />
        <span className="text-[10px] otto-mono uppercase tracking-wider text-muted-foreground">
          {emergencyActive ? 'Halted' : `L${currentAutonomyLevel} · Active`}
        </span>
      </div>
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] otto-mono uppercase tracking-wider text-muted-foreground/60">
            {it.label}
          </span>
          <span className="text-[10px] otto-mono text-foreground">{it.value}</span>
        </div>
      ))}
      <div className="ml-auto text-[10px] otto-mono text-muted-foreground/60 shrink-0 hidden md:block">
        Otto Perso · v0.1.0 · local-first
      </div>
    </footer>
  )
}
