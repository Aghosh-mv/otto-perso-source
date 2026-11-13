'use client'

// Otto's home — the chat is the main interface, surrounded by 4 panels:
//   [control sidebar] | [chat] | [right panel: thoughts / vault tabs]
// Inside the chat panel: a conversation list strip on the left edge.

import { useEffect, useState, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import {
  Send, Plus, Trash2, Pin, ChevronDown, Loader2, Brain, Cpu,
  Network, BookMarked, Gauge, Zap, Activity, CheckCircle2, XCircle,
  Wrench, FileText, Search, Sparkles, ExternalLink, LogOut, RefreshCw,
} from 'lucide-react'
import { useOtto } from '@/components/otto/store'
import { toast } from 'sonner'
import { formatRelative, type Agent, type Task } from '@/lib/types'
import { signOut, useSession } from 'next-auth/react'

// ─── Types ─────────────────────────────────────────────────────────────────
interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  thoughts?: string
  actions: { type: string; action: string; target?: string; status?: string; summary?: string }[]
  confidence: number
  autonomyLevel: number
  status: 'streaming' | 'done' | 'error'
  totalTokens?: number
  model?: string
  createdAt: string
}

interface Conversation {
  id: string
  title: string
  isPinned: boolean
  autonomyLevel: number
  messages: Message[]
  createdAt: string
  updatedAt: string
}

interface ConversationListItem {
  id: string
  title: string
  isPinned: boolean
  autonomyLevel: number
  messageCount: number
  createdAt: string
  updatedAt: string
}

interface VaultNoteLite {
  id: string
  title: string
  category: string
  body: string
  tags: string
  pinned: boolean
  updatedAt: string
}

interface ActivityItem {
  id: string
  agentName: string | null
  action: string
  target: string | null
  summary: string
  riskTier: string
  createdAt: string
}

interface UsageStatus {
  allowed: boolean
  reason?: string
  minute: { used: number; limit: number; resetsInSec: number }
  hourly: { used: number; limit: number }
  daily: { used: number; limit: number }
  peak: { used: number; limit: number; isPeak: boolean }
  monthly: { used: number; limit: number }
}

interface ProactivePrompt {
  id: string
  content: string
  suggestedAction: string | null
  trigger: string | null
  confidence: number
  status: string
  createdAt: string
}

// ─── Autonomy helpers ──────────────────────────────────────────────────────
const AUTONOMY_NAMES: Record<number, string> = {
  1: 'Ask Before Editing',
  2: 'Mild Edits Only',
  3: 'Chosen Edits',
  4: 'Bypass All Approvals',
  5: 'Vacation Mode',
}
const AUTONOMY_TONE: Record<number, string> = {
  1: 'bg-muted text-foreground',
  2: 'bg-muted text-foreground',
  3: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200',
  4: 'bg-orange-100 text-orange-900 dark:bg-orange-900/30 dark:text-orange-200',
  5: 'bg-red-600 text-white',
}

const SUGGESTIONS = [
  'What do you know about me?',
  'Search the web for "AI agents 2026" and summarize.',
  'Create a task: review my vault weekly.',
  'Remember that I prefer terse replies with bullet points.',
  'What are you working on right now?',
  'Spawn an agent to research Node 22 features.',
]

