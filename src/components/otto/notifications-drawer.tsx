'use client'

import { useEffect, useState } from 'react'
import { Bell, X, CheckCircle2, Ban, AlertTriangle, Sparkles, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useOtto } from './store'
import { toast } from 'sonner'
import { formatRelative, type ActivityLog, type ProactivePrompt, type Task } from '@/lib/types'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function NotificationsDrawer({ open, onOpenChange }: Props) {
  const { setView } = useOtto()
  const [prompts, setPrompts] = useState<ProactivePrompt[]>([])
  const [awaitingTasks, setAwaitingTasks] = useState<Task[]>([])
  const [recentHighRisk, setRecentHighRisk] = useState<ActivityLog[]>([])

  useEffect(() => {
    if (!open) return
    Promise.all([
      fetch('/api/proactive').then((r) => r.json()),
      fetch('/api/tasks?status=waiting_approval').then((r) => r.json()),
      fetch('/api/activity?riskTier=high').then((r) => r.json()),
    ]).then(([p, t, a]) => {
      setPrompts(p)
      setAwaitingTasks(t)
      setRecentHighRisk((a as ActivityLog[]).slice(0, 5))
    })
  }, [open])

  async function resolvePrompt(id: string, action: 'accept' | 'dismiss') {
    await fetch('/api/proactive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    })
    setPrompts((prev) => prev.filter((p) => p.id !== id))
    if (action === 'accept') toast.success('Prompt accepted — task queued')
  }

  async function approveTask(id: string) {
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'executing' }),
    })
    setAwaitingTasks((prev) => prev.filter((t) => t.id !== id))
    toast.success('Task approved')
  }

  async function cancelTask(id: string) {
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    })
    setAwaitingTasks((prev) => prev.filter((t) => t.id !== id))
    toast.success('Task cancelled')
  }

  const total = prompts.length + awaitingTasks.length + recentHighRisk.length

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-foreground/20"
          onClick={() => onOpenChange(false)}
          aria-hidden
        />
      )}
      {/* Drawer */}
      <aside
        className={cn(
          'fixed top-0 right-0 bottom-0 z-50 w-full max-w-md bg-card border-l-2 flex flex-col transition-transform duration-200',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
        style={{ borderColor: 'var(--ink)' }}
      >
        {/* Header */}
        <div className="h-14 px-5 flex items-center justify-between border-b border-hair" style={{ borderColor: 'var(--hair)' }}>
          <div className="flex items-center gap-2">
            <Bell size={15} />
            <h2 className="otto-eyebrow">Notifications</h2>
            {total > 0 && (
              <span
                className="px-1.5 py-0.5 text-[10px] otto-mono uppercase tracking-wider border"
                style={{ borderColor: 'var(--signal)', color: 'var(--signal)' }}
              >
                {total} new
              </span>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenChange(false)}>
            <X size={14} />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Awaiting approval */}
          {awaitingTasks.length > 0 && (
            <Section
              title="Awaiting your approval"
              icon={<Clock size={12} style={{ color: 'var(--warn)' }} />}
              accent="warn"
            >
              {awaitingTasks.map((t) => (
                <div key={t.id} className="px-5 py-3 border-b border-hair" style={{ borderColor: 'var(--hair)' }}>
                  <div className="text-sm font-medium">{t.title}</div>
                  {t.description && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.description}</div>}
                  <div className="flex items-center gap-2 mt-2">
                    <Button size="sm" className="h-6 gap-1 text-xs" onClick={() => approveTask(t.id)}>
                      <CheckCircle2 size={11} /> Approve
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 gap-1 text-xs" onClick={() => cancelTask(t.id)}>
                      <Ban size={11} /> Cancel
                    </Button>
                  </div>
                </div>
              ))}
            </Section>
          )}

          {/* Proactive prompts */}
          {prompts.length > 0 && (
            <Section
              title="Otto suggests"
              icon={<Sparkles size={12} style={{ color: 'var(--signal)' }} />}
              accent="signal"
            >
              {prompts.map((p) => (
                <div key={p.id} className="px-5 py-3 border-b border-hair" style={{ borderColor: 'var(--hair)' }}>
                  <p className="text-sm leading-relaxed">{p.content}</p>
                  {p.suggestedAction && (
                    <div className="text-[10px] otto-mono uppercase tracking-wider text-muted-foreground mt-1">
                      → {p.suggestedAction}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <Button size="sm" className="h-6 gap-1 text-xs" onClick={() => resolvePrompt(p.id, 'accept')}>
                      <CheckCircle2 size={11} /> Accept
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 gap-1 text-xs" onClick={() => resolvePrompt(p.id, 'dismiss')}>
                      Dismiss
                    </Button>
                    <span className="ml-auto text-[10px] otto-mono text-muted-foreground">
                      {(p.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </Section>
          )}

          {/* Recent high-risk activity */}
          {recentHighRisk.length > 0 && (
            <Section
              title="High-risk activity"
              icon={<AlertTriangle size={12} style={{ color: 'var(--signal)' }} />}
              accent="signal"
            >
              {recentHighRisk.map((a) => (
                <div key={a.id} className="px-5 py-3 border-b border-hair" style={{ borderColor: 'var(--hair)' }}>
                  <div className="flex items-baseline gap-2">
                    <span className="otto-mono text-[10px] text-muted-foreground">{a.agentName}</span>
                    <span className="text-sm flex-1">{a.summary}</span>
                  </div>
                  <div className="text-[10px] otto-mono text-muted-foreground mt-0.5">
                    {formatRelative(a.createdAt)} · {a.action}
                  </div>
                </div>
              ))}
            </Section>
          )}

          {/* Empty state */}
          {total === 0 && (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">
              <Bell size={20} className="mx-auto mb-3 opacity-30" />
              All clear. No pending notifications.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-hair px-5 py-3 flex items-center justify-between" style={{ borderColor: 'var(--hair)' }}>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              onOpenChange(false)
              setView('timeline')
            }}
          >
            View full timeline
          </Button>
          <span className="text-[10px] otto-mono uppercase tracking-wider text-muted-foreground">
            {total} pending
          </span>
        </div>
      </aside>
    </>
  )
}

function Section({
  title, icon, accent, children,
}: {
  title: string
  icon: React.ReactNode
  accent?: 'warn' | 'signal'
  children: React.ReactNode
}) {
  return (
    <div>
      <div
        className="px-5 py-2 border-b flex items-center gap-2"
        style={{
          borderColor: 'var(--hair)',
          background: accent === 'warn' ? 'var(--warn-soft)' : accent === 'signal' ? 'var(--signal-soft)' : 'var(--paper-soft)',
        }}
      >
        {icon}
        <span
          className="otto-eyebrow"
          style={{
            color: accent === 'warn' ? 'var(--warn)' : accent === 'signal' ? 'var(--signal)' : undefined,
          }}
        >
          {title}
        </span>
      </div>
      {children}
    </div>
  )
}
