'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Plus, X, Activity, Cpu, Network, Radio } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import type { Agent, Task } from '@/lib/types'
import { useOttoRealtime } from '@/hooks/use-otto-realtime'

const STATUS_TONE: Record<string, string> = {
  idle: 'var(--ink-muted)',
  thinking: 'var(--warn)',
  executing: 'var(--good)',
  waiting: 'var(--warn)',
  sleeping: 'var(--ink-muted)',
  stopped: 'var(--signal)',
}

export function AgentsView() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [agentActivity, setAgentActivity] = useState<Array<{ id: string; agentName: string | null; action: string; summary: string; riskTier: string; createdAt: string }>>([])
  const [selected, setSelected] = useState<Agent | null>(null)
  const [spawnOpen, setSpawnOpen] = useState(false)
  const [spawnForm, setSpawnForm] = useState({ name: '', kind: 'worker' as 'worker' | 'custom', task: '' })
  const selectedRef = useRef<Agent | null>(null)
  selectedRef.current = selected

  // Realtime subscription — when connected, this drives agent updates live.
  const realtime = useOttoRealtime()

  const refresh = useCallback(() => {
    fetch('/api/agents').then((r) => r.json()).then((a: Agent[]) => {
      setAgents(a)
      const cur = selectedRef.current
      if (cur) {
        const u = a.find((x) => x.id === cur.id)
        if (u) setSelected(u)
      }
    })
    fetch('/api/tasks').then((r) => r.json()).then(setTasks)
    fetch('/api/activity?limit=30').then((r) => r.json()).then((acts) => {
      const items = Array.isArray(acts) ? acts : (acts?.items ?? [])
      setAgentActivity(items.filter((a: any) => a.action?.startsWith('agent.')))
    })
  }, [])

  // Initial load + fallback polling (only when realtime is disconnected)
  useEffect(() => {
    refresh()
    if (realtime.connected) return
    const id = setInterval(refresh, 4000)
    return () => clearInterval(id)
  }, [refresh, realtime.connected])

  // When realtime agents arrive, use them directly (faster than polling)
  useEffect(() => {
    if (realtime.agents) {
      setAgents(realtime.agents as Agent[])
      const cur = selectedRef.current
      if (cur) {
        const u = (realtime.agents as Agent[]).find((x) => x.id === cur.id)
        if (u) setSelected(u)
      }
    }
  }, [realtime.agents])

  const main = agents.find((a) => a.kind === 'main')
  const workers = agents.filter((a) => a.kind === 'worker')
  const customs = agents.filter((a) => a.kind === 'custom')

  async function spawn() {
    if (!spawnForm.name.trim()) {
      toast.error('Name required')
      return
    }
    const res = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(spawnForm),
    })
    if (!res.ok) {
      toast.error('Could not spawn agent')
      return
    }
    toast.success(`Spawned ${spawnForm.kind}: ${spawnForm.name}`)
    setSpawnForm({ name: '', kind: 'worker', task: '' })
    setSpawnOpen(false)
    refresh()
  }

  async function halt(id: string) {
    await fetch(`/api/agents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'stopped' }),
    })
    toast.success('Agent halted')
    refresh()
  }
  async function runAgent(id: string) {
    const res = await fetch(`/api/agents/${id}/run`, { method: 'POST' })
    if (res.ok) {
      toast.success('Agent started — running in background')
      refresh()
    } else {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error || 'Could not start agent')
    }
  }
  async function wake(id: string) {
    await fetch(`/api/agents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'idle' }),
    })
    toast.success('Agent resumed')
    refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Agents</h1>
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] otto-mono uppercase tracking-wider border"
              style={{
                borderColor: realtime.connected ? 'var(--good)' : 'var(--hair)',
                color: realtime.connected ? 'var(--good)' : 'var(--ink-muted)',
              }}
              title={realtime.connected ? 'Connected to realtime stream' : 'Disconnected — using 4s polling'}
            >
              <Radio size={10} className={realtime.connected ? 'otto-pulse' : ''} />
              {realtime.connected ? 'Live' : 'Polling'}
            </span>
          </div>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Otto is the main brain. Spawned brains are temporary specialists — each is a complete Otto instance focused on one subtask (research, synthesis, file ops). Custom bots are your own additions (Manus-cue, Grok-style, etc).
          </p>
        </div>
        <Dialog open={spawnOpen} onOpenChange={setSpawnOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5"><Plus size={15} /> Spawn agent</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Spawn a new agent</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <label className="otto-label block mb-1.5">Name</label>
                <Input value={spawnForm.name} onChange={(e) => setSpawnForm({ ...spawnForm, name: e.target.value })} placeholder="e.g. Researcher-1" />
              </div>
              <div>
                <label className="otto-label block mb-1.5">Kind</label>
                <div className="flex border border-hair">
                  {(['worker', 'custom'] as const).map((k, i) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSpawnForm({ ...spawnForm, kind: k })}
                      className={cn('flex-1 py-1.5 text-xs otto-mono uppercase tracking-wider', i > 0 && 'border-l')}
                      style={{
                        background: spawnForm.kind === k ? 'var(--ink)' : 'transparent',
                        color: spawnForm.kind === k ? 'var(--paper)' : 'var(--ink-muted)',
                        borderColor: 'var(--hair)',
                      }}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="otto-label block mb-1.5">Initial task</label>
                <Input value={spawnForm.task} onChange={(e) => setSpawnForm({ ...spawnForm, task: e.target.value })} placeholder="e.g. Research three Notion alternatives" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSpawnOpen(false)}>Cancel</Button>
              <Button onClick={spawn}>Spawn</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Graph + side panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live graph */}
        <div
          className="lg:col-span-2 border border-hair bg-card relative overflow-hidden otto-grid-bg"
          style={{ borderColor: 'var(--hair)', minHeight: '500px' }}
        >
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5">
            <Network size={13} />
            <span className="otto-label">Live graph</span>
          </div>
          <AgentGraph agents={agents} onSelect={setSelected} selectedId={selected?.id} />
        </div>

        {/* Side panel: agent list + details */}
        <div className="space-y-4">
          {selected ? (
            <div className="border border-hair bg-card p-5" style={{ borderColor: 'var(--hair)' }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="otto-label">{selected.kind}</div>
                  <h2 className="text-xl font-semibold mt-1">{selected.name}</h2>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelected(null)}>
                  <X size={14} />
                </Button>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <Field label="Status" value={selected.status} mono tone={STATUS_TONE[selected.status]} />
                <Field label="Model" value={selected.modelName ?? '—'} mono />
                <Field label="Task" value={selected.task ?? 'Idle'} />
                <Field label="Confidence" value={`${(selected.confidence * 100).toFixed(0)}%`} mono />
                <Field label="Spawned" value={new Date(selected.spawnedAt).toLocaleString()} mono />
                <Field label="Last beat" value={new Date(selected.lastBeatAt).toLocaleTimeString()} mono />
              </div>
              <div className="mt-4 flex gap-2">
                {(selected.status === 'idle' || selected.status === 'stopped' || selected.status === 'sleeping') && selected.kind !== 'main' && (
                  <Button size="sm" onClick={() => runAgent(selected.id)} className="gap-1.5">
                    ▶ Run
                  </Button>
                )}
                {(selected.status === 'executing' || selected.status === 'thinking' || selected.status === 'idle') && (
                  <Button size="sm" variant="outline" onClick={() => halt(selected.id)} className="gap-1.5">
                    Halt
                  </Button>
                )}
                {(selected.status === 'stopped' || selected.status === 'sleeping') && (
                  <Button size="sm" onClick={() => wake(selected.id)} className="gap-1.5">
                    Wake
                  </Button>
                )}
                {selected.kind !== 'main' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await fetch(`/api/agents/${selected.id}`, { method: 'DELETE' })
                      setSelected(null)
                      refresh()
                    }}
                  >
                    Remove
                  </Button>
                )}
              </div>

              {/* Execution log for this agent */}
              {selected.kind !== 'main' && (
                <div className="mt-5">
                  <div className="otto-label mb-2">Execution log</div>
                  <div className="border border-hair max-h-[200px] overflow-y-auto" style={{ borderColor: 'var(--hair)' }}>
                    {agentActivity.filter((a) => a.agentName === selected.name).length === 0 ? (
                      <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                        No runs yet. Click "▶ Run" to start this agent.
                      </div>
                    ) : (
                      agentActivity
                        .filter((a) => a.agentName === selected.name)
                        .slice(0, 8)
                        .map((a) => (
                          <div key={a.id} className="px-3 py-2 border-b border-hair last:border-0 text-xs" style={{ borderColor: 'var(--hair)' }}>
                            <div className="flex items-start gap-2">
                              <span
                                className="inline-block w-1 h-1 rounded-full mt-1.5 shrink-0"
                                style={{
                                  background: a.action.includes('done') ? 'var(--good)' :
                                    a.action.includes('failed') ? 'var(--signal)' :
                                    a.action.includes('start') ? 'var(--warn)' : 'var(--ink-muted)'
                                }}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-foreground">{a.summary}</div>
                                <div className="text-[10px] otto-mono text-muted-foreground mt-0.5">
                                  {new Date(a.createdAt).toLocaleTimeString()} · {a.action}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="border border-hair bg-card p-5 text-sm text-muted-foreground" style={{ borderColor: 'var(--hair)' }}>
              Click a node to inspect.
            </div>
          )}

          {/* Mini list */}
          <div className="border border-hair bg-card" style={{ borderColor: 'var(--hair)' }}>
            <div className="px-4 py-2 border-b border-hair flex items-center gap-1.5" style={{ borderColor: 'var(--hair)' }}>
              <Activity size={13} />
              <span className="otto-label">All agents</span>
            </div>
            <div className="divide-y divide-hair" style={{ borderColor: 'var(--hair)' }}>
              {[main, ...workers, ...customs].filter(Boolean).map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelected(a)}
                  className={cn(
                    'w-full px-4 py-2.5 text-left flex items-center gap-2 hover:bg-paper-soft transition-colors',
                    selected?.id === a.id && 'bg-paper-soft'
                  )}
                  style={{ background: selected?.id === a.id ? 'var(--paper-soft)' : undefined }}
                >
                  <span
                    className="otto-signal-dot shrink-0"
                    style={{
                      background: STATUS_TONE[a.status],
                      animation: a.status === 'executing' || a.status === 'thinking' ? 'otto-pulse 1.6s ease-in-out infinite' : undefined,
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{a.name}</div>
                    <div className="text-[10px] otto-mono uppercase tracking-wider text-muted-foreground">
                      {a.kind} · {a.status}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, mono, tone }: { label: string; value: string; mono?: boolean; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="otto-label shrink-0">{label}</span>
      <span className={cn('text-right', mono && 'otto-mono text-xs')} style={tone ? { color: tone } : undefined}>
        {value}
      </span>
    </div>
  )
}

// ─── Live node graph ───────────────────────────────────────────────────
function AgentGraph({
  agents,
  onSelect,
  selectedId,
}: {
  agents: Agent[]
  onSelect: (a: Agent) => void
  selectedId?: string
}) {
  const main = agents.find((a) => a.kind === 'main')
  const others = agents.filter((a) => a.kind !== 'main')

  // Geometry
  const W = 720
  const H = 500
  const cx = W / 2
  const cy = H / 2
  const radius = 170

  // Positions
  const positions: Record<string, { x: number; y: number }> = {}
  if (main) positions[main.id] = { x: cx, y: cy }
  others.forEach((a, i) => {
    const angle = (i / Math.max(1, others.length)) * Math.PI * 2 - Math.PI / 2
    positions[a.id] = {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    }
  })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      {/* Edges */}
      {main && others.map((a) => {
        const p = positions[a.id]
        const m = positions[main.id]
        const isActive = a.status === 'executing' || a.status === 'thinking'
        return (
          <g key={`edge-${a.id}`}>
            <line
              x1={m.x}
              y1={m.y}
              x2={p.x}
              y2={p.y}
              stroke="var(--hair-strong)"
              strokeWidth={1}
            />
            {isActive && (
              <line
                x1={m.x}
                y1={m.y}
                x2={p.x}
                y2={p.y}
                stroke="var(--signal)"
                strokeWidth={1}
                className="otto-edge-flow"
              />
            )}
          </g>
        )
      })}

      {/* Nodes */}
      {agents.map((a) => {
        const p = positions[a.id]
        if (!p) return null
        const isMain = a.kind === 'main'
        const r = isMain ? 36 : 26
        const tone = STATUS_TONE[a.status] ?? 'var(--ink-muted)'
        const isSelected = selectedId === a.id
        const label = a.name.length > 12 ? a.name.slice(0, 10) + '…' : a.name
        return (
          <g
            key={a.id}
            transform={`translate(${p.x}, ${p.y})`}
            onClick={() => onSelect(a)}
            style={{ cursor: 'pointer' }}
          >
            {/* selection ring */}
            {isSelected && (
              <circle r={r + 6} fill="none" stroke="var(--ink)" strokeWidth={1} strokeDasharray="2 2" />
            )}
            {/* node */}
            <circle
              r={r}
              fill={isMain ? 'var(--ink)' : 'var(--paper)'}
              stroke={isMain ? 'var(--ink)' : tone}
              strokeWidth={isMain ? 0 : 2}
            />
            {/* status indicator */}
            <circle
              cx={r * 0.65}
              cy={-r * 0.65}
              r={4}
              fill={tone}
              className={(a.status === 'executing' || a.status === 'thinking') ? 'otto-pulse' : undefined}
              style={{ transformOrigin: `${r * 0.65}px ${-r * 0.65}px` }}
            />
            {/* label inside main */}
            {isMain ? (
              <text
                x={0}
                y={4}
                textAnchor="middle"
                fontSize={11}
                fontFamily="var(--font-geist-mono), monospace"
                fill="var(--paper)"
                fontWeight={600}
              >
                OTTO
              </text>
            ) : (
              <text
                x={0}
                y={3}
                textAnchor="middle"
                fontSize={9}
                fontFamily="var(--font-geist-mono), monospace"
                fill="var(--ink)"
              >
                {label}
              </text>
            )}
            {/* label below */}
            <text
              x={0}
              y={r + 14}
              textAnchor="middle"
              fontSize={9}
              fontFamily="var(--font-geist-mono), monospace"
              fill="var(--ink-muted)"
              style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}
            >
              {(a.task ?? a.status).slice(0, 18)}
            </text>
            {/* confidence ring for active */}
            {(a.status === 'executing' || a.status === 'thinking') && a.confidence > 0 && (
              <circle
                r={r + 3}
                fill="none"
                stroke={tone}
                strokeWidth={1.5}
                strokeDasharray={`${2 * Math.PI * (r + 3) * a.confidence} ${2 * Math.PI * (r + 3)}`}
                transform="rotate(-90)"
                style={{ opacity: 0.5 }}
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}
