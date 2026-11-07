'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Star, Play, ChefHat, Clock, BarChart3, Trash2, ArrowUp, ArrowDown, X, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import type { Recipe } from '@/lib/types'

const CATEGORIES = ['all', 'reporting', 'research', 'file', 'email', 'scheduling', 'devops', 'custom']

const STEP_ACTIONS = [
  { value: 'scan', label: 'Scan', desc: 'Read a source (inbox, calendar, files)' },
  { value: 'fetch', label: 'Fetch', desc: 'Retrieve a specific URL or item' },
  { value: 'search', label: 'Search', desc: 'Web search' },
  { value: 'extract', label: 'Extract', desc: 'Pull specific fields from content' },
  { value: 'classify', label: 'Classify', desc: 'Categorize items by labels' },
  { value: 'synthesize', label: 'Synthesize', desc: 'Run model to combine/summarize' },
  { value: 'draft', label: 'Draft', desc: 'Generate a draft (email, doc)' },
  { value: 'write', label: 'Write', desc: 'Write to a target (vault, file)' },
  { value: 'send', label: 'Send', desc: 'Send (requires approval)' },
  { value: 'move', label: 'Move', desc: 'Move/rename files' },
  { value: 'read', label: 'Read', desc: 'Read a specific file' },
  { value: 'wait', label: 'Wait', desc: 'Pause for a duration' },
  { value: 'log', label: 'Log', desc: 'Write to audit log' },
  { value: 'gh', label: 'GitHub', desc: 'Run a gh CLI command' },
  { value: 'shell', label: 'Shell', desc: 'Run a shell command (high risk)' },
]

interface BuilderStep {
  action: string
  target?: string
  params?: string
}

