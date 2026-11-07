'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Bot, Trash2, Save, Power, Cpu, Shield, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { formatRelative } from '@/lib/types'

const AVAILABLE_ACTIONS = [
  { key: 'web.search', label: 'Web search', desc: 'Search the internet' },
  { key: 'web.fetch', label: 'Web fetch', desc: 'Fetch a specific URL' },
  { key: 'vault.read', label: 'Vault read', desc: 'Read memory notes' },
  { key: 'vault.write', label: 'Vault write', desc: 'Create/update notes' },
  { key: 'email.read', label: 'Email read', desc: 'Read inbox' },
  { key: 'email.draft', label: 'Email draft', desc: 'Draft emails (not send)' },
  { key: 'email.send', label: 'Email send', desc: 'Send emails (requires approval)' },
  { key: 'file.read', label: 'File read', desc: 'Read local files' },
  { key: 'file.write', label: 'File write', desc: 'Write local files' },
  { key: 'ui.click', label: 'UI click', desc: 'Click in browser/apps' },
  { key: 'ui.type', label: 'UI type', desc: 'Type into apps' },
  { key: 'calendar.read', label: 'Calendar read', desc: 'Read calendar' },
  { key: 'calendar.write', label: 'Calendar write', desc: 'Create/modify events' },
]

const COLORS = ['ink', 'signal', 'warn', 'good'] as const
const COLOR_TONE: Record<string, string> = {
  ink: 'var(--ink)',
  signal: 'var(--signal)',
  warn: 'var(--warn)',
  good: 'var(--good)',
}

