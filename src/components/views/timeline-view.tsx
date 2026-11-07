'use client'

import { useEffect, useState, useCallback } from 'react'
import { Undo2, Filter, Activity, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { formatRelative, type ActivityLog } from '@/lib/types'

const RISK_TIERS = ['all', 'low', 'medium', 'high', 'critical']
const RISK_TONE: Record<string, { bg: string; fg: string; border: string }> = {
  low: { bg: 'transparent', fg: 'var(--ink-muted)', border: 'var(--hair)' },
  medium: { bg: 'var(--warn-soft)', fg: 'var(--warn)', border: 'var(--warn)' },
  high: { bg: 'var(--signal-soft)', fg: 'var(--signal)', border: 'var(--signal)' },
  critical: { bg: 'var(--signal)', fg: 'var(--signal-fg)', border: 'var(--signal)' },
}

export function TimelineView() {
  const [items, setItems] = useState<ActivityLog[]>([])
  const [tier, setTier] = useState('all')
  const [agent, setAgent] = useState('all')

  const load = useCallback(() => {
    const params = new URLSearchParams()
    if (tier !== 'all') params.set('riskTier', tier)
    if (agent !== 'all') params.set('agent', agent)
    fetch(`/api/activity?${params}`).then((r) => r.json()).then(setItems)
  }, [tier, agent])

  useEffect(() => { load() }, [load])

  const agents = Array.from(new Set(items.map((i) => i.agentName).filter(Boolean))) as string[]

  async function undo(id: string) {
    const res = await fetch(`/api/activity/${id}/undo`, { method: 'POST' })
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Could not undo')
      return
    }
    toast.success('Action reverted', { description: 'Snapshot restored where available.' })
    load()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Timeline</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Every action Otto takes, logged. Undo within 24 hours. Filter by risk tier to see what mattered.
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Filter size={13} className="text-muted-foreground" />
          <span className="otto-label">Risk</span>
          <div className="flex border border-hair" style={{ borderColor: 'var(--hair)' }}>
            {RISK_TIERS.map((t, i) => (
              <button
                key={t}
                onClick={() => setTier(t)}
                className={cn('px-2 py-1 text-[10px] otto-mono uppercase tracking-wider', i > 0 && 'border-l border-hair')}
                style={{
                  background: tier === t ? 'var(--ink)' : 'transparent',
                  color: tier === t ? 'var(--paper)' : 'var(--ink-muted)',
                  borderColor: 'var(--hair)',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="otto-label">Agent</span>
          <select
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
            className="h-7 px-2 border border-hair bg-card text-xs otto-mono"
            style={{ borderColor: 'var(--hair)' }}
          >
            <option value="all">all</option>
            {agents.map((a) => (<option key={a} value={a}>{a}</option>))}
          </select>
        </div>
        <Button variant="ghost" size="sm" className="h-7 ml-auto gap-1.5 text-xs" onClick={load}>
          <RotateCcw size={12} /> Refresh
        </Button>
      </div>

      {/* Timeline */}
      <div className="border border-hair bg-card" style={{ borderColor: 'var(--hair)' }}>
        {items.length === 0 && (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">No activity yet.</div>
        )}
        <div className="divide-y divide-hair" style={{ borderColor: 'var(--hair)' }}>
          {items.map((a) => {
            const risk = RISK_TONE[a.riskTier] ?? RISK_TONE.low
            return (
              <div key={a.id} className="px-5 py-3 grid grid-cols-12 gap-3 items-start text-sm">
                <div className="col-span-3 md:col-span-2 otto-mono text-xs text-muted-foreground">
                  {formatRelative(a.createdAt)}
                </div>
                <div className="col-span-2 md:col-span-2">
                  <span
                    className="inline-block px-1.5 py-0.5 text-[10px] uppercase tracking-wider border"
                    style={{
                      background: risk.bg,
                      color: risk.fg,
                      borderColor: risk.border,
                    }}
                  >
                    {a.riskTier}
                  </span>
                </div>
                <div className="col-span-7 md:col-span-6">
                  <div className="flex items-baseline gap-2">
                    <span className="otto-mono text-xs text-muted-foreground">{a.agentName}</span>
                    <span className="text-foreground">{a.summary}</span>
                  </div>
                  <div className="text-[10px] otto-mono text-muted-foreground mt-0.5">
                    {a.action}
                    {a.target && <span> · {a.target}</span>}
                    {a.undone && <span style={{ color: 'var(--signal)' }}> · undone</span>}
                  </div>
                </div>
                <div className="col-span-12 md:col-span-2 md:text-right">
                  {a.undoable && !a.undone ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-xs gap-1"
                      onClick={() => undo(a.id)}
                    >
                      <Undo2 size={11} /> Undo
                    </Button>
                  ) : a.undone ? (
                    <span className="text-[10px] otto-mono uppercase tracking-wider text-muted-foreground">
                      Reverted
                    </span>
                  ) : (
                    <span className="text-[10px] otto-mono uppercase tracking-wider text-muted-foreground/50">
                      No undo
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Stats footer */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <Activity size={12} />
        <span className="otto-mono uppercase tracking-wider">
          {items.length} entries · {items.filter((i) => i.undoable && !i.undone).length} undoable
        </span>
      </div>
    </div>
  )
}
