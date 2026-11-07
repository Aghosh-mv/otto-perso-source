'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, KeyRound, Trash2, ShieldCheck, EyeOff, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { formatRelative, type Credential } from '@/lib/types'

const CATEGORIES = ['banking', 'email', 'social', 'work', 'cloud', 'api', 'other']
const CATEGORY_TONE: Record<string, string> = {
  banking: 'var(--signal)',
  email: 'var(--ink)',
  social: 'var(--ink)',
  work: 'var(--ink)',
  cloud: 'var(--ink)',
  api: 'var(--good)',
  other: 'var(--ink-muted)',
}

export function CredentialsView() {
  const [creds, setCreds] = useState<Credential[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ label: '', category: 'api', issuer: '', value: '', notes: '' })

  const load = useCallback(() => {
    fetch('/api/credentials').then((r) => r.json()).then(setCreds)
  }, [])
  useEffect(() => { load() }, [load])

  async function add() {
    if (!form.label.trim() || !form.value.trim()) {
      toast.error('Label and secret value required')
      return
    }
    const res = await fetch('/api/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (!res.ok) {
      toast.error('Could not add credential')
      return
    }
    toast.success('Credential stored', { description: 'Otto will only see the category — never the secret.' })
    setForm({ label: '', category: 'api', issuer: '', value: '', notes: '' })
    setOpen(false)
    load()
  }

  async function remove(id: string) {
    await fetch(`/api/credentials/${id}`, { method: 'DELETE' })
    toast.success('Credential removed')
    load()
  }

  const byCategory = CATEGORIES.map((c) => ({
    category: c,
    items: creds.filter((x) => x.category === c),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Credentials</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Stored encrypted on disk. Otto sees only the <strong className="text-foreground">category</strong> and label —
            never the secret itself. When a task needs a credential, Otto requests access by category; you approve.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5"><Plus size={15} /> Add credential</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add credential</DialogTitle>
              <DialogDescription>
                The value is encrypted before storage. Only the masked version is shown afterward.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <label className="otto-label block mb-1.5">Label</label>
                <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Chase checking" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="otto-label block mb-1.5">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full h-9 px-2 border border-hair bg-card text-sm otto-mono"
                    style={{ borderColor: 'var(--hair)' }}
                  >
                    {CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
                  </select>
                </div>
                <div>
                  <label className="otto-label block mb-1.5">Issuer</label>
                  <Input value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} placeholder="e.g. Chase" />
                </div>
              </div>
              <div>
                <label className="otto-label block mb-1.5">Secret value</label>
                <Input
                  type="password"
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                  placeholder="Will be encrypted on save"
                />
              </div>
              <div>
                <label className="otto-label block mb-1.5">Notes (optional)</label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  placeholder="Context Otto can see without the secret"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={add}>Store encrypted</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Privacy banner */}
      <div
        className="border px-4 py-3 flex items-start gap-3 text-sm"
        style={{
          borderColor: 'var(--hair)',
          background: 'var(--paper-soft)',
        }}
      >
        <EyeOff size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--ink)' }} />
        <div>
          <strong className="text-foreground">Otto cannot read these secrets.</strong>{' '}
          <span className="text-muted-foreground">
            When Otto needs a credential, it asks for access by category. You approve once per task or per session.
            The decrypted value is passed directly to the target app — never to Otto's context window.
          </span>
        </div>
      </div>

      {/* Categorized grid */}
      {byCategory.length === 0 && (
        <div className="border border-hair bg-card p-12 text-center text-sm text-muted-foreground" style={{ borderColor: 'var(--hair)' }}>
          No credentials stored yet.
        </div>
      )}
      {byCategory.map((group) => (
        <section key={group.category}>
          <div className="flex items-center gap-2 mb-3">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: CATEGORY_TONE[group.category] }}
            />
            <h2 className="otto-eyebrow">{group.category}</h2>
            <span className="text-[10px] otto-mono text-muted-foreground">({group.items.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {group.items.map((c) => (
              <div key={c.id} className="border border-hair bg-card p-4 group" style={{ borderColor: 'var(--hair)' }}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.label}</div>
                    {c.issuer && <div className="text-[10px] otto-mono uppercase tracking-wider text-muted-foreground mt-0.5">{c.issuer}</div>}
                  </div>
                  <KeyRound size={13} className="text-muted-foreground shrink-0" />
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <code className="text-xs otto-mono px-2 py-1 border border-hair bg-paper-soft flex-1 truncate" style={{ borderColor: 'var(--hair)', background: 'var(--paper-soft)' }}>
                    {c.maskedValue}
                  </code>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">{formatRelative(c.createdAt)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs opacity-0 group-hover:opacity-100"
                    onClick={() => remove(c.id)}
                  >
                    <Trash2 size={11} /> Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Trust footer */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck size={12} />
        <span className="otto-mono uppercase tracking-wider">
          {creds.length} credentials · all encrypted at rest · zero plaintext in app memory after storage
        </span>
      </div>
    </div>
  )
}
