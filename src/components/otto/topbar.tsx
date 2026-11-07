'use client'

import { useOtto } from './store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Menu, OctagonX, Search, Sun, Moon, Bell } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { EmergencyStopDialog } from './emergency-stop'
import { NotificationsDrawer } from './notifications-drawer'

const AUTONOMY_LABELS: Record<number, { short: string; tone: string }> = {
  1: { short: 'L1 · Ask', tone: 'var(--ink-muted)' },
  2: { short: 'L2 · Mild', tone: 'var(--ink-muted)' },
  3: { short: 'L3 · Chosen', tone: 'var(--ink)' },
  4: { short: 'L4 · Bypass', tone: 'var(--warn)' },
  5: { short: 'L5 · Vacation', tone: 'var(--signal)' },
}

export function Topbar() {
  const { setSidebarOpen, currentAutonomyLevel, emergencyActive } = useOtto()
  const [confirmingStop, setConfirmingStop] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifCount, setNotifCount] = useState(0)
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  // ─── Poll for notification count: proactive prompts + awaiting approval + high-risk activity ─
  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const [pRes, tRes, aRes] = await Promise.all([
          fetch('/api/proactive').then((r) => r.json()).catch(() => []),
          fetch('/api/tasks').then((r) => r.json()).catch(() => []),
          fetch('/api/activity?limit=20').then((r) => r.json()).catch(() => []),
        ])
        if (cancelled) return
        const prompts = Array.isArray(pRes) ? pRes : (pRes?.items ?? [])
        const tasks = Array.isArray(tRes) ? tRes : (tRes?.items ?? [])
        const activity = Array.isArray(aRes) ? aRes : (aRes?.items ?? [])
        const awaiting = tasks.filter((t: any) => t.status === 'waiting_approval')
        const oneHourAgo = Date.now() - 60 * 60 * 1000
        const recentHigh = activity.filter((a: any) =>
          a.riskTier === 'high' || a.riskTier === 'critical'
        ).filter((a: any) => new Date(a.createdAt).getTime() > oneHourAgo)
        setNotifCount(prompts.length + awaiting.length + recentHigh.length)
      } catch {}
    }
    poll()
    const i = setInterval(poll, 15000)
    return () => { cancelled = true; clearInterval(i) }
  }, [notifOpen])

  const autonomy = AUTONOMY_LABELS[currentAutonomyLevel] ?? AUTONOMY_LABELS[2]

  function openPalette() {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true }))
  }

  function toggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <>
      <header className="sticky top-0 z-20 h-14 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-hair flex items-center px-4 md:px-6 gap-3">
        {/* Mobile menu */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden -ml-2 h-9 w-9"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
        >
          <Menu size={16} />
        </Button>

        {/* Status: Otto */}
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              'inline-block w-1.5 h-1.5 rounded-full',
              emergencyActive ? 'bg-signal otto-pulse' : 'bg-good otto-pulse'
            )}
            style={emergencyActive ? { background: 'var(--signal)' } : { background: 'var(--good)' }}
          />
          <span className="text-xs otto-mono uppercase tracking-wider text-muted-foreground hidden sm:inline">
            {emergencyActive ? 'HALTED' : 'Online'}
          </span>
        </div>

        <div className="hidden md:block h-4 w-px bg-hair" style={{ background: 'var(--hair)' }} />

        {/* Autonomy badge */}
        <div className="flex items-center gap-2">
          <span className="otto-label hidden sm:inline">Autonomy</span>
          <span
            className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] otto-mono uppercase tracking-wider font-medium border border-hair"
            style={{ color: autonomy.tone, borderColor: 'var(--hair)' }}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: autonomy.tone }}
            />
            {autonomy.short}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Command palette trigger */}
          <Button
            variant="ghost"
            size="sm"
            onClick={openPalette}
            className="h-9 gap-2 px-2.5 hidden md:flex"
            aria-label="Open command palette"
            title="Cmd+K"
          >
            <Search size={14} />
            <kbd className="text-[10px] otto-mono px-1 py-0.5 border border-hair text-muted-foreground" style={{ borderColor: 'var(--hair)' }}>
              ⌘K
            </kbd>
          </Button>

          {/* Notifications */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setNotifOpen(true)}
            className="h-9 w-9 relative"
            aria-label={`Open notifications${notifCount > 0 ? ` (${notifCount} new)` : ''}`}
          >
            <Bell size={15} />
            {notifCount > 0 && (
              <span
                className="absolute top-0.5 right-0.5 min-w-[14px] h-[14px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center text-white"
                style={{ background: 'var(--signal)' }}
              >
                {notifCount > 9 ? '9+' : notifCount}
              </span>
            )}
          </Button>

          {/* Dark mode toggle */}
          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="h-9 w-9"
              aria-label="Toggle theme"
              title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </Button>
          )}

          {/* Emergency stop — always visible */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmingStop(true)}
            className={cn(
              'h-9 gap-1.5 px-3 border-2 font-medium uppercase tracking-wider text-xs',
              'hover:bg-signal hover:text-signal-fg hover:border-signal'
            )}
            style={{
              borderColor: 'var(--signal)',
              color: 'var(--signal)',
            }}
          >
            <OctagonX size={14} />
            <span className="hidden sm:inline">Emergency Stop</span>
            <span className="sm:hidden">Stop</span>
          </Button>
        </div>

        <EmergencyStopDialog open={confirmingStop} onOpenChange={setConfirmingStop} />
      </header>
      <NotificationsDrawer open={notifOpen} onOpenChange={setNotifOpen} />
    </>
  )
}
