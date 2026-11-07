'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Cpu, Zap, Star, Power, Trash2, Server, Gauge } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import type { ModelProvider } from '@/lib/types'

const KIND_TONE: Record<string, string> = {
  ollama: 'var(--good)',
  openai: 'var(--ink)',
  anthropic: 'var(--ink)',
  custom: 'var(--ink-muted)',
  'otto-bundled': 'var(--signal)',
}

export function ModelsView() {
  const [providers, setProviders] = useState<ModelProvider[]>([])
  const [open, setOpen] = useState(false)
  const [ollamaOpen, setOllamaOpen] = useState(false)
  const [form, setForm] = useState({
    name: '',
    kind: 'custom' as ModelProvider['kind'],
    endpoint: '',
    models: '',
  })

  const load = useCallback(() => {
    fetch('/api/models').then((r) => r.json()).then(setProviders)
  }, [])
  useEffect(() => { load() }, [load])

  async function setDefault(id: string) {
    await fetch('/api/models', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, setDefault: true }),
    })
    toast.success('Default model updated')
    load()
  }

  async function toggle(id: string, isActive: boolean) {
    await fetch('/api/models', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isActive: !isActive }),
    })
    load()
  }

  async function remove(id: string) {
    await fetch(`/api/models/${id}`, { method: 'DELETE' })
    toast.success('Provider removed')
    load()
  }

  async function add() {
    if (!form.name.trim()) {
      toast.error('Name required')
      return
    }
    const models = form.models.split(',').map((m) => m.trim()).filter(Boolean)
    await fetch('/api/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, models }),
    })
    toast.success(`Added ${form.name}`)
    setForm({ name: '', kind: 'custom', endpoint: '', models: '' })
    setOpen(false)
    load()
  }

  async function setupOllama() {
    // Simulate one-click Ollama setup
    setOllamaOpen(true)
    await new Promise((r) => setTimeout(r, 1500))
    await fetch('/api/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Ollama (local)',
        kind: 'ollama',
        endpoint: 'http://localhost:11434',
        models: ['qwen3-coder-32b', 'llama3.1-8b', 'nomic-embed-text'],
        isDefault: true,
        isActive: true,
      }),
    })
    setOllamaOpen(false)
    toast.success('Ollama connected', { description: 'Local models available — fully offline.' })
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Models</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Bring your own models, use Otto-bundled ones, or one-click into Ollama for fully local inference.
            Per-task overrides available from the task panel.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-1.5" onClick={setupOllama} disabled={ollamaOpen}>
            <Zap size={14} style={{ color: 'var(--good)' }} />
            {ollamaOpen ? 'Connecting…' : 'One-click Ollama'}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-1.5"><Plus size={15} /> Add provider</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add model provider</DialogTitle>
                <DialogDescription>Connect OpenAI, Anthropic, or a custom OpenAI-compatible endpoint.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div>
                  <label className="otto-label block mb-1.5">Name</label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. OpenAI" />
                </div>
                <div>
                  <label className="otto-label block mb-1.5">Kind</label>
                  <div className="flex border border-hair">
                    {(['openai', 'anthropic', 'custom'] as const).map((k, i) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setForm({ ...form, kind: k })}
                        className={cn('flex-1 py-1.5 text-xs otto-mono uppercase tracking-wider', i > 0 && 'border-l')}
                        style={{
                          background: form.kind === k ? 'var(--ink)' : 'transparent',
                          color: form.kind === k ? 'var(--paper)' : 'var(--ink-muted)',
                          borderColor: 'var(--hair)',
                        }}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="otto-label block mb-1.5">Endpoint</label>
                  <Input
                    value={form.endpoint}
                    onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
                    placeholder="https://api.openai.com/v1"
                    className="otto-mono text-xs"
                  />
                </div>
                <div>
                  <label className="otto-label block mb-1.5">Models (comma separated)</label>
                  <Input
                    value={form.models}
                    onChange={(e) => setForm({ ...form, models: e.target.value })}
                    placeholder="gpt-4o, gpt-4o-mini"
                    className="otto-mono text-xs"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={add}>Add</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Provider cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {providers.map((p) => (
          <div
            key={p.id}
            className={cn(
              'border bg-card p-5 group transition-colors',
              p.isDefault ? 'border-2' : 'border'
            )}
            style={{ borderColor: p.isDefault ? 'var(--ink)' : 'var(--hair)' }}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div
                  className="w-9 h-9 flex items-center justify-center border"
                  style={{ borderColor: 'var(--hair)', background: 'var(--paper-soft)' }}
                >
                  {p.kind === 'ollama' ? <Server size={14} style={{ color: 'var(--good)' }} /> : <Cpu size={14} />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-base">{p.name}</h2>
                    {p.isDefault && (
                      <span
                        className="px-1.5 py-0.5 text-[10px] otto-mono uppercase tracking-wider border"
                        style={{ borderColor: 'var(--ink)', background: 'var(--ink)', color: 'var(--paper)' }}
                      >
                        Default
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className="px-1.5 py-0.5 text-[10px] otto-mono uppercase tracking-wider border"
                      style={{
                        borderColor: KIND_TONE[p.kind],
                        color: KIND_TONE[p.kind],
                      }}
                    >
                      {p.kind}
                    </span>
                    {p.endpoint && (
                      <code className="text-[10px] otto-mono text-muted-foreground truncate max-w-[200px]">{p.endpoint}</code>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => toggle(p.id, p.isActive)}
                className={cn('p-1.5 transition-colors', p.isActive ? 'text-foreground' : 'text-muted-foreground')}
                title={p.isActive ? 'Active — click to disable' : 'Disabled — click to enable'}
              >
                <Power size={14} style={{ color: p.isActive ? 'var(--good)' : 'var(--ink-muted)' }} />
              </button>
            </div>

            {/* Models */}
            <div className="mt-4 flex flex-wrap gap-1">
              {p.models.map((m) => (
                <span
                  key={m}
                  className="px-1.5 py-0.5 text-[10px] otto-mono border border-hair"
                  style={{ borderColor: 'var(--hair)', color: 'var(--ink)' }}
                >
                  {m}
                </span>
              ))}
            </div>

            {/* Footer */}
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-3 text-[10px] otto-mono uppercase tracking-wider text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Gauge size={11} /> {p.latencyMs}ms
                </span>
                {p.apiKeyRef && (
                  <span className="flex items-center gap-1" style={{ color: 'var(--good)' }}>
                    <span className="otto-signal-dot" style={{ background: 'var(--good)' }} /> Key set
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {!p.isDefault && (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => setDefault(p.id)}>
                    <Star size={11} /> Default
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => remove(p.id)}>
                  <Trash2 size={11} />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