interface CustomBot {
  id: string
  name: string
  description: string
  systemPrompt: string
  modelName: string
  allowedActions: string[]
  autonomyCap: number
  color: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export function BotsView() {
  const [bots, setBots] = useState<CustomBot[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<CustomBot> | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', description: '' })

  const load = useCallback(async () => {
    const res = await fetch('/api/bots')
    const data = await res.json()
    setBots(data)
    if (!selectedId && data.length > 0) setSelectedId(data[0].id)
  }, [selectedId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!selectedId) {
      setDraft(null)
      return
    }
    const b = bots.find((x) => x.id === selectedId)
    setDraft(b ? { ...b } : null)
  }, [selectedId, bots])

  async function create() {
    if (!createForm.name.trim()) {
      toast.error('Name required')
      return
    }
    const res = await fetch('/api/bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: createForm.name,
        description: createForm.description,
        systemPrompt: '',
        allowedActions: ['vault.read'],
        autonomyCap: 2,
        color: 'ink',
      }),
    })
    const created = await res.json()
    toast.success(`Bot created: ${created.name}`)
    setCreateForm({ name: '', description: '' })
    setCreateOpen(false)
    load()
    setSelectedId(created.id)
  }

  async function save() {
    if (!draft || !draft.id) return
    await fetch(`/api/bots/${draft.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: draft.name,
        description: draft.description,
        systemPrompt: draft.systemPrompt,
        modelName: draft.modelName,
        allowedActions: draft.allowedActions,
        autonomyCap: draft.autonomyCap,
        color: draft.color,
      }),
    })
    toast.success('Bot saved')
    load()
  }

  async function toggle(id: string, current: boolean) {
    await fetch(`/api/bots/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !current }),
    })
    load()
  }

  async function remove(id: string) {
    await fetch(`/api/bots/${id}`, { method: 'DELETE' })
    toast.success('Bot deleted')
    if (selectedId === id) setSelectedId(null)
    load()
  }

  function toggleAction(action: string) {
    if (!draft) return
    const current = draft.allowedActions ?? []
    const next = current.includes(action)
      ? current.filter((a) => a !== action)
      : [...current, action]
    setDraft({ ...draft, allowedActions: next })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Custom Bots</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Specialized agents you define. Give each a system prompt, a model, allowed actions, and an autonomy cap.
            Then dispatch them from the Agents view as needed.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5"><Plus size={15} /> New bot</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create custom bot</DialogTitle>
              <DialogDescription>You'll define its behavior, model, and permissions next.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <label className="otto-label block mb-1.5">Name</label>
                <Input
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="e.g. Researcher-pro"
                />
              </div>
              <div>
                <label className="otto-label block mb-1.5">Description</label>
                <Textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  rows={2}
                  placeholder="What does this bot do?"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={create}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Bot list */}
        <div className="lg:col-span-4 space-y-3">
          <div className="border border-hair bg-card divide-y divide-hair" style={{ borderColor: 'var(--hair)' }}>
            {bots.length === 0 && (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">No bots yet.</div>
            )}
            {bots.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelectedId(b.id)}
                className={cn(
                  'w-full text-left px-4 py-3 transition-colors hover:bg-paper-soft',
                  selectedId === b.id && 'bg-paper-soft'
                )}
                style={{ background: selectedId === b.id ? 'var(--paper-soft)' : undefined }}
              >
                <div className="flex items-start gap-2.5">
                  <div
                    className="w-7 h-7 flex items-center justify-center border shrink-0"
                    style={{
                      borderColor: COLOR_TONE[b.color] ?? 'var(--ink)',
                      color: COLOR_TONE[b.color] ?? 'var(--ink)',
                      opacity: b.isActive ? 1 : 0.4,
                    }}
                  >
                    <Bot size={13} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{b.name}</div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">{b.description || 'No description'}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className="text-[9px] otto-mono uppercase tracking-wider"
                        style={{ color: b.isActive ? 'var(--good)' : 'var(--ink-muted)' }}
                      >
                        {b.isActive ? 'Active' : 'Disabled'}
                      </span>
                      <span className="text-[9px] otto-mono uppercase tracking-wider text-muted-foreground">
                        Cap L{b.autonomyCap}
                      </span>
                      <span className="text-[9px] otto-mono uppercase tracking-wider text-muted-foreground">
                        {b.allowedActions.length} actions
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div className="lg:col-span-8">
          {draft ? (
            <div className="border border-hair bg-card" style={{ borderColor: 'var(--hair)' }}>
              <div className="px-5 py-3 border-b border-hair flex items-center justify-between" style={{ borderColor: 'var(--hair)' }}>
                <div className="flex items-center gap-2 min-w-0">
                  <Bot size={14} style={{ color: COLOR_TONE[draft.color ?? 'ink'] }} />
                  <span className="otto-mono text-xs text-muted-foreground truncate">
                    bot://{draft.id}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={() => toggle(draft.id!, draft.isActive!)}>
                    <Power size={12} style={{ color: draft.isActive ? 'var(--good)' : 'var(--ink-muted)' }} />
                    {draft.isActive ? 'Active' : 'Disabled'}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={() => remove(draft.id!)}>
                    <Trash2 size={12} /> Delete
                  </Button>
                  <Button size="sm" className="h-7 gap-1" onClick={save}>
                    <Save size={12} /> Save
                  </Button>
                </div>
              </div>

              <div className="p-5 space-y-5">
                {/* Identity */}
                <div className="space-y-3">
                  <div className="otto-eyebrow">Identity</div>
                  <Input
                    value={draft.name ?? ''}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    className="text-base font-semibold"
                  />
                  <Input
                    value={draft.description ?? ''}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    placeholder="Short description"
                  />
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="otto-label block mb-1.5">Color</label>
                      <div className="flex border border-hair">
                        {COLORS.map((c, i) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setDraft({ ...draft, color: c })}
                            className={cn('flex-1 h-8', i > 0 && 'border-l border-hair')}
                            style={{
                              background: draft.color === c ? COLOR_TONE[c] : 'transparent',
                              borderColor: 'var(--hair)',
                            }}
                            title={c}
                          >
                            <span
                              className="inline-block w-2 h-2 rounded-full"
                              style={{ background: COLOR_TONE[c], opacity: draft.color === c ? 1 : 0.5 }}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="otto-label block mb-1.5">Autonomy cap</label>
                      <select
                        value={String(draft.autonomyCap ?? 2)}
                        onChange={(e) => setDraft({ ...draft, autonomyCap: Number(e.target.value) })}
                        className="w-full h-8 px-2 border border-hair bg-card text-sm otto-mono"
                        style={{ borderColor: 'var(--hair)' }}
                      >
                        {[1, 2, 3, 4, 5].map((l) => (<option key={l} value={l}>L{l}</option>))}
                      </select>
                    </div>
                    <div>
                      <label className="otto-label block mb-1.5">Model</label>
                      <Input
                        value={draft.modelName ?? ''}
                        onChange={(e) => setDraft({ ...draft, modelName: e.target.value })}
                        placeholder="e.g. qwen3-coder-32b"
                        className="otto-mono text-xs h-8"
                      />
                    </div>
                  </div>
                </div>

                {/* System prompt */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Sparkles size={12} />
                    <label className="otto-eyebrow">System prompt</label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Define the bot's behavior, tone, and constraints. This is the prompt that shapes every interaction.
                  </p>
                  <Textarea
                    value={draft.systemPrompt ?? ''}
                    onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })}
                    rows={8}
                    placeholder="You are [bot name]. Your job is to…"
                    className="otto-mono text-xs leading-relaxed"
                  />
                </div>

                {/* Allowed actions */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Shield size={12} />
                    <label className="otto-eyebrow">Allowed actions</label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Bot can only perform these actions. Anything else requires dispatching through Otto.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                    {AVAILABLE_ACTIONS.map((a) => {
                      const enabled = (draft.allowedActions ?? []).includes(a.key)
                      return (
                        <button
                          key={a.key}
                          type="button"
                          onClick={() => toggleAction(a.key)}
                          className={cn(
                            'flex items-start gap-2 px-3 py-2 border text-left transition-colors',
                            enabled ? 'border-ink bg-paper-soft' : 'border-hair hover:border-hair-strong'
                          )}
                          style={{
                            borderColor: enabled ? 'var(--ink)' : 'var(--hair)',
                            background: enabled ? 'var(--paper-soft)' : 'transparent',
                          }}
                        >
                          <span
                            className="mt-0.5 inline-block w-3 h-3 border shrink-0 flex items-center justify-center"
                            style={{
                              borderColor: enabled ? 'var(--ink)' : 'var(--hair-strong)',
                              background: enabled ? 'var(--ink)' : 'transparent',
                              color: 'var(--paper)',
                            }}
                          >
                            {enabled && <span className="text-[8px]">✓</span>}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium otto-mono">{a.label}</div>
                            <div className="text-[10px] text-muted-foreground">{a.desc}</div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between text-[10px] otto-mono uppercase tracking-wider text-muted-foreground pt-3 border-t border-hair" style={{ borderColor: 'var(--hair)' }}>
                  <span>Created {formatRelative(draft.createdAt ?? new Date().toISOString())}</span>
                  <span>Updated {formatRelative(draft.updatedAt ?? new Date().toISOString())}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="border border-hair bg-card p-12 text-center text-sm text-muted-foreground" style={{ borderColor: 'var(--hair)' }}>
              Select a bot or create a new one.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
