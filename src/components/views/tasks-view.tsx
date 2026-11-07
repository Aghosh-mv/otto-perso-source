'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, X, RefreshCw, CheckCircle2, Ban, Filter, GitBranch, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { formatRelative, type Task } from '@/lib/types'

const STATUSES: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'queued', label: 'Queued' },
  { key: 'executing', label: 'Executing' },
  { key: 'waiting_approval', label: 'Waiting' },
  { key: 'done', label: 'Done' },
  { key: 'failed', label: 'Failed' },
  { key: 'cancelled', label: 'Cancelled' },
]

const PRIORITIES = ['low', 'normal', 'high', 'critical'] as const
const RUN_MODES = ['foreground', 'background', 'parallel'] as const

export function TasksView() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [filter, setFilter] = useState<string>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'normal' as (typeof PRIORITIES)[number],
    runMode: 'foreground' as (typeof RUN_MODES)[number],
    autonomyLevel: 2,
  })

  const load = useCallback(() => {
    fetch('/api/tasks').then((r) => r.json()).then(setTasks)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter)

  async function create() {
    if (!form.title.trim()) {
      toast.error('Title required')
      return
    }
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (!res.ok) {
      toast.error('Could not create task')
      return
    }
    toast.success('Task queued', { description: form.title })
    setForm({ title: '', description: '', priority: 'normal', runMode: 'foreground', autonomyLevel: 2 })
    setCreateOpen(false)
    load()
  }

  async function patch(id: string, patch: Partial<Task>) {
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    load()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground mt-2">
            The work queue. Anything Otto is doing, planning, or waiting on you for.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5">
              <Plus size={15} /> New task
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New task</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="otto-label block mb-1.5">Title</label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Pull competitor pricing into vault"
                />
              </div>
              <div>
                <label className="otto-label block mb-1.5">Description</label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Optional — context for Otto"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="otto-label block mb-1.5">Priority</label>
                  <SegmentSelect
                    value={form.priority}
                    options={PRIORITIES as unknown as string[]}
                    onChange={(v) => setForm({ ...form, priority: v as (typeof PRIORITIES)[number] })}
                  />
                </div>
                <div>
                  <label className="otto-label block mb-1.5">Run mode</label>
                  <SegmentSelect
                    value={form.runMode}
                    options={RUN_MODES as unknown as string[]}
                    onChange={(v) => setForm({ ...form, runMode: v as (typeof RUN_MODES)[number] })}
                  />
                </div>
                <div>
                  <label className="otto-label block mb-1.5">Autonomy</label>
                  <SegmentSelect
                    value={String(form.autonomyLevel)}
                    options={['1', '2', '3', '4', '5']}
                    onChange={(v) => setForm({ ...form, autonomyLevel: Number(v) })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={create}>Queue task</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        <Filter size={13} className="text-muted-foreground mr-1 shrink-0" />
        {STATUSES.map((s) => {
          const count = s.key === 'all' ? tasks.length : tasks.filter((t) => t.status === s.key).length
          return (
            <button
              key={s.key}
              onClick={() => setFilter(s.key)}
              className={cn(
                'shrink-0 px-3 py-1 text-xs otto-mono uppercase tracking-wider border transition-colors',
                filter === s.key
                  ? 'bg-foreground text-background border-foreground'
                  : 'border-hair text-muted-foreground hover:text-foreground hover:border-hair-strong'
              )}
              style={{
                background: filter === s.key ? 'var(--ink)' : 'transparent',
                color: filter === s.key ? 'var(--paper)' : 'var(--ink-muted)',
                borderColor: filter === s.key ? 'var(--ink)' : 'var(--hair)',
              }}
            >
              {s.label} <span className="ml-1 opacity-60">{count}</span>
            </button>
          )
        })}
      </div>

      {/* Task list */}
      <div className="border border-hair bg-card divide-y divide-hair" style={{ borderColor: 'var(--hair)' }}>
        {filtered.length === 0 && (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">
            No tasks here.
          </div>
        )}
        {filtered.map((t) => (
          <TaskRow key={t.id} task={t} onPatch={patch} />
        ))}
      </div>

      {/* DAG visualization — shows blockedBy relationships */}
      <TaskDAG tasks={tasks} />
    </div>
  )
}

function TaskRow({ task, onPatch }: { task: Task; onPatch: (id: string, p: Partial<Task>) => void }) {
  const statusTone = STATUS_TONE[task.status] ?? 'var(--ink-muted)'
  const priorityTone = PRIORITY_TONE[task.priority] ?? 'var(--ink-muted)'

  return (
    <div className="px-5 py-4 grid grid-cols-12 gap-3 items-start">
      <div className="col-span-12 md:col-span-7">
        <div className="flex items-start gap-3">
          <span
            className="mt-1 inline-block w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: statusTone }}
          />
          <div className="min-w-0">
            <div className="font-medium text-foreground">{task.title}</div>
            {task.description && (
              <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{task.description}</div>
            )}
          </div>
        </div>
      </div>

      <div className="col-span-4 md:col-span-2 text-xs space-y-1">
        <div>
          <span className="otto-label">Status</span>{' '}
          <span className="otto-mono uppercase" style={{ color: statusTone }}>{task.status.replace('_', ' ')}</span>
        </div>
        <div>
          <span className="otto-label">P</span>{' '}
          <span className="otto-mono uppercase" style={{ color: priorityTone }}>{task.priority}</span>
        </div>
      </div>

      <div className="col-span-4 md:col-span-1 text-xs">
        <span className="otto-label block">Mode</span>
        <span className="otto-mono uppercase text-muted-foreground">{task.runMode.slice(0, 4)}</span>
      </div>

      <div className="col-span-4 md:col-span-2 text-right text-xs space-y-1">
        <div className="otto-mono text-muted-foreground">{formatRelative(task.createdAt)}</div>
        <div className="flex items-center justify-end gap-1">
          {task.status === 'waiting_approval' && (
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => onPatch(task.id, { status: 'executing' })}>
              <CheckCircle2 size={11} /> Approve
            </Button>
          )}
          {(task.status === 'queued' || task.status === 'executing' || task.status === 'planning') && (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => onPatch(task.id, { status: 'cancelled' })}>
              <Ban size={11} /> Cancel
            </Button>
          )}
          {task.status === 'failed' && (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => onPatch(task.id, { status: 'queued' })}>
              <RefreshCw size={11} /> Retry
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

const STATUS_TONE: Record<string, string> = {
  queued: 'var(--ink-muted)',
  planning: 'var(--warn)',
  executing: 'var(--good)',
  waiting_approval: 'var(--warn)',
  done: 'var(--good)',
  failed: 'var(--signal)',
  cancelled: 'var(--ink-muted)',
}

const PRIORITY_TONE: Record<string, string> = {
  low: 'var(--ink-muted)',
  normal: 'var(--ink)',
  high: 'var(--warn)',
  critical: 'var(--signal)',
}

function SegmentSelect({
  value,
  options,
  onChange,
}: {
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  return (
    <div className="flex border border-hair" style={{ borderColor: 'var(--hair)' }}>
      {options.map((o, i) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={cn(
            'flex-1 py-1.5 text-[11px] otto-mono uppercase tracking-wider transition-colors',
            i > 0 && 'border-l border-hair'
          )}
          style={{
            background: value === o ? 'var(--ink)' : 'transparent',
            color: value === o ? 'var(--paper)' : 'var(--ink-muted)',
            borderColor: 'var(--hair)',
          }}
        >
          {o.slice(0, 4)}
        </button>
      ))}
    </div>
  )
}

// ─── TaskDAG — visualizes blockedBy relationships as a layered graph ────────
// We do a topological-sort-style layout: tasks with no blockedBy go in layer 0,
// then tasks blocked only by layer-0 tasks go in layer 1, etc. (simplified).
function TaskDAG({ tasks }: { tasks: Task[] }) {
  // Parse blockedBy from JSON string
  const parsed = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    blockedBy: (() => {
      try { return JSON.parse((t as any).blockedBy || '[]') as string[] } catch { return [] }
    })(),
  }))

  // Only show tasks that have at least one blockedBy relationship OR are blocking something
  const blockingSet = new Set(parsed.flatMap((t) => t.blockedBy))
  const relevant = parsed.filter((t) => t.blockedBy.length > 0 || blockingSet.has(t.id))

  if (relevant.length === 0) {
    return (
      <section className="border border-hair bg-card" style={{ borderColor: 'var(--hair)' }}>
        <div className="px-5 py-3 border-b border-hair flex items-center gap-2" style={{ borderColor: 'var(--hair)' }}>
          <GitBranch size={14} />
          <h2 className="otto-eyebrow">Task graph</h2>
        </div>
        <div className="p-8 text-center text-xs text-muted-foreground">
          No dependency chains yet. Use blockedBy on a task to make it wait on another — Otto will respect the order.
        </div>
      </section>
    )
  }

  // Layer assignment: a task goes in max(predecessor layer) + 1
  const layerOf = new Map<string, number>()
  function assign(id: string): number {
    if (layerOf.has(id)) return layerOf.get(id)!
    const t = parsed.find((x) => x.id === id)
    if (!t || t.blockedBy.length === 0) {
      layerOf.set(id, 0)
      return 0
    }
    const max = Math.max(...t.blockedBy.map((b) => assign(b)), -1)
    const layer = max + 1
    layerOf.set(id, layer)
    return layer
  }
  for (const t of relevant) assign(t.id)

  // Group by layer
  const layers: { id: string; title: string; status: string; priority: string }[][] = []
  for (const t of relevant) {
    const l = layerOf.get(t.id) || 0
    if (!layers[l]) layers[l] = []
    layers[l].push(t)
  }

  // Find edges: from each blockedBy id → task
  const edges: { from: string; to: string }[] = []
  for (const t of relevant) {
    for (const b of t.blockedBy) {
      if (parsed.find((x) => x.id === b)) edges.push({ from: b, to: t.id })
    }
  }

  const statusColor = (s: string) =>
    s === 'executing' ? 'bg-amber-500' :
    s === 'planning' ? 'bg-blue-500' :
    s === 'done' ? 'bg-green-600' :
    s === 'failed' ? 'bg-red-600' :
    s === 'blocked' ? 'bg-red-400' :
    s === 'waiting_approval' ? 'bg-purple-500' :
    'bg-muted-foreground'

  return (
    <section className="border border-hair bg-card" style={{ borderColor: 'var(--hair)' }}>
      <div className="px-5 py-3 border-b border-hair flex items-center justify-between" style={{ borderColor: 'var(--hair)' }}>
        <div className="flex items-center gap-2">
          <GitBranch size={14} />
          <h2 className="otto-eyebrow">Task graph — {relevant.length} linked · {layers.length} layer{layers.length === 1 ? '' : 's'}</h2>
        </div>
        <span className="text-[10px] text-muted-foreground">left → right = unblocks → next</span>
      </div>
      <div className="p-5 overflow-x-auto">
        <div className="flex items-stretch gap-6 min-w-max">
          {layers.map((layer, i) => (
            <div key={i} className="flex items-stretch gap-3">
              <div className="flex flex-col gap-2">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">Layer {i}</div>
                {layer.map((t) => {
                  // Outgoing edges from this node
                  const outEdges = edges.filter((e) => e.from === t.id)
                  return (
                    <div key={t.id} className="border border-hair bg-background p-2.5 min-w-[180px] max-w-[240px]">
                      <div className="flex items-start gap-2">
                        <span className={cn('mt-1 inline-block w-1.5 h-1.5 rounded-full shrink-0', statusColor(t.status))} />
                        <div className="min-w-0">
                          <div className="text-xs font-medium leading-tight">{t.title}</div>
                          <div className="text-[9px] text-muted-foreground mt-1 uppercase">{t.status.replace(/_/g, ' ')} · {t.priority}</div>
                        </div>
                      </div>
                      {outEdges.length > 0 && (
                        <div className="mt-1.5 pt-1.5 border-t border-hair text-[9px] text-muted-foreground">
                          unblocks {outEdges.length} →
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {i < layers.length - 1 && (
                <div className="flex items-center">
                  <ArrowRight size={14} className="text-muted-foreground" />
                </div>
              )}
            </div>
          ))}
        </div>
        {edges.length > 0 && (
          <div className="mt-3 text-[10px] text-muted-foreground">
            {edges.length} dependency edge{edges.length === 1 ? '' : 's'} · blocked tasks won't start until predecessors complete
          </div>
        )}
      </div>
    </section>
  )
}
