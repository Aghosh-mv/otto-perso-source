'use client'

import { useEffect, useState, useRef } from 'react'
import { OctagonX, Sparkles, Clock, Activity, ChevronRight, Bot, ShieldCheck, Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useOtto } from './store'
import { EmergencyStopDialog } from './emergency-stop'
import { toast } from 'sonner'
import { formatRelative, type ProactivePrompt, type Task, type ActivityLog } from '@/lib/types'

interface MobileData {
  activeTasks: number
  awaitingTasks: Task[]
  prompts: ProactivePrompt[]
  recentActivity: ActivityLog[]
  agentCount: number
  currentAutonomy: { level: number; name: string; tagline: string } | null
  emergency: { active: boolean }
}

interface MobileMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  status: 'streaming' | 'done' | 'error'
}

const AUTONOMY_TONE: Record<number, string> = {
  1: 'var(--ink-muted)',
  2: 'var(--ink-muted)',
  3: 'var(--ink)',
  4: 'var(--warn)',
  5: 'var(--signal)',
}

// Mobile companion — focused on what you need when away from desktop:
// status, emergency stop, awaiting approvals, Otto's suggestions, + a compact chat.
// Shown instead of the desktop layout when viewport is mobile.
export function MobileCompanion() {
  const { setView, setCurrentAutonomyLevel, setEmergencyActive, emergencyActive } = useOtto()
  const [data, setData] = useState<MobileData | null>(null)
  const [confirmingStop, setConfirmingStop] = useState(false)

  // ─── Compact chat state ──────────────────────────────────────────────────
  const [convoId, setConvoId] = useState<string | null>(null)
  const [messages, setMessages] = useState<MobileMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [liveTokens, setLiveTokens] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Get or create a conversation for the mobile session
  useEffect(() => {
    async function getConvo() {
      try {
        const list = await fetch('/api/conversations').then((r) => r.json())
        const items = Array.isArray(list) ? list : []
        if (items.length > 0) {
          // Use most recent
          setConvoId(items[0].id)
        } else {
          // Create one
          const c = await fetch('/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Mobile' }),
          }).then((r) => r.json())
          setConvoId(c.id)
        }
      } catch {}
    }
    getConvo()
  }, [])

  // Load messages when convo changes
  useEffect(() => {
    if (!convoId) return
    fetch(`/api/conversations/${convoId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.messages) {
          setMessages(data.messages
            .filter((m: any) => m.role === 'user' || m.role === 'assistant')
            .slice(-20)
            .map((m: any) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              status: m.status,
            })))
        }
      })
      .catch(() => {})
  }, [convoId])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, liveTokens])

  async function sendMobile(textArg?: string) {
    const text = (textArg ?? input).trim()
    if (!text || !convoId || sending) return
    setInput('')
    setSending(true)
    setLiveTokens('')

    const userMsg: MobileMessage = {
      id: `mu-${Date.now()}`,
      role: 'user',
      content: text,
      status: 'done',
    }
    const ottoId = `mo-${Date.now()}`
    const ottoMsg: MobileMessage = {
      id: ottoId,
      role: 'assistant',
      content: '',
      status: 'streaming',
    }
    setMessages((prev) => [...prev, userMsg, ottoMsg])

    try {
      await fetch(`/api/conversations/${convoId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'user', content: text }),
      })
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: convoId }),
      })
      if (r.status === 429) {
        const err = await r.json()
        setMessages((prev) => prev.map((m) => m.id === ottoId ? { ...m, content: `_Rate limited: ${err.error}_`, status: 'error' } : m))
        setSending(false)
        return
      }
      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`)

      const reader = r.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let tokenAcc = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''
        for (const ev of events) {
          const line = ev.startsWith('data: ') ? ev.slice(6) : ev
          if (!line) continue
          try {
            const parsed = JSON.parse(line)
            if (parsed.type === 'token') {
              tokenAcc += parsed.text
              setLiveTokens(tokenAcc)
            } else if (parsed.type === 'done') {
              setMessages((prev) => prev.map((m) => m.id === ottoId ? { ...m, content: tokenAcc, status: 'done' } : m))
              setLiveTokens('')
            } else if (parsed.type === 'error') {
              setMessages((prev) => prev.map((m) => m.id === ottoId ? { ...m, content: `_${parsed.error}_`, status: 'error' } : m))
              setLiveTokens('')
            }
          } catch {}
        }
      }
    } catch (e) {
      setMessages((prev) => prev.map((m) => m.id === ottoId ? { ...m, content: `_${(e as Error).message}_`, status: 'error' } : m))
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    async function load() {
      const [sys, tasks, prompts, activity] = await Promise.all([
        fetch('/api/system').then((r) => r.json()),
        fetch('/api/tasks?status=waiting_approval').then((r) => r.json()),
        fetch('/api/proactive').then((r) => r.json()),
        fetch('/api/activity').then((r) => r.json()),
      ])
      setData({
        activeTasks: (sys.tasksByStatus.executing ?? 0) + (sys.tasksByStatus.queued ?? 0),
        awaitingTasks: tasks,
        prompts,
        recentActivity: (activity as ActivityLog[]).slice(0, 4),
        agentCount: sys.totalAgents,
        currentAutonomy: sys.currentAutonomy,
        emergency: sys.emergency,
      })
      if (sys.currentAutonomy) setCurrentAutonomyLevel(sys.currentAutonomy.level)
      setEmergencyActive(sys.emergency.active)
    }
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [setCurrentAutonomyLevel, setEmergencyActive])

  async function resolvePrompt(id: string, action: 'accept' | 'dismiss') {
    await fetch('/api/proactive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    })
    setData((prev) => prev ? { ...prev, prompts: prev.prompts.filter((p) => p.id !== id) } : prev)
    if (action === 'accept') toast.success('Accepted — task queued')
  }

  async function approveTask(id: string) {
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'executing' }),
    })
    setData((prev) => prev ? { ...prev, awaitingTasks: prev.awaitingTasks.filter((t) => t.id !== id) } : prev)
    toast.success('Task approved')
  }

  async function cancelTask(id: string) {
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    })
    setData((prev) => prev ? { ...prev, awaitingTasks: prev.awaitingTasks.filter((t) => t.id !== id) } : prev)
    toast.success('Task cancelled')
  }

  if (!data) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
  }

  const autonomy = data.currentAutonomy
  const tone = autonomy ? AUTONOMY_TONE[autonomy.level] ?? 'var(--ink)' : 'var(--ink)'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--paper)' }}>
      {/* Top status bar */}
      <header
        className="px-5 py-4 border-b-2"
        style={{ borderColor: emergencyActive ? 'var(--signal)' : 'var(--ink)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="otto-signal-dot otto-pulse"
              style={{ background: emergencyActive ? 'var(--signal)' : 'var(--good)' }}
            />
            <span className="otto-mono text-xs uppercase tracking-wider text-muted-foreground">
              {emergencyActive ? 'Halted' : 'Online'}
            </span>
          </div>
          <span className="otto-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <div className="mt-4">
          <div className="text-2xl font-semibold tracking-tight">Otto</div>
          <div className="text-sm text-muted-foreground">{autonomy?.tagline ?? 'Loading…'}</div>
        </div>

        {/* Autonomy badge */}
        <div className="mt-3 flex items-center gap-2">
          <span className="otto-label">Autonomy</span>
          <span
            className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] otto-mono uppercase tracking-wider font-medium border"
            style={{ color: tone, borderColor: tone }}
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: tone }} />
            L{autonomy?.level ?? '—'} · {autonomy?.name ?? '—'}
          </span>
        </div>

        {/* Stats row */}
        <div className="mt-4 grid grid-cols-3 gap-px" style={{ background: 'var(--hair)' }}>
          <div className="bg-card p-3" style={{ background: 'var(--card)' }}>
            <div className="otto-label">Active</div>
            <div className="text-xl font-semibold tabular-nums">{data.activeTasks}</div>
          </div>
          <div className="bg-card p-3" style={{ background: 'var(--card)' }}>
            <div className="otto-label">Agents</div>
            <div className="text-xl font-semibold tabular-nums">{data.agentCount}</div>
          </div>
          <div className="bg-card p-3" style={{ background: 'var(--card)' }}>
            <div className="otto-label">Awaiting</div>
            <div className="text-xl font-semibold tabular-nums" style={{ color: data.awaitingTasks.length > 0 ? 'var(--warn)' : 'var(--ink)' }}>
              {data.awaitingTasks.length}
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Compact chat — talk to Otto from your phone */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Bot size={14} />
            <h2 className="otto-eyebrow">Talk to Otto</h2>
          </div>
          <div className="border" style={{ borderColor: 'var(--hair)' }}>
            {/* Messages */}
            <div
              ref={scrollRef}
              className="max-h-[300px] overflow-y-auto p-3 space-y-2.5"
              style={{ background: 'var(--card)' }}
            >
              {messages.length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-6">
                  Say something to Otto…
                </div>
              )}
              {messages.map((m) => {
                const isStreaming = m.status === 'streaming'
                const content = isStreaming ? liveTokens : m.content
                return (
                  <div
                    key={m.id}
                    className={m.role === 'user' ? 'flex justify-end' : 'flex gap-2'}
                  >
                    {m.role === 'assistant' && (
                      <div className="h-5 w-5 bg-foreground text-background flex items-center justify-center font-mono text-[9px] font-bold flex-shrink-0 mt-0.5">O</div>
                    )}
                    <div
                      className={
                        m.role === 'user'
                          ? 'max-w-[80%] bg-foreground text-background px-2.5 py-1.5 text-xs'
                          : 'max-w-[80%] bg-background border px-2.5 py-1.5 text-xs'
                      }
                      style={m.role === 'assistant' ? { borderColor: 'var(--hair)' } : undefined}
                    >
                      {content || (isStreaming ? (
                        <span className="text-muted-foreground italic flex items-center gap-1">
                          <Loader2 size={10} className="animate-spin" /> thinking…
                        </span>
                      ) : '')}
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Input */}
            <div className="border-t flex items-center gap-2 p-2" style={{ borderColor: 'var(--hair)' }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMobile() } }}
                placeholder="Tell Otto…"
                disabled={sending}
                className="flex-1 bg-transparent text-xs outline-none px-1"
              />
              <button
                onClick={() => sendMobile()}
                disabled={sending || !input.trim()}
                className="h-7 w-7 bg-foreground text-background flex items-center justify-center disabled:opacity-30"
              >
                {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              </button>
            </div>
          </div>
          {/* Quick suggestions */}
          {messages.length === 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {['Status?', 'What are you working on?', 'Read my vault'].map((s) => (
                <button
                  key={s}
                  onClick={() => sendMobile(s)}
                  className="text-[10px] px-2 py-1 border"
                  style={{ borderColor: 'var(--hair)' }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Awaiting approval */}
        {data.awaitingTasks.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Clock size={14} style={{ color: 'var(--warn)' }} />
              <h2 className="otto-eyebrow">Needs your approval</h2>
            </div>
            <div className="space-y-2">
              {data.awaitingTasks.map((t) => (
                <div key={t.id} className="border p-3" style={{ borderColor: 'var(--warn)', background: 'var(--warn-soft)' }}>
                  <div className="text-sm font-medium">{t.title}</div>
                  {t.description && <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>}
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" className="h-7 text-xs flex-1" onClick={() => approveTask(t.id)}>Approve</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => cancelTask(t.id)}>Cancel</Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Otto suggests */}
        {data.prompts.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} style={{ color: 'var(--signal)' }} />
              <h2 className="otto-eyebrow">Otto suggests</h2>
            </div>
            <div className="space-y-2">
              {data.prompts.map((p) => (
                <div key={p.id} className="border p-3" style={{ borderColor: 'var(--hair)', background: 'var(--card)' }}>
                  <p className="text-sm leading-relaxed">{p.content}</p>
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" className="h-7 text-xs flex-1" onClick={() => resolvePrompt(p.id, 'accept')}>Accept</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => resolvePrompt(p.id, 'dismiss')}>Dismiss</Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recent activity */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Activity size={14} />
            <h2 className="otto-eyebrow">Recent</h2>
          </div>
          <div className="border divide-y divide-hair" style={{ borderColor: 'var(--hair)' }}>
            {data.recentActivity.map((a) => (
              <div key={a.id} className="px-3 py-2">
                <div className="text-xs">
                  <span className="otto-mono text-muted-foreground">{a.agentName}</span>{' '}
                  <span>{a.summary}</span>
                </div>
                <div className="text-[10px] otto-mono text-muted-foreground mt-0.5">
                  {formatRelative(a.createdAt)} · {a.action}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Quick nav */}
        <section>
          <h2 className="otto-eyebrow mb-3">Jump to</h2>
          <div className="border divide-y divide-hair" style={{ borderColor: 'var(--hair)' }}>
            {[
              { label: 'Tasks', view: 'tasks' as const },
              { label: 'Agents', view: 'agents' as const },
              { label: 'Vault', view: 'vault' as const },
              { label: 'Timeline', view: 'timeline' as const },
              { label: 'Settings', view: 'settings' as const },
            ].map((item) => (
              <button
                key={item.view}
                onClick={() => setView(item.view)}
                className="w-full px-3 py-3 flex items-center justify-between text-sm hover:bg-paper-soft"
              >
                <span>{item.label}</span>
                <ChevronRight size={14} className="text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>
      </main>

      {/* Sticky bottom: Emergency Stop */}
      <footer className="sticky bottom-0 p-4 border-t-2" style={{ borderColor: 'var(--signal)', background: 'var(--paper)' }}>
        <Button
          onClick={() => setConfirmingStop(true)}
          className="w-full h-12 gap-2 text-sm font-medium uppercase tracking-wider"
          style={{ background: 'var(--signal)', color: 'var(--signal-fg)' }}
        >
          <OctagonX size={16} />
          Emergency Stop
        </Button>
        <div className="text-center mt-2 text-[10px] otto-mono uppercase tracking-wider text-muted-foreground">
          Halts all agents · cancels queued tasks
        </div>
      </footer>

      <EmergencyStopDialog open={confirmingStop} onOpenChange={setConfirmingStop} />
    </div>
  )
}