// ─── Main view ─────────────────────────────────────────────────────────────
export function ChatView() {
  const { data: session } = useSession()
  const { setView } = useOtto()
  const [conversations, setConversations] = useState<ConversationListItem[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [convo, setConvo] = useState<Conversation | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [liveThoughts, setLiveThoughts] = useState('')
  const [liveTokens, setLiveTokens] = useState('')
  const [streamingId, setStreamingId] = useState<string | null>(null)
  const [autonomyOpen, setAutonomyOpen] = useState(false)
  const [rightTab, setRightTab] = useState<'thoughts' | 'vault'>('thoughts')
  const [usage, setUsage] = useState<UsageStatus | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [vaultNotes, setVaultNotes] = useState<VaultNoteLite[]>([])
  const [vaultFilter, setVaultFilter] = useState<string>('all')
  const [vaultQuery, setVaultQuery] = useState('')
  const [proactivePrompts, setProactivePrompts] = useState<ProactivePrompt[]>([])
  const [dismissedPrompts, setDismissedPrompts] = useState<Set<string>>(new Set())

  const scrollRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const autonomyRef = useRef<HTMLDivElement>(null)

  // ─── Load conversation list ──────────────────────────────────────────────
  const refreshList = useCallback(async () => {
    try {
      const r = await fetch('/api/conversations')
      if (!r.ok) return
      const data = await r.json()
      setConversations(data)
    } catch {}
  }, [])

  useEffect(() => { refreshList() }, [refreshList])

  // ─── Load current conversation ───────────────────────────────────────────
  useEffect(() => {
    if (!currentId) {
      // Auto-pick the most recent conversation
      refreshList().then(() => {
        if (conversations.length > 0 && !currentId) {
          setCurrentId(conversations[0].id)
        }
      })
      return
    }
    let cancelled = false
    fetch(`/api/conversations/${currentId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data) setConvo(data)
      })
      .catch(() => {})
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId])

  // ─── Poll sidebar data (agents, tasks, activity, usage) ──────────────────
  useEffect(() => {
    async function poll() {
      try {
        const [a, t, act, u] = await Promise.all([
          fetch('/api/agents').then((r) => r.json()).catch(() => []),
          fetch('/api/tasks').then((r) => r.json()).catch(() => []),
          fetch('/api/activity?limit=15').then((r) => r.json()).catch(() => []),
          fetch('/api/usage').then((r) => r.json()).catch(() => null),
        ])
        setAgents(Array.isArray(a) ? a : (a?.items ?? []))
        setTasks(Array.isArray(t) ? t : (t?.items ?? []))
        setActivity(Array.isArray(act) ? act : (act?.items ?? []))
        if (u) setUsage(u)
      } catch {}
    }
    poll()
    const f = setInterval(poll, 4000)
    return () => clearInterval(f)
  }, [])

  // ─── Poll vault ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function pollVault() {
      try {
        const r = await fetch('/api/vault')
        const data = await r.json()
        const notes = data?.items ?? data ?? []
        setVaultNotes(Array.isArray(notes) ? notes : [])
      } catch {}
    }
    pollVault()
    const v = setInterval(pollVault, 6000)
    return () => clearInterval(v)
  }, [])

  // ─── Proactive prompts: generate on load + every 5 min ───────────────────
  useEffect(() => {
    async function fetchProactive() {
      try {
        // Ask Otto to observe and generate new prompts
        await fetch('/api/proactive/generate', { method: 'POST' }).catch(() => {})
        // Fetch pending
        const r = await fetch('/api/proactive')
        const data = await r.json()
        const items = Array.isArray(data) ? data : (data?.items ?? [])
        setProactivePrompts(items)
      } catch {}
    }
    fetchProactive()
    const p = setInterval(fetchProactive, 5 * 60 * 1000) // every 5 min
    return () => clearInterval(p)
  }, [])

  async function resolveProactive(id: string, action: 'accept' | 'dismiss') {
    try {
      const r = await fetch('/api/proactive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      if (action === 'accept') {
        const data = await r.json()
        toast.success('Task created from prompt.')
        // If a task was created, send it to Otto as a chat message
        if (data.taskId && currentId) {
          const prompt = proactivePrompts.find((p) => p.id === id)
          if (prompt?.suggestedAction) {
            send(`Please work on this: ${prompt.suggestedAction}. Context: ${prompt.content}`)
          }
        }
      }
      setDismissedPrompts((prev) => new Set(prev).add(id))
      setProactivePrompts((prev) => prev.filter((p) => p.id !== id))
    } catch {
      toast.error("Couldn't resolve prompt.")
    }
  }
  // ─── Click-away for autonomy dropdown ────────────────────────────────────
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (autonomyRef.current && !autonomyRef.current.contains(e.target as Node)) {
        setAutonomyOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // ─── Auto-scroll on new tokens ───────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [convo, liveTokens, liveThoughts])

  // ─── Actions ─────────────────────────────────────────────────────────────
  async function newConversation() {
    try {
      const r = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New conversation' }),
      })
      const data = await r.json()
      await refreshList()
      setCurrentId(data.id)
    } catch {
      toast.error("Couldn't start a new conversation.")
    }
  }

  async function deleteConversation(id: string) {
    if (!confirm('Delete this conversation?')) return
    try {
      await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
      if (currentId === id) setCurrentId(null)
      await refreshList()
      toast.success('Deleted.')
    } catch {
      toast.error("Couldn't delete.")
    }
  }

  async function pinConversation(id: string, current: boolean) {
    try {
      await fetch(`/api/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPinned: !current }),
      })
      await refreshList()
      if (convo?.id === id) setConvo({ ...convo, isPinned: !current })
    } catch {}
  }

  async function setAutonomy(level: number) {
    if (!currentId || !convo) return
    try {
      const r = await fetch(`/api/conversations/${currentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autonomyLevel: level }),
      })
      const data = await r.json()
      setConvo({ ...convo, autonomyLevel: level })
      setAutonomyOpen(false)
    } catch {}
  }

  async function send(textArg?: string) {
    const text = (textArg ?? input).trim()
    if (!text || !currentId || sending) return

    setInput('')
    setSending(true)
    setLiveThoughts('')
    setLiveTokens('')
    try { localStorage.setItem('otto.mascot.mood', 'think') } catch {} // Lok mirrors Otto thinking

    // Optimistic: append user message and a streaming placeholder
    const userMsg: Message = {
      id: `tmp-user-${Date.now()}`,
      role: 'user',
      content: text,
      actions: [],
      confidence: 1,
      autonomyLevel: convo?.autonomyLevel ?? 2,
      status: 'done',
      createdAt: new Date().toISOString(),
    }
    const streamMsgId = `tmp-otto-${Date.now()}`
    const streamMsg: Message = {
      id: streamMsgId,
      role: 'assistant',
      content: '',
      actions: [],
      confidence: 0,
      autonomyLevel: convo?.autonomyLevel ?? 2,
      status: 'streaming',
      createdAt: new Date().toISOString(),
    }
    setConvo((c) => c ? {
      ...c,
      messages: [...c.messages, userMsg, streamMsg],
    } : c)
    setStreamingId(streamMsgId)

    try {
      // Persist user message via API
      await fetch(`/api/conversations/${currentId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'user', content: text }),
      })

      // Kick off the chat (SSE)
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: currentId }),
      })

      if (r.status === 429) {
        const err = await r.json()
        toast.error(err.error || 'Rate limited. Try again soon.')
        setConvo((c) => c ? {
          ...c,
          messages: c.messages.map((m) => m.id === streamMsgId ? { ...m, content: `_${err.error}_`, status: 'error' } : m),
        } : c)
        setSending(false)
        setStreamingId(null)
        return
      }
      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`)

      const reader = r.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let realId: string | null = null
      let actionsAcc: Message['actions'] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''
        for (const ev of events) {
          const line = ev.startsWith('data: ') ? ev.slice(6) : ev
          if (!line) continue
          let parsed: any
          try { parsed = JSON.parse(line) } catch { continue }

          if (parsed.type === 'start') {
            realId = parsed.messageId
            // Update the streaming message's id to the real one
            setConvo((c) => c ? {
              ...c,
              messages: c.messages.map((m) => m.id === streamMsgId ? { ...m, id: realId! } : m),
            } : c)
            setStreamingId(realId)
            continue
          }
          if (parsed.type === 'token') {
            setLiveTokens((p) => p + parsed.text)
            continue
          }
          if (parsed.type === 'thought') {
            setLiveThoughts((p) => p + parsed.text)
            continue
          }
          if (parsed.type === 'tool_call') {
            actionsAcc.push({
              type: 'tool',
              action: parsed.name,
              target: JSON.stringify(parsed.args).slice(0, 80),
              status: 'running',
              summary: `Calling ${parsed.name}…`,
            })
            setConvo((c) => c ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === (realId || streamMsgId) ? { ...m, actions: [...actionsAcc] } : m
              ),
            } : c)
            continue
          }
          if (parsed.type === 'tool_result') {
            actionsAcc = actionsAcc.map((a, i) =>
              i === actionsAcc.length - 1
                ? { ...a, status: parsed.ok ? 'done' : 'error', summary: parsed.summary, target: parsed.name }
                : a
            )
            setConvo((c) => c ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === (realId || streamMsgId) ? { ...m, actions: [...actionsAcc] } : m
              ),
            } : c)
            continue
          }
          if (parsed.type === 'done') {
            // Replace the streaming message with the final content
            setConvo((c) => c ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === (realId || streamMsgId) ? {
                  ...m,
                  content: liveTokensRef.current,
                  thoughts: liveThoughtsRef.current,
                  status: 'done' as const,
                  totalTokens: parsed.totalTokens,
                  model: parsed.model,
                  actions: actionsAcc,
                } : m
              ),
            } : c)
            setLiveTokens('')
            setLiveThoughts('')
            continue
          }
          if (parsed.type === 'error') {
            toast.error(parsed.error)
            setConvo((c) => c ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === (realId || streamMsgId) ? { ...m, content: `_${parsed.error}_`, status: 'error' as const } : m
              ),
            } : c)
            setLiveTokens('')
            setLiveThoughts('')
          }
        }
      }
    } catch (e) {
      toast.error(`Couldn't reach Otto: ${(e as Error).message}`)
      setConvo((c) => c ? {
        ...c,
        messages: c.messages.map((m) => m.id === streamMsgId ? { ...m, content: `_${(e as Error).message}_`, status: 'error' as const } : m),
      } : c)
    } finally {
      setSending(false)
      setStreamingId(null)
      try { localStorage.setItem('otto.mascot.mood', 'happy'); setTimeout(() => { try { localStorage.setItem('otto.mascot.mood', 'content') } catch {} }, 6000) } catch {} // Lok happy on done, then relax
      // Refresh the conversation to get the persisted final state
      if (currentId) {
        fetch(`/api/conversations/${currentId}`).then((r) => r.json()).then((data) => data && setConvo(data)).catch(() => {})
      }
      refreshList()
    }
  }

  // Refs to read latest token/thought state inside the stream handler
  const liveTokensRef = useRef('')
  const liveThoughtsRef = useRef('')
  useEffect(() => { liveTokensRef.current = liveTokens }, [liveTokens])
  useEffect(() => { liveThoughtsRef.current = liveThoughts }, [liveThoughts])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  // ─── Filtered vault notes ────────────────────────────────────────────────
  const filteredVault = vaultNotes.filter((n) => {
    if (vaultFilter !== 'all' && n.category !== vaultFilter) return false
    if (vaultQuery) {
      const q = vaultQuery.toLowerCase()
      return n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)
    }
    return true
  }).slice(0, 50)

  // ─── Render ──────────────────────────────────────────────────────────────
  const autonomyLevel = convo?.autonomyLevel ?? 2
  const liveActivity = activity.filter((a) => a.agentName === 'Otto').slice(0, 8)

  return (
    <div className="h-full w-full flex">
      <PanelGroup direction="horizontal" autoSaveId="otto-chat-4panel">
        {/* ─── Panel 1: Control sidebar ───────────────────────────────────── */}
        <Panel defaultSize={18} minSize={14} maxSize={26}>
          <ControlPanel
            agents={agents}
            tasks={tasks}
            activity={liveActivity}
            usage={usage}
            onNavigate={(v) => setView(v as any)}
          />
        </Panel>

        <PanelResizeHandle className="w-px bg-border hover:bg-foreground/30 transition-colors" />

        {/* ─── Panel 2: Chat (with conversation strip) ──────────────────── */}
        <Panel minSize={30}>
          <div className="h-full flex">
            {/* Conversation list strip */}
            <div className="w-[200px] border-r border-border flex flex-col bg-muted/30">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Conversations</span>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={newConversation}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-1.5 space-y-0.5">
                  {conversations.length === 0 && (
                    <div className="px-2 py-4 text-xs text-muted-foreground text-center">No conversations yet.</div>
                  )}
                  {conversations.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCurrentId(c.id)}
                      className={cn(
                        'w-full text-left px-2.5 py-2 text-xs group flex items-start gap-1.5 rounded-sm',
                        currentId === c.id ? 'bg-background border border-border' : 'hover:bg-background/60'
                      )}
                    >
                      {c.isPinned && <Pin className="h-3 w-3 mt-0.5 flex-shrink-0 text-foreground" />}
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium">{c.title || 'Untitled'}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {c.messageCount} msg · {formatRelative(c.updatedAt)}
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteConversation(c.id) }}
                        className="opacity-0 group-hover:opacity-100 hover:text-red-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </button>
                  ))}
                </div>
              </ScrollArea>
              {/* User footer */}
              <div className="border-t border-border p-2 flex items-center gap-2">
                <div className="h-7 w-7 bg-foreground text-background flex items-center justify-center font-mono text-xs font-bold flex-shrink-0">
                  {(session?.user?.name || 'O').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{session?.user?.name || 'Owner'}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{session?.user?.email}</div>
                </div>
                <button
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  className="text-muted-foreground hover:text-foreground p-1"
                  title="Sign out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Chat main column */}
            <div className="flex-1 flex flex-col min-w-0 bg-background">
              {/* Chat header */}
              <div className="border-b border-border px-4 h-12 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-6 w-6 bg-foreground text-background flex items-center justify-center font-mono text-xs font-bold flex-shrink-0">O</div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{convo?.title || 'Otto Perso'}</div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" /> Online · {usage ? `${usage.minute.used}/${usage.minute.limit}/min` : '—'}
                    </div>
                  </div>
                </div>
                {/* Autonomy picker */}
                <div className="relative" ref={autonomyRef}>
                  <button
                    onClick={() => setAutonomyOpen((o) => !o)}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 h-7 text-xs font-medium border border-border',
                      AUTONOMY_TONE[autonomyLevel]
                    )}
                  >
                    <Gauge className="h-3 w-3" />
                    <span>L{autonomyLevel} · {AUTONOMY_NAMES[autonomyLevel]}</span>
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  {autonomyOpen && (
                    <div className="absolute right-0 top-9 z-50 w-64 bg-background border border-border shadow-lg">
                      {[1, 2, 3, 4, 5].map((lvl) => (
                        <button
                          key={lvl}
                          onClick={() => setAutonomy(lvl)}
                          className={cn(
                            'w-full text-left px-3 py-2 text-xs hover:bg-muted/50 flex items-center justify-between',
                            autonomyLevel === lvl && 'bg-muted'
                          )}
                        >
                          <div>
                            <div className="font-medium">L{lvl} · {AUTONOMY_NAMES[lvl]}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {lvl === 1 && 'Suggests only. Asks before doing.'}
                              {lvl === 2 && 'Small safe edits without asking.'}
                              {lvl === 3 && 'Executes chosen edits exactly.'}
                              {lvl === 4 && 'Bypasses approvals. Decisive.'}
                              {lvl === 5 && 'Vacation mode. Runs the show.'}
                            </div>
                          </div>
                          {autonomyLevel === lvl && <CheckCircle2 className="h-3.5 w-3.5" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto">
                {/* Proactive prompts — Otto initiates */}
                {proactivePrompts.length > 0 && (
                  <div className="max-w-3xl mx-auto px-6 pt-4 space-y-2">
                    {proactivePrompts.slice(0, 3).map((p) => (
                      <div
                        key={p.id}
                        className="border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 px-3 py-2.5"
                      >
                        <div className="flex items-start gap-2">
                          <Sparkles className="h-3.5 w-3.5 mt-0.5 text-amber-600 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-0.5 flex items-center gap-2">
                              <span>Otto suggests</span>
                              <span className="opacity-60">· {(p.trigger || 'observation').replace(/_/g, ' ')} · {Math.round(p.confidence * 100)}%</span>
                            </div>
                            <div className="text-xs text-foreground">{p.content}</div>
                            <div className="flex gap-1.5 mt-2">
                              {p.suggestedAction && (
                                <button
                                  onClick={() => resolveProactive(p.id, 'accept')}
                                  className="px-2 py-1 text-[11px] bg-foreground text-background hover:opacity-90"
                                >
                                  {p.suggestedAction}
                                </button>
                              )}
                              <button
                                onClick={() => resolveProactive(p.id, 'dismiss')}
                                className="px-2 py-1 text-[11px] border border-border hover:bg-muted/50"
                              >
                                Dismiss
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {(!convo || convo.messages.length === 0) ? (
                  <EmptyState onSuggest={(t) => send(t)} />
                ) : (
                  <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
                    {convo.messages.map((m) => (
                      <MessageBubble
                        key={m.id}
                        message={m}
                        isStreaming={streamingId === m.id}
                        liveTokens={streamingId === m.id ? liveTokens : ''}
                        liveThoughts={streamingId === m.id ? liveThoughts : ''}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="border-t border-border p-3 flex-shrink-0 bg-background">
                <div className="max-w-3xl mx-auto">
                  <div className="relative">
                    <Textarea
                      ref={taRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Tell Otto what to do… (Shift+Enter for newline)"
                      disabled={sending}
                      rows={1}
                      className="min-h-[44px] max-h-[200px] resize-none pr-12 text-sm"
                    />
                    <button
                      onClick={() => send()}
                      disabled={sending || !input.trim()}
                      className="absolute right-2 bottom-2 h-8 w-8 flex items-center justify-center bg-foreground text-background disabled:opacity-30 hover:opacity-90 transition-opacity"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="mt-1.5 text-[10px] text-muted-foreground flex items-center justify-between">
                    <span>Otto calls tools to act. At L1-L3, ask before substantive writes.</span>
                    {usage && (
                      <span>
                        {usage.daily.used}/{usage.daily.limit} today · {usage.monthly.used.toLocaleString()}/{usage.monthly.limit.toLocaleString()} tok/mo
                        {usage.peak.isPeak && <span className="ml-1 text-amber-600">· peak hr</span>}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="w-px bg-border hover:bg-foreground/30 transition-colors" />

        {/* ─── Panel 3: Right side (thoughts + vault tabs) ───────────────── */}
        <Panel defaultSize={26} minSize={20} maxSize={40}>
          <div className="h-full flex flex-col bg-muted/20">
            {/* Tabs */}
            <div className="border-b border-border flex flex-shrink-0">
              <button
                onClick={() => setRightTab('thoughts')}
                className={cn(
                  'flex-1 px-3 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 border-b-2',
                  rightTab === 'thoughts' ? 'border-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <Brain className="h-3.5 w-3.5" /> Internal Thought
              </button>
              <button
                onClick={() => setRightTab('vault')}
                className={cn(
                  'flex-1 px-3 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 border-b-2',
                  rightTab === 'vault' ? 'border-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <BookMarked className="h-3.5 w-3.5" /> Vault
              </button>
            </div>
            {rightTab === 'thoughts' ? (
              <ThoughtsPanel live={liveThoughts} convo={convo} streamingId={streamingId} />
            ) : (
              <VaultPanel
                notes={filteredVault}
                query={vaultQuery}
                setQuery={setVaultQuery}
                filter={vaultFilter}
                setFilter={setVaultFilter}
                onOpenVault={() => setView('vault')}
              />
            )}
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}

// ─── Panel 1: Control sidebar ──────────────────────────────────────────────
function ControlPanel({
  agents, tasks, activity, usage, onNavigate,
}: {
  agents: Agent[]
  tasks: Task[]
  activity: ActivityItem[]
  usage: UsageStatus | null
  onNavigate: (v: string) => void
}) {
  const running = tasks.filter((t) => t.status === 'executing' || t.status === 'planning')
  const queued = tasks.filter((t) => t.status === 'queued' || t.status === 'waiting_approval' || t.status === 'blocked')

  return (
    <div className="h-full flex flex-col bg-muted/20 border-r border-border">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between flex-shrink-0">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Otto is controlling</span>
        <Network className="h-3 w-3 text-muted-foreground" />
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Live agents */}
          <section>
            <div className="flex items-center justify-between mb-1.5">
              <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
                <Cpu className="h-3 w-3" /> Agents
              </h4>
              <button onClick={() => onNavigate('agents')} className="text-[10px] text-muted-foreground hover:text-foreground">
                view all →
              </button>
            </div>
            {agents.length === 0 ? (
              <div className="text-xs text-muted-foreground px-1 py-2 italic">No agents online.</div>
            ) : (
              <div className="space-y-1">
                {agents.slice(0, 6).map((a) => (
                  <div key={a.id} className="border border-border bg-background p-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium truncate">{a.name}</div>
                      <StatusDot status={a.status} />
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{a.task || a.kind}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Running tasks */}
          <section>
            <div className="flex items-center justify-between mb-1.5">
              <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
                <Zap className="h-3 w-3" /> Tasks
              </h4>
              <button onClick={() => onNavigate('tasks')} className="text-[10px] text-muted-foreground hover:text-foreground">
                view all →
              </button>
            </div>
            {tasks.length === 0 ? (
              <div className="text-xs text-muted-foreground px-1 py-2 italic">No active tasks.</div>
            ) : (
              <div className="space-y-1">
                {running.slice(0, 3).map((t) => (
                  <div key={t.id} className="border border-foreground/30 bg-background p-2">
                    <div className="flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <div className="text-xs font-medium truncate flex-1">{t.title}</div>
                    </div>
                  </div>
                ))}
                {queued.slice(0, 4).map((t) => (
                  <div key={t.id} className="border border-border bg-background p-2">
                    <div className="text-xs font-medium truncate">{t.title}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {t.priority} · {t.status.replace('_', ' ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Recent activity */}
          <section>
            <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1 mb-1.5">
              <Activity className="h-3 w-3" /> Recent Actions
            </h4>
            {activity.length === 0 ? (
              <div className="text-xs text-muted-foreground px-1 py-2 italic">No actions yet.</div>
            ) : (
              <div className="space-y-0.5">
                {activity.map((a) => (
                  <div key={a.id} className="text-[11px] py-1 border-b border-border/50 last:border-0">
                    <div className="flex items-start gap-1.5">
                      <span className={cn(
                        'inline-block h-1 w-1 rounded-full mt-1.5 flex-shrink-0',
                        a.riskTier === 'critical' ? 'bg-red-600' :
                        a.riskTier === 'high' ? 'bg-orange-500' :
                        a.riskTier === 'medium' ? 'bg-amber-500' : 'bg-green-500'
                      )} />
                      <div className="flex-1 min-w-0">
                        <div className="text-foreground truncate">{a.summary}</div>
                        <div className="text-[9px] text-muted-foreground">{formatRelative(a.createdAt)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Usage */}
          {usage && (
            <section>
              <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1 mb-1.5">
                <Gauge className="h-3 w-3" /> Brain Budget
              </h4>
              <div className="space-y-1.5 text-[11px]">
                <BudgetBar label="Per minute" used={usage.minute.used} limit={usage.minute.limit} />
                <BudgetBar label="Today" used={usage.daily.used} limit={usage.daily.limit} />
                <BudgetBar label="This hour" used={usage.hourly.used} limit={usage.hourly.limit} />
                {usage.peak.isPeak && (
                  <BudgetBar label="Peak hour" used={usage.peak.used} limit={usage.peak.limit} highlight />
                )}
                <BudgetBar label="Tokens/mo" used={usage.monthly.used} limit={usage.monthly.limit} />
              </div>
            </section>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'executing' ? 'bg-amber-500' :
    status === 'thinking' ? 'bg-blue-500' :
    status === 'idle' ? 'bg-muted-foreground' :
    status === 'stopped' ? 'bg-red-500' :
    'bg-green-500'
  return <span className={cn('inline-block h-1.5 w-1.5 rounded-full', color)} />
}

function BudgetBar({ label, used, limit, highlight }: { label: string; used: number; limit: number; highlight?: boolean }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  return (
    <div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn(pct > 80 ? 'text-red-600' : 'text-foreground')}>{used.toLocaleString()}/{limit.toLocaleString()}</span>
      </div>
      <div className="h-1 bg-muted mt-0.5">
        <div
          className={cn('h-full', pct > 80 ? 'bg-red-600' : highlight ? 'bg-amber-500' : 'bg-foreground')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ─── Message bubble ────────────────────────────────────────────────────────
function MessageBubble({
  message, isStreaming, liveTokens, liveThoughts,
}: {
  message: Message
  isStreaming: boolean
  liveTokens: string
  liveThoughts: string
}) {
  const isUser = message.role === 'user'
  const content = isStreaming ? liveTokens : message.content
  const thoughts = isStreaming ? liveThoughts : (message.thoughts || '')
  const [showThoughts, setShowThoughts] = useState(false)

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-foreground text-background px-3.5 py-2 text-sm">
          <div className="whitespace-pre-wrap">{message.content}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      <div className="h-7 w-7 bg-foreground text-background flex items-center justify-center font-mono text-xs font-bold flex-shrink-0 mt-0.5">O</div>
      <div className="flex-1 min-w-0 space-y-2">
        {/* Tool call cards */}
        {message.actions.length > 0 && (
          <div className="space-y-1">
            {message.actions.map((a, i) => (
              <div key={i} className="border border-border bg-muted/30 px-2 py-1.5 text-[11px] flex items-center gap-2">
                <Wrench className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                <span className="font-mono">{a.action}</span>
                <span className="text-muted-foreground truncate flex-1">{a.summary}</span>
                {a.status === 'running' && <Loader2 className="h-3 w-3 animate-spin" />}
                {a.status === 'done' && <CheckCircle2 className="h-3 w-3 text-green-600" />}
                {a.status === 'error' && <XCircle className="h-3 w-3 text-red-600" />}
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        {content ? (
          <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0 prose-code:before:hidden prose-code:after:hidden prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        ) : isStreaming ? (
          <div className="text-sm text-muted-foreground italic flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> thinking…
          </div>
        ) : null}

        {/* Footer: thoughts toggle, model, tokens */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          {thoughts && (
            <button
              onClick={() => setShowThoughts((s) => !s)}
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <Brain className="h-3 w-3" />
              {showThoughts ? 'Hide thoughts' : 'Show thoughts'}
            </button>
          )}
          {message.model && <span className="font-mono">{message.model}</span>}
          {message.totalTokens ? <span>{message.totalTokens} tok</span> : null}
        </div>

        {/* Inline thoughts */}
        {showThoughts && thoughts && (
          <div className="border-l-2 border-foreground/30 pl-3 text-[11px] text-muted-foreground whitespace-pre-wrap italic">
            {thoughts}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Right: Thoughts panel ─────────────────────────────────────────────────
function ThoughtsPanel({
  live, convo, streamingId,
}: {
  live: string
  convo: Conversation | null
  streamingId: string | null
}) {
  // The live thought stream takes priority; otherwise show recent messages' thoughts.
  const messages = convo?.messages.filter((m) => m.role === 'assistant' && (m.thoughts || '').length > 0) ?? []

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between flex-shrink-0">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          {live ? 'Live reasoning' : 'Reasoning trace'}
        </span>
        {live && <Sparkles className="h-3 w-3 text-amber-500 animate-pulse" />}
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3 text-[12px] font-mono leading-relaxed">
          {live ? (
            <div className="whitespace-pre-wrap text-foreground/80">{live}<span className="inline-block h-3 w-1 bg-foreground ml-0.5 animate-pulse" /></div>
          ) : messages.length === 0 ? (
            <div className="text-muted-foreground italic text-xs">
              Otto's internal reasoning will appear here while it's thinking. The brain is at rest right now.
            </div>
          ) : (
            <div className="space-y-3">
              {[...messages].reverse().map((m) => (
                <div key={m.id} className={cn('border-l-2 pl-2', streamingId === m.id ? 'border-amber-500' : 'border-border')}>
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">
                    {formatRelative(m.createdAt)} · {m.model || 'otto'}
                  </div>
                  <div className="whitespace-pre-wrap text-foreground/70 text-[11px]">{m.thoughts}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// ─── Right: Vault panel ────────────────────────────────────────────────────
function VaultPanel({
  notes, query, setQuery, filter, setFilter, onOpenVault,
}: {
  notes: VaultNoteLite[]
  query: string
  setQuery: (v: string) => void
  filter: string
  setFilter: (v: string) => void
  onOpenVault: () => void
}) {
  const [selected, setSelected] = useState<VaultNoteLite | null>(null)

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Search + filter */}
      <div className="p-2 border-b border-border space-y-1.5 flex-shrink-0">
        <div className="relative">
          <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search vault…"
            className="w-full pl-7 pr-2 py-1 text-xs border border-border bg-background"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {['all', 'general', 'preference', 'decision', 'memory', 'pattern', 'log'].map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={cn(
                'px-1.5 py-0.5 text-[10px] border',
                filter === c ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:text-foreground'
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between flex-shrink-0">
            <button onClick={() => setSelected(null)} className="text-[10px] text-muted-foreground hover:text-foreground">
              ← Back to list
            </button>
            <FileText className="h-3 w-3 text-muted-foreground" />
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{selected.category}</div>
              <h3 className="text-sm font-semibold mt-0.5">{selected.title}</h3>
              {selected.tags && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {selected.tags.split(',').filter(Boolean).map((t) => (
                    <span key={t} className="text-[9px] px-1 py-0.5 bg-muted text-muted-foreground">{t.trim()}</span>
                  ))}
                </div>
              )}
              <div className="mt-3 text-xs prose prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.body}</ReactMarkdown>
              </div>
            </div>
          </ScrollArea>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {notes.length === 0 ? (
              <div className="text-xs text-muted-foreground italic p-3 text-center">
                Vault is empty. Ask Otto to remember something.
              </div>
            ) : (
              notes.map((n) => (
                <button
                  key={n.id}
                  onClick={() => setSelected(n)}
                  className="w-full text-left p-2 border border-border hover:border-foreground/30 bg-background"
                >
                  <div className="flex items-center gap-1.5">
                    {n.pinned && <Pin className="h-2.5 w-2.5 flex-shrink-0" />}
                    <div className="text-xs font-medium truncate flex-1">{n.title}</div>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{n.body.slice(0, 100)}</div>
                  <div className="text-[9px] text-muted-foreground mt-1">{n.category} · {formatRelative(n.updatedAt)}</div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      )}

      <button
        onClick={onOpenVault}
        className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 flex-shrink-0"
      >
        <ExternalLink className="h-3 w-3" /> Open full vault view
      </button>
    </div>
  )
}

// ─── Empty state ───────────────────────────────────────────────────────────
function EmptyState({ onSuggest }: { onSuggest: (text: string) => void }) {
  return (
    <div className="h-full flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto h-14 w-14 bg-foreground text-background flex items-center justify-center font-mono text-xl font-bold mb-4">O</div>
        <h2 className="text-xl font-semibold tracking-tight">Otto Perso</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Your digital employee. Tell it what to do — it has tools to read your vault, search the web, create tasks, and spawn worker agents.
        </p>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-left">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => onSuggest(s)}
              className="border border-border px-3 py-2 text-xs hover:bg-muted/50 text-left"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
