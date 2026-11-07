'use client'

import { useOtto } from '@/components/otto/store'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  Brain,
  CheckCircle2,
  ChevronRight,
  Inbox,
  ListTodo,
  Network,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatRelative, type ActivityLog, type Agent, type ProactivePrompt } from '@/lib/types'
import { toast } from 'sonner'
import { useOttoRealtime } from '@/hooks/use-otto-realtime'

interface SystemOverview {
  tasksByStatus: Record<string, number>
  agentsByStatus: Record<string, number>
  totalAgents: number
  vaultCount: number
  credCount: number
  recipeCount: number
  activityCount: number
  pendingProactive: number
  currentAutonomy: { level: number; name: string; tagline: string } | null
  emergency: { active: boolean }
  riskThresholds: Record<string, number | number[]> | null
}

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  planning: 'Planning',
  executing: 'Executing',
  waiting_approval: 'Waiting',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

export function DashboardView() {
  const { setView, setCurrentAutonomyLevel, setEmergencyActive } = useOtto()
  const [overview, setOverview] = useState<SystemOverview | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [activity, setActivity] = useState<ActivityLog[]>([])
  const [prompts, setPrompts] = useState<ProactivePrompt[]>([])

  // Realtime: live agents + streaming new activity
  const realtime = useOttoRealtime({
    onActivity: (entry) => {
      setActivity((prev) => [entry, ...prev].slice(0, 8))
    },
  })

  // When realtime agents arrive, update the dashboard agents panel
  useEffect(() => {
    if (realtime.agents) setAgents(realtime.agents as Agent[])
  }, [realtime.agents])

  // When realtime emergency changes, sync the global store
  useEffect(() => {
    if (realtime.emergencyActive !== null) {
      setEmergencyActive(realtime.emergencyActive)
    }
  }, [realtime.emergencyActive, setEmergencyActive])

  useEffect(() => {
    Promise.all([
      fetch('/api/system').then((r) => r.json()),
      fetch('/api/agents').then((r) => r.json()),
      fetch('/api/activity').then((r) => r.json()),
      fetch('/api/proactive').then((r) => r.json()),
    ]).then(([sys, ag, act, pr]) => {
      setOverview(sys)
      setAgents(ag)
      setActivity((act as ActivityLog[]).slice(0, 6))
      setPrompts(pr)
      if (sys.currentAutonomy) setCurrentAutonomyLevel(sys.currentAutonomy.level)
    })
  }, [setCurrentAutonomyLevel])

  const activeAgents = agents.filter((a) => a.status === 'executing' || a.status === 'thinking')
  const activeTaskCount = overview
    ? (overview.tasksByStatus.executing ?? 0) +
      (overview.tasksByStatus.planning ?? 0) +
      (overview.tasksByStatus.queued ?? 0)
    : 0

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <section>
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
            Otto is on duty.
          </h1>
          <span className="otto-mono text-xs text-muted-foreground">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
        </div>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          {overview?.currentAutonomy
            ? `${overview.currentAutonomy.name} — ${overview.currentAutonomy.tagline}`
            : 'Loading current autonomy…'}
        </p>
      </section>

      {/* Stat blocks */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-px bg-hair border border-hair" style={{ background: 'var(--hair)' }}>
        <StatBlock
          label="Active tasks"
          value={activeTaskCount}
          sub={`${overview?.tasksByStatus.waiting_approval ?? 0} awaiting you`}
          icon={ListTodo}
          onClick={() => setView('tasks')}
        />
        <StatBlock
          label="Agents"
          value={overview?.totalAgents ?? 0}
          sub={`${activeAgents.length} working now`}
          icon={Network}
          onClick={() => setView('agents')}
        />
        <StatBlock
          label="Vault notes"
          value={overview?.vaultCount ?? 0}
          sub="synced to disk"
          icon={Brain}
          onClick={() => setView('vault')}
        />
        <StatBlock
          label="Otto suggests"
          value={overview?.pendingProactive ?? 0}
          sub="proactive prompts"
          icon={Sparkles}
          accent
          onClick={() => setView('dashboard')}
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active agents */}
        <section className="lg:col-span-2 border border-hair bg-card" style={{ borderColor: 'var(--hair)' }}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-hair" style={{ borderColor: 'var(--hair)' }}>
            <div className="flex items-center gap-2">
              <Network size={14} />
              <h2 className="otto-eyebrow">Active agents</h2>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setView('agents')}>
              View graph <ChevronRight size={12} />
            </Button>
          </div>
          <div className="divide-y divide-hair" style={{ borderColor: 'var(--hair)' }}>
            {agents.slice(0, 4).map((a) => (
              <AgentRow key={a.id} agent={a} />
            ))}
            {agents.length === 0 && <EmptyRow text="No agents online." />}
          </div>
        </section>

        {/* Proactive prompts */}
        <section className="border border-hair bg-card" style={{ borderColor: 'var(--hair)' }}>
          <div className="flex items-center gap-2 px-5 py-3 border-b border-hair" style={{ borderColor: 'var(--hair)' }}>
            <Sparkles size={14} style={{ color: 'var(--signal)' }} />
            <h2 className="otto-eyebrow">Otto suggests</h2>
          </div>
          <div className="divide-y divide-hair max-h-[360px] overflow-y-auto" style={{ borderColor: 'var(--hair)' }}>
            {prompts.length === 0 && <EmptyRow text="No pending prompts." />}
            {prompts.map((p) => (
              <PromptRow key={p.id} prompt={p} onResolve={(action) => {
                fetch('/api/proactive', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: p.id, action }),
                }).then(() => {
                  setPrompts((prev) => prev.filter((x) => x.id !== p.id))
                  if (action === 'accept') {
                    toast.success('Accepted — task queued', { description: p.suggestedAction })
                  }
                })
              }} />
            ))}
          </div>
        </section>
      </div>

      {/* Recent activity */}
      <section className="border border-hair bg-card" style={{ borderColor: 'var(--hair)' }}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-hair" style={{ borderColor: 'var(--hair)' }}>
          <div className="flex items-center gap-2">
            <Activity size={14} />
            <h2 className="otto-eyebrow">Recent activity</h2>
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setView('timeline')}>
            Full timeline <ChevronRight size={12} />
          </Button>
        </div>
        <div className="divide-y divide-hair" style={{ borderColor: 'var(--hair)' }}>
          {activity.length === 0 && <EmptyRow text="No activity yet." />}
          {activity.map((a) => (
            <div key={a.id} className="px-5 py-3 grid grid-cols-12 gap-3 items-center text-sm">
              <div className="col-span-3 md:col-span-2 otto-mono text-xs text-muted-foreground">
                {formatRelative(a.createdAt)}
              </div>
              <div className="col-span-2 md:col-span-2 otto-mono text-xs">
                <RiskBadge tier={a.riskTier} />
              </div>
              <div className="col-span-7 md:col-span-6 text-foreground">
                <span className="text-muted-foreground otto-mono text-xs">{a.agentName}</span>{' '}
                <span className="ml-1">{a.summary}</span>
              </div>
              <div className="col-span-12 md:col-span-2 md:text-right otto-mono text-[10px] text-muted-foreground">
                {a.action}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function StatBlock({
  label,
  value,
  sub,
  icon: Icon,
  onClick,
  accent,
}: {
  label: string
  value: number
  sub: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  onClick?: () => void
  accent?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="bg-card p-5 text-left transition-colors hover:bg-paper-soft otto-pressable group"
      style={{ background: 'var(--card)' }}
    >
      <div className="flex items-center justify-between">
        <span className="otto-label">{label}</span>
        <Icon size={14} className={cn('text-muted-foreground group-hover:text-foreground', accent && 'text-signal')} style={accent ? { color: 'var(--signal)' } : undefined} />
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-4xl font-semibold tracking-tight tabular-nums">{value}</span>
        {accent && <TrendingUp size={14} style={{ color: 'var(--signal)' }} />}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </button>
  )
}

function AgentRow({ agent }: { agent: Agent }) {
  const isMain = agent.kind === 'main'
  const statusTone =
    agent.status === 'executing' || agent.status === 'thinking'
      ? 'var(--good)'
      : agent.status === 'waiting'
      ? 'var(--warn)'
      : agent.status === 'stopped'
      ? 'var(--signal)'
      : 'var(--ink-muted)'
  return (
    <div className="px-5 py-3 flex items-center gap-3">
      <span className="otto-signal-dot otto-pulse" style={{ background: statusTone }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('text-sm', isMain ? 'font-semibold' : 'font-medium')}>{agent.name}</span>
          <span className="text-[10px] otto-mono uppercase tracking-wider text-muted-foreground">{agent.kind}</span>
        </div>
        <div className="text-xs text-muted-foreground truncate">{agent.task || 'Idle'}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[10px] otto-mono uppercase tracking-wider text-muted-foreground">{agent.status}</div>
        <div className="text-xs otto-mono tabular-nums">{(agent.confidence * 100).toFixed(0)}% conf</div>
      </div>
    </div>
  )
}

function PromptRow({ prompt, onResolve }: { prompt: ProactivePrompt; onResolve: (a: 'accept' | 'dismiss') => void }) {
  return (
    <div className="px-5 py-3 space-y-2">
      <div className="flex items-start gap-2">
        <span className="otto-signal-dot mt-1.5" style={{ background: 'var(--signal)' }} />
        <p className="text-sm leading-relaxed text-foreground flex-1">{prompt.content}</p>
      </div>
      {prompt.suggestedAction && (
        <div className="text-[10px] otto-mono uppercase tracking-wider text-muted-foreground pl-4">
          → {prompt.suggestedAction}
        </div>
      )}
      <div className="flex items-center gap-2 pl-4">
        <Button
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => onResolve('accept')}
        >
          <CheckCircle2 size={12} /> Accept
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => onResolve('dismiss')}
        >
          Dismiss
        </Button>
        <span className="ml-auto text-[10px] otto-mono text-muted-foreground">
          {(prompt.confidence * 100).toFixed(0)}% conf
        </span>
      </div>
    </div>
  )
}

function EmptyRow({ text }: { text: string }) {
  return <div className="px-5 py-8 text-center text-sm text-muted-foreground">{text}</div>
}

function RiskBadge({ tier }: { tier: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    low: { bg: 'transparent', fg: 'var(--ink-muted)' },
    medium: { bg: 'var(--warn-soft)', fg: 'var(--warn)' },
    high: { bg: 'var(--signal-soft)', fg: 'var(--signal)' },
    critical: { bg: 'var(--signal)', fg: 'var(--signal-fg)' },
  }
  const s = map[tier] ?? map.low
  return (
    <span
      className="inline-block px-1.5 py-0.5 text-[10px] uppercase tracking-wider border"
      style={{
        background: s.bg,
        color: s.fg,
        borderColor: tier === 'low' ? 'var(--hair)' : 'transparent',
      }}
    >
      {tier}
    </span>
  )
}
