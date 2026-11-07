'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Search, Pin, Trash2, Save, FolderOpen, HardDrive, RefreshCw, FolderTree } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { formatRelative, parseFrontmatter, parseTags, type VaultNote } from '@/lib/types'
import { useOttoRealtime } from '@/hooks/use-otto-realtime'

const CATEGORIES = ['all', 'preference', 'decision', 'pattern', 'memory', 'recipe', 'log', 'general']
const CATEGORY_TONE: Record<string, string> = {
  preference: 'var(--ink)',
  decision: 'var(--warn)',
  pattern: 'var(--good)',
  memory: 'var(--ink-muted)',
  recipe: 'var(--ink)',
  log: 'var(--ink-muted)',
  general: 'var(--ink-muted)',
}

interface DiskStats {
  vaultDir: string
  totalFiles: number
  totalBytes: number
  lastModified: string | null
}

export function VaultView() {
  const [notes, setNotes] = useState<VaultNote[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<Partial<VaultNote> | null>(null)
  const [diskStats, setDiskStats] = useState<DiskStats | null>(null)
  const [syncing, setSyncing] = useState(false)

  // Subscribe to realtime vault external edit/delete events
  const realtime = useOttoRealtime({
    onVaultEdit: (filePath) => {
      // Reload the note list + the selected note if it changed
      load()
      toast.info('Vault note edited externally', {
        description: filePath,
      })
    },
    onVaultDelete: (filePath) => {
      load()
      toast.info('Vault note deleted externally', {
        description: filePath,
      })
    },
  })

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    if (filter !== 'all') params.set('category', filter)
    if (search) params.set('q', search)
    const res = await fetch(`/api/vault?${params}`)
    const data = await res.json()
    setNotes(data)
    if (!selectedId && data.length > 0) setSelectedId(data[0].id)
    // Refresh disk stats too
    fetch('/api/vault/sync').then((r) => r.json()).then(setDiskStats).catch(() => {})
  }, [filter, search, selectedId])

  useEffect(() => { load() }, [load])

  async function syncNow() {
    setSyncing(true)
    try {
      const res = await fetch('/api/vault/sync', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        toast.success(`Synced ${data.written} notes to disk`, {
          description: data.vaultDir,
        })
        setDiskStats({ vaultDir: data.vaultDir, ...data.stats })
      } else {
        toast.error('Sync failed')
      }
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    if (!selectedId) {
      setDraft(null)
      return
    }
    const n = notes.find((x) => x.id === selectedId)
    setDraft(n ? { ...n } : null)
  }, [selectedId, notes])

  async function save() {
    if (!draft || !draft.title) {
      toast.error('Title required')
      return
    }
    const body = {
      title: draft.title,
      category: draft.category ?? 'general',
      tags: draft.tags ?? '',
      body: draft.body ?? '',
      frontmatter: typeof draft.frontmatter === 'string' ? parseFrontmatter(draft.frontmatter) : draft.frontmatter ?? {},
      pinned: draft.pinned ?? false,
    }
    if (draft.id) {
      await fetch(`/api/vault/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      toast.success('Note saved', { description: 'Synced to disk as Markdown' })
    } else {
      const res = await fetch('/api/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const created = await res.json()
      setSelectedId(created.id)
      toast.success('Note created')
    }
    load()
  }

  async function createNew() {
    setSelectedId(null)
    setDraft({
      title: '',
      category: 'general',
      tags: '',
      body: '',
      frontmatter: '{}',
      pinned: false,
    })
  }

  async function remove(id: string) {
    await fetch(`/api/vault/${id}`, { method: 'DELETE' })
    toast.success('Note deleted')
    if (selectedId === id) setSelectedId(null)
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Vault</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Otto's memory, stored as plain Markdown on your disk. Open it in Obsidian any time.
            Otto reads and writes the same files you do.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {diskStats && (
            <div
              className="flex items-center gap-2 text-[10px] otto-mono uppercase tracking-wider text-muted-foreground border px-2.5 py-1.5"
              style={{ borderColor: 'var(--hair)' }}
              title={diskStats.vaultDir}
            >
              <FolderTree size={12} />
              <span
                className="otto-signal-dot"
                style={{
                  background: realtime.connected ? 'var(--good)' : 'var(--ink-muted)',
                  animation: realtime.connected ? 'otto-pulse 1.6s ease-in-out infinite' : undefined,
                }}
              />
              {diskStats.totalFiles} files · {(diskStats.totalBytes / 1024).toFixed(1)} KB
              {diskStats.lastModified && (
                <span className="opacity-60">· {formatRelative(diskStats.lastModified)}</span>
              )}
              {realtime.connected && <span className="opacity-60">· live</span>}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={syncNow}
            disabled={syncing}
            className="gap-1.5"
          >
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync now'}
          </Button>
          <Button onClick={createNew} className="gap-1.5">
            <Plus size={15} /> New note
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* List */}
        <div className="lg:col-span-4 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes…"
              className="pl-8"
            />
          </div>
          {/* Category filter */}
          <div className="flex flex-wrap gap-1">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={cn(
                  'px-2 py-1 text-[10px] otto-mono uppercase tracking-wider border transition-colors',
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
          {/* Notes */}
          <div className="border border-hair bg-card divide-y divide-hair max-h-[600px] overflow-y-auto" style={{ borderColor: 'var(--hair)' }}>
            {notes.length === 0 && <div className="px-4 py-8 text-center text-sm text-muted-foreground">No notes.</div>}
            {notes.map((n) => (
              <button
                key={n.id}
                onClick={() => setSelectedId(n.id)}
                className={cn(
                  'w-full text-left px-4 py-3 transition-colors hover:bg-paper-soft',
                  selectedId === n.id && 'bg-paper-soft'
                )}
                style={{ background: selectedId === n.id ? 'var(--paper-soft)' : undefined }}
              >
                <div className="flex items-start gap-2">
                  {n.pinned && <Pin size={11} className="mt-0.5 shrink-0" style={{ color: 'var(--signal)' }} />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{n.title}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className="text-[9px] otto-mono uppercase tracking-wider"
                        style={{ color: CATEGORY_TONE[n.category] ?? 'var(--ink-muted)' }}
                      >
                        {n.category}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{formatRelative(n.updatedAt)}</span>
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
              {/* Header bar */}
              <div className="px-5 py-3 border-b border-hair flex items-center justify-between gap-3" style={{ borderColor: 'var(--hair)' }}>
                <div className="flex items-center gap-2 min-w-0">
                  <FolderOpen size={13} className="shrink-0" />
                  <span className="otto-mono text-xs text-muted-foreground truncate">
                    {draft.filePath
                      ? `${diskStats?.vaultDir ?? '/home/z/my-project/otto-vault'}/${draft.filePath}`
                      : `vault://notes/${draft.id ?? 'new'}.md (unsaved)`}
                  </span>
                  {draft.filePath && (
                    <span
                      className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] otto-mono uppercase tracking-wider border"
                      style={{ borderColor: 'var(--good)', color: 'var(--good)' }}
                    >
                      <span className="otto-signal-dot" style={{ background: 'var(--good)' }} /> On disk
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={() => draft.id && remove(draft.id)}>
                    <Trash2 size={12} /> Delete
                  </Button>
                  <Button size="sm" className="h-7 gap-1" onClick={save}>
                    <Save size={12} /> Save
                  </Button>
                </div>
              </div>
              {/* Body */}
              <div className="p-5 space-y-4">
                <div>
                  <Input
                    value={draft.title ?? ''}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    placeholder="Note title"
                    className="text-lg font-semibold border-0 px-0 focus-visible:ring-0"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="otto-label block mb-1.5">Category</label>
                    <select
                      value={draft.category ?? 'general'}
                      onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                      className="w-full h-9 px-2 border border-hair bg-card text-sm otto-mono"
                      style={{ borderColor: 'var(--hair)' }}
                    >
                      {CATEGORIES.filter((c) => c !== 'all').map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="otto-label block mb-1.5">Tags</label>
                    <Input
                      value={draft.tags ?? ''}
                      onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
                      placeholder="comma, separated"
                      className="otto-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="otto-label block mb-1.5">Pinned</label>
                    <button
                      onClick={() => setDraft({ ...draft, pinned: !draft.pinned })}
                      className={cn(
                        'w-full h-9 flex items-center justify-center gap-1.5 border text-xs otto-mono uppercase tracking-wider',
                        draft.pinned ? 'border-signal text-signal' : 'border-hair text-muted-foreground'
                      )}
                      style={{
                        borderColor: draft.pinned ? 'var(--signal)' : 'var(--hair)',
                        color: draft.pinned ? 'var(--signal)' : 'var(--ink-muted)',
                      }}
                    >
                      <Pin size={12} /> {draft.pinned ? 'Pinned' : 'Not pinned'}
                    </button>
                  </div>
                </div>
                {/* Frontmatter */}
                <div>
                  <label className="otto-label block mb-1.5">Frontmatter (JSON)</label>
                  <Textarea
                    value={typeof draft.frontmatter === 'string' ? draft.frontmatter : JSON.stringify(draft.frontmatter ?? {}, null, 2)}
                    onChange={(e) => setDraft({ ...draft, frontmatter: e.target.value })}
                    rows={4}
                    className="otto-mono text-xs"
                  />
                </div>
                {/* Body */}
                <div>
                  <label className="otto-label block mb-1.5">Body (Markdown)</label>
                  <Textarea
                    value={draft.body ?? ''}
                    onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                    rows={14}
                    className="otto-mono text-xs leading-relaxed"
                  />
                </div>
                {/* Tag chips */}
                {draft.tags && (
                  <div className="flex flex-wrap gap-1">
                    {parseTags(draft.tags).map((t) => (
                      <span key={t} className="px-1.5 py-0.5 text-[10px] otto-mono border border-hair" style={{ borderColor: 'var(--hair)', color: 'var(--ink-muted)' }}>
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="border border-hair bg-card p-12 text-center text-sm text-muted-foreground" style={{ borderColor: 'var(--hair)' }}>
              Select a note or create a new one.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
