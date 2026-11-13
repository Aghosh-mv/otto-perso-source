'use client'

import { useEffect, useState } from 'react'

// Dev panels — a collapsible right-side drawer with two tabs:
//  • Terminal — live stream of Otto's activity (tool calls, agent runs, thoughts)
//               in a monospace terminal style. "Show the work happening."
//  • Work     — live cards of running agents + their results, so you see real
//               artifacts appearing (not just text claims). The z.ai-style proof.
// Polls every 2s. Smooth, glassy, no sharp edges.

type ActivityItem = {
  id: string
  agentName: string
  action: string
  target: string
  summary: string
  riskTier: string
  createdAt: string
}

type Agent = {
  id: string
  name: string
  status: string
  task: string
  result?: string | null
  modelName?: string
  assignedTasks?: any[]
}

const RISK_COLOR: Record<string, string> = {
  low: '#8a8aa0', medium: '#fbbf24', high: '#fb923c', critical: '#ef4444',
}

export function DevPanels() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'terminal' | 'work'>('terminal')
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [agents, setAgents] = useState<Agent[]>([])

  useEffect(() => {
    if (!open) return
    let alive = true
    const poll = async () => {
      try {
        const [a, g] = await Promise.all([
          fetch('/api/activity').then((r) => r.json()).catch(() => []),
          fetch('/api/agents').then((r) => r.json()).catch(() => []),
        ])
        if (!alive) return
        setActivity(Array.isArray(a) ? a.slice(0, 80).reverse() : [])
        setAgents(Array.isArray(g) ? g : [])
      } catch {}
    }
    poll()
    const t = setInterval(poll, 2000)
    return () => { alive = false; clearInterval(t) }
  }, [open])

  return (
    <>
      {/* Tab/handle on the right edge */}
      <button
        onClick={() => setOpen((o) => !o)}
        title={open ? 'Hide dev panels' : 'Show terminal + work panels'}
        style={{
          position: 'fixed', right: 0, top: '50%', transform: 'translateY(-50%)',
          zIndex: 9000, writingMode: 'vertical-rl', padding: '14px 8px',
          borderRadius: '12px 0 0 12px', border: '1px solid #262636', borderRight: 'none',
          background: 'rgba(20,20,31,0.85)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          color: '#e8e8f0', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
          boxShadow: '-6px 0 20px rgba(0,0,0,0.3)',
        }}
      >{open ? '› close' : '‹ dev'}</button>

      {open && (
        <div style={{
          position: 'fixed', right: 0, top: 0, bottom: 0, width: 380, zIndex: 9000,
          background: 'rgba(16,16,24,0.92)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          borderLeft: '1px solid #262636', display: 'flex', flexDirection: 'column',
          boxShadow: '-20px 0 60px rgba(0,0,0,0.4)',
        }}>
          {/* tab switch */}
          <div style={{ display: 'flex', gap: 6, padding: 10, borderBottom: '1px solid #262636' }}>
            {(['terminal', 'work'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                flex: 1, padding: '8px 10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: tab === t ? '#b794f4' : '#1e1e2e', color: tab === t ? '#1a1030' : '#e8e8f0',
                fontSize: 12, fontWeight: 600, textTransform: 'capitalize',
              }}>{t === 'terminal' ? '⌘ Terminal' : '◆ Work'}</button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
            {tab === 'terminal' ? (
              <TerminalView activity={activity} />
            ) : (
              <WorkView agents={agents} />
            )}
          </div>
        </div>
      )}
    </>
  )
}

function TerminalView({ activity }: { activity: ActivityItem[] }) {
  if (!activity.length) {
    return <div style={{ color: '#8a8aa0', fontSize: 12, padding: 20, textAlign: 'center' }}>
      No activity yet. When Otto or its bots run tools, the live stream shows here.
    </div>
  }
  return (
    <div style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize: 11.5, lineHeight: 1.55 }}>
      {activity.map((a) => {
        const t = new Date(a.createdAt)
        const ts = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`
        const color = RISK_COLOR[a.riskTier] || '#8a8aa0'
        return (
          <div key={a.id} style={{ marginBottom: 4, wordBreak: 'break-word' }}>
            <span style={{ color: '#5a5a72' }}>[{ts}] </span>
            <span style={{ color: '#7dd3fc' }}>{a.agentName}</span>
            <span style={{ color: '#5a5a72' }}> ▸ </span>
            <span style={{ color }}>{a.action}</span>
            <span style={{ color: '#5a5a72' }}> — </span>
            <span style={{ color: '#e8e8f0' }}>{a.summary}</span>
          </div>
        )
      })}
    </div>
  )
}

function WorkView({ agents }: { agents: Agent[] }) {
  if (!agents.length) {
    return <div style={{ color: '#8a8aa0', fontSize: 12, padding: 20, textAlign: 'center' }}>
      No bots running. Spawn a user-created bot (Bots tab) or give Otto a task — its work shows here live.
    </div>
  }
  const statusColor: Record<string, string> = {
    idle: '#8a8aa0', running: '#6ee7b7', thinking: '#fbbf24', done: '#a7f3d0', error: '#ef4444', waiting_approval: '#fb923c',
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {agents.map((a) => (
        <div key={a.id} style={{
          background: 'rgba(30,30,46,0.6)', border: '1px solid #262636', borderRadius: 14, padding: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor[a.status] || '#8a8aa0',
              boxShadow: a.status === 'running' || a.status === 'thinking' ? `0 0 8px ${statusColor[a.status]}` : 'none',
              animation: a.status === 'running' || a.status === 'thinking' ? 'wpPulse 1.2s infinite' : 'none' }} />
            <strong style={{ fontSize: 13, color: '#e8e8f0' }}>{a.name}</strong>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: statusColor[a.status] || '#8a8aa0', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{a.status}</span>
          </div>
          <div style={{ fontSize: 11.5, color: '#a0a0b8', marginBottom: 6 }}>{a.task}</div>
          {a.result && (
            <div style={{ fontSize: 11.5, color: '#e8e8f0', background: 'rgba(10,10,18,0.5)', borderRadius: 8, padding: 8, maxHeight: 140, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
              {a.result.slice(0, 600)}{a.result.length > 600 ? '…' : ''}
            </div>
          )}
          {a.assignedTasks && a.assignedTasks.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 10.5, color: '#8a8aa0' }}>
              {a.assignedTasks.length} task{a.assignedTasks.length === 1 ? '' : 's'} assigned
            </div>
          )}
        </div>
      ))}
      <style>{`@keyframes wpPulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  )
}