export function RecipesView() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'custom',
    estMinutes: 5,
  })
  const [steps, setSteps] = useState<BuilderStep[]>([{ action: 'scan', target: '' }])

  const load = useCallback(() => {
    fetch('/api/recipes').then((r) => r.json()).then(setRecipes)
  }, [])
  useEffect(() => { load() }, [load])

  const filtered = filter === 'all' ? recipes : recipes.filter((r) => r.category === filter)

  async function toggleFav(id: string, current: boolean) {
    await fetch(`/api/recipes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isFavorite: !current }),
    })
    load()
  }

  async function run(id: string, title: string) {
    const res = await fetch(`/api/recipes/${id}/run`, { method: 'POST' })
    if (res.ok) {
      toast.success('Recipe queued', { description: `${title} — running in background` })
    } else {
      toast.error('Could not run recipe')
    }
  }

  async function remove(id: string) {
    await fetch(`/api/recipes/${id}`, { method: 'DELETE' })
    toast.success('Recipe deleted')
    load()
  }

  function addStep() {
    setSteps([...steps, { action: 'scan', target: '' }])
  }
  function updateStep(i: number, patch: Partial<BuilderStep>) {
    setSteps(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }
  function removeStep(i: number) {
    setSteps(steps.filter((_, idx) => idx !== i))
  }
  function moveStep(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= steps.length) return
    const next = [...steps]
    ;[next[i], next[j]] = [next[j], next[i]]
    setSteps(next)
  }

  async function create() {
    if (!form.title.trim()) {
      toast.error('Title required')
      return
    }
    if (steps.length === 0) {
      toast.error('At least one step required')
      return
    }
    const cleanSteps = steps
      .filter((s) => s.action)
      .map((s, i) => ({ ...s, step: i + 1 }))
    await fetch('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, steps: cleanSteps }),
    })
    toast.success('Recipe saved')
    setForm({ title: '', description: '', category: 'custom', estMinutes: 5 })
    setSteps([{ action: 'scan', target: '' }])
    setOpen(false)
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Recipes</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Reusable automation workflows. Built-ins cover the common stuff — build your own for the rest.
            Run, queue, or favorite for quick access.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5"><Plus size={15} /> New recipe</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Recipe builder</DialogTitle>
              <DialogDescription>
                Add steps, reorder, parameterize. Each step is one action with an optional target.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="otto-label block mb-1.5">Title</label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Daily news roundup" />
                </div>
                <div>
                  <label className="otto-label block mb-1.5">Est. minutes</label>
                  <Input
                    type="number"
                    value={form.estMinutes}
                    onChange={(e) => setForm({ ...form, estMinutes: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="otto-label block mb-1.5">Description</label>
                  <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What does this recipe do?" />
                </div>
                <div>
                  <label className="otto-label block mb-1.5">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full h-9 px-2 border border-hair bg-card text-sm otto-mono"
                    style={{ borderColor: 'var(--hair)' }}
                  >
                    {CATEGORIES.filter((c) => c !== 'all').map((c) => (<option key={c} value={c}>{c}</option>))}
                  </select>
                </div>
              </div>

              {/* Steps */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="otto-eyebrow">Steps ({steps.length})</label>
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={addStep}>
                    <Plus size={11} /> Add step
                  </Button>
                </div>
                <div className="space-y-2">
                  {steps.map((s, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 p-2 border border-hair bg-paper-soft"
                      style={{ borderColor: 'var(--hair)', background: 'var(--paper-soft)' }}
                    >
                      <div className="flex flex-col items-center pt-1.5 shrink-0">
                        <span className="text-[10px] otto-mono text-muted-foreground">{i + 1}</span>
                        <div className="flex flex-col mt-1">
                          <button
                            onClick={() => moveStep(i, -1)}
                            disabled={i === 0}
                            className="p-0.5 disabled:opacity-20"
                            aria-label="Move up"
                          >
                            <ArrowUp size={11} />
                          </button>
                          <button
                            onClick={() => moveStep(i, 1)}
                            disabled={i === steps.length - 1}
                            className="p-0.5 disabled:opacity-20"
                            aria-label="Move down"
                          >
                            <ArrowDown size={11} />
                          </button>
                        </div>
                      </div>
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2">
                        <select
                          value={s.action}
                          onChange={(e) => updateStep(i, { action: e.target.value })}
                          className="h-8 px-2 border border-hair bg-card text-xs otto-mono"
                          style={{ borderColor: 'var(--hair)' }}
                        >
                          {STEP_ACTIONS.map((a) => (
                            <option key={a.value} value={a.value}>{a.label} — {a.value}</option>
                          ))}
                        </select>
                        <Input
                          value={s.target ?? ''}
                          onChange={(e) => updateStep(i, { target: e.target.value })}
                          placeholder="target (e.g. inbox, vault://notes/x.md)"
                          className="otto-mono text-xs h-8 md:col-span-2"
                        />
                      </div>
                      <button
                        onClick={() => removeStep(i)}
                        className="p-1 mt-1 text-muted-foreground hover:text-signal shrink-0"
                        aria-label="Remove step"
                        disabled={steps.length === 1}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={create}>Save recipe</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={cn(
              'shrink-0 px-3 py-1 text-xs otto-mono uppercase tracking-wider border transition-colors',
              filter === c ? 'border-foreground' : 'border-hair text-muted-foreground hover:text-foreground'
            )}
            style={{
              background: filter === c ? 'var(--ink)' : 'transparent',
              color: filter === c ? 'var(--paper)' : 'var(--ink-muted)',
              borderColor: filter === c ? 'var(--ink)' : 'var(--hair)',
            }}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Recipe grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.length === 0 && (
          <div className="col-span-full border border-hair bg-card p-12 text-center text-sm text-muted-foreground" style={{ borderColor: 'var(--hair)' }}>
            No recipes here yet.
          </div>
        )}
        {filtered.map((r) => (
          <div
            key={r.id}
            className="border border-hair bg-card p-5 flex flex-col group transition-colors hover:border-hair-strong"
            style={{ borderColor: 'var(--hair)' }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-base tracking-tight">{r.title}</h3>
                  {r.isBuiltIn && (
                    <span
                      className="px-1.5 py-0.5 text-[9px] otto-mono uppercase tracking-wider border"
                      style={{ borderColor: 'var(--hair)', color: 'var(--ink-muted)' }}
                    >
                      Built-in
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.description}</p>
              </div>
              <button
                onClick={() => toggleFav(r.id, r.isFavorite)}
                className="p-1 shrink-0"
                title={r.isFavorite ? 'Unfavorite' : 'Favorite'}
              >
                <Star
                  size={14}
                  fill={r.isFavorite ? 'var(--signal)' : 'none'}
                  style={{ color: r.isFavorite ? 'var(--signal)' : 'var(--ink-muted)' }}
                />
              </button>
            </div>

            {/* Steps preview */}
            <div className="mt-4 space-y-1 flex-1">
              {r.steps.slice(0, 4).map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] otto-mono text-muted-foreground">
                  <span
                    className="w-4 h-4 flex items-center justify-center border"
                    style={{ borderColor: 'var(--hair)', color: 'var(--ink-muted)' }}
                  >
                    {i + 1}
                  </span>
                  <span className="truncate">
                    <span className="text-foreground">{s.action}</span>
                    {s.target ? <span className="text-muted-foreground"> {s.target}</span> : null}
                  </span>
                </div>
              ))}
              {r.steps.length > 4 && (
                <div className="text-[10px] otto-mono text-muted-foreground pl-6">+ {r.steps.length - 4} more</div>
              )}
            </div>

            {/* Footer */}
            <div className="mt-4 pt-3 border-t border-hair flex items-center justify-between" style={{ borderColor: 'var(--hair)' }}>
              <div className="flex items-center gap-3 text-[10px] otto-mono uppercase tracking-wider text-muted-foreground">
                <span className="flex items-center gap-1"><Clock size={10} /> {r.estMinutes}m</span>
                <span className="flex items-center gap-1"><BarChart3 size={10} /> {r.runCount} runs</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => run(r.id, r.title)}
                >
                  <Play size={11} /> Run
                </Button>
                {!r.isBuiltIn && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
                    onClick={() => remove(r.id)}
                  >
                    <Trash2 size={11} />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
