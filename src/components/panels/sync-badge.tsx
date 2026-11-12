'use client'

import { useEffect, useState } from 'react'

// SyncBadge — shows how many of your devices are online on the same account
// right now (phone / laptop / desktop). A visible cue that Lok + your chats are
// shared across them. Polls /api/devices every 10s. Smooth glass, no sharp edges.

type Device = { id: string; name: string; kind: string; platform: string; online: boolean; isActive: boolean }

export function SyncBadge() {
  const [devices, setDevices] = useState<Device[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let alive = true
    const poll = async () => {
      try {
        const r = await fetch('/api/devices', { cache: 'no-store' })
        const d = await r.json()
        if (alive && Array.isArray(d)) setDevices(d)
      } catch {}
    }
    poll()
    const t = setInterval(poll, 10_000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const online = devices.filter((d) => d.online)
  if (online.length === 0) return null
  const active = online.find((d) => d.isActive)

  return (
    <div style={{ position: 'fixed', left: 16, bottom: 16, zIndex: 9000 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px',
          borderRadius: 999, border: '1px solid rgba(183,148,244,0.3)',
          background: 'rgba(20,20,31,0.78)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          color: '#e8e8f0', fontSize: 11.5, cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
        }}
        title="Your devices on this account"
      >
        <span style={{
          width: 7, height: 7, borderRadius: '50%', background: '#6ee7b7',
          boxShadow: '0 0 6px #6ee7b7', animation: 'sbPulse 2s infinite',
        }} />
        <span>Synced · {online.length} device{online.length === 1 ? '' : 's'}</span>
      </button>

      {open && (
        <div style={{
          marginTop: 6, padding: 10, borderRadius: 14, minWidth: 200,
          background: 'rgba(16,16,24,0.92)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid #262636', boxShadow: '0 12px 30px rgba(0,0,0,0.4)',
        }}>
          <div style={{ fontSize: 10, color: '#8a8aa0', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            Online on your account
          </div>
          {online.map((d) => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 6 }}>
              <span style={{ fontSize: 13 }}>{d.kind === 'phone' ? '📱' : '💻'}</span>
              <span style={{ color: '#e8e8f0' }}>{d.name}</span>
              {d.isActive && <span style={{ marginLeft: 'auto', fontSize: 9, color: '#b794f4', fontWeight: 600 }}>● ACTIVE</span>}
            </div>
          ))}
          <div style={{ marginTop: 8, fontSize: 10.5, color: '#8a8aa0', lineHeight: 1.4 }}>
            {active ? `Lok is on ${active.name}. ` : ''}Chats, vault & Lok sync across all your devices.
          </div>
        </div>
      )}

      <style>{`@keyframes sbPulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
    </div>
  )
}
