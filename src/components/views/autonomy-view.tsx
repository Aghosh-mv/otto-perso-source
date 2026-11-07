'use client'

import { useEffect, useState } from 'react'
import { Check, X, AlertTriangle, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOtto } from '@/components/otto/store'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type { AutonomySetting } from '@/lib/types'

export function AutonomyView() {
  const [levels, setLevels] = useState<AutonomySetting[]>([])
  const [busy, setBusy] = useState<number | null>(null)
  const { currentAutonomyLevel, setCurrentAutonomyLevel } = useOtto()

  useEffect(() => {
    fetch('/api/autonomy').then((r) => r.json()).then((rows: AutonomySetting[]) => {
      setLevels(rows)
      const cur = rows.find((r) => r.isCurrent)
      if (cur) setCurrentAutonomyLevel(cur.level)
    })
  }, [setCurrentAutonomyLevel])

  async function setLevel(level: number) {
    setBusy(level)
    try {
      const res = await fetch('/api/autonomy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level }),
      })
      if (!res.ok) throw new Error('failed')
      setLevels((prev) => prev.map((l) => ({ ...l, isCurrent: l.level === level })))
      setCurrentAutonomyLevel(level)
      const target = levels.find((l) => l.level === level)
      toast.success(`Autonomy: L${level} — ${target?.name}`, {
        description: target?.tagline,
      })
    } catch {
      toast.error('Could not change autonomy level')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Autonomy</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          The dial that decides how much rope Otto gets. Pick the lowest level that gets the job done.
          Higher levels unlock speed at the cost of oversight — Vacation Mode runs your digital life while you sleep.
        </p>
      </section>

      <div className="space-y-4">
        {levels.map((l) => {
          const isCurrent = l.isCurrent || l.level === currentAutonomyLevel
          const isHighRisk = l.level >= 4
          const isBeta = l.level === 5
          return (
            <div
              key={l.id}
              className={cn(
                'border bg-card transition-all',
                isCurrent ? 'border-2' : 'border hover:border-hair-strong'
              )}
              style={{
                borderColor: isCurrent ? 'var(--ink)' : 'var(--hair)',
              }}
            >
              {/* Header */}
              <div className="flex items-start gap-4 p-5 border-b border-hair" style={{ borderColor: 'var(--hair)' }}>
                <div
                  className="shrink-0 w-12 h-12 flex items-center justify-center border-2 otto-mono font-semibold text-lg"
                  style={{
                    borderColor: isHighRisk ? 'var(--signal)' : 'var(--ink)',
                    color: isHighRisk ? 'var(--signal)' : 'var(--ink)',
                    background: isCurrent ? (isHighRisk ? 'var(--signal-soft)' : 'var(--paper-soft)') : 'transparent',
                  }}
                >
                  {l.level}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-semibold tracking-tight">{l.name}</h2>
                    {isBeta && (
                      <span
                        className="px-1.5 py-0.5 text-[10px] otto-mono uppercase tracking-wider border"
                        style={{ borderColor: 'var(--signal)', color: 'var(--signal)' }}
                      >
                        Beta
                      </span>
                    )}
                    {isHighRisk && !isBeta && (
                      <span
                        className="px-1.5 py-0.5 text-[10px] otto-mono uppercase tracking-wider border"
                        style={{ borderColor: 'var(--warn)', color: 'var(--warn)' }}
                      >
                        High autonomy
                      </span>
                    )}
                    {isCurrent && (
                      <span
                        className="px-1.5 py-0.5 text-[10px] otto-mono uppercase tracking-wider border"
                        style={{ borderColor: 'var(--ink)', background: 'var(--ink)', color: 'var(--paper)' }}
                      >
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{l.tagline}</p>
                </div>
                {!isCurrent && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    disabled={busy !== null}
                    onClick={() => setLevel(l.level)}
                  >
                    Set as current
                  </Button>
                )}
                {isCurrent && (
                  <div className="shrink-0 flex items-center gap-1.5 text-xs otto-mono uppercase tracking-wider text-muted-foreground">
                    <ShieldCheck size={14} /> Active
                  </div>
                )}
              </div>

              {/* Body: can / cannot */}
              <div className="grid grid-cols-1 md:grid-cols-2 divide-x divide-hair" style={{ borderColor: 'var(--hair)' }}>
                <div className="p-5">
                  <div className="otto-label mb-3">Otto can</div>
                  <ul className="space-y-2">
                    {l.canDo.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--good)' }} />
                        <span className="text-foreground">{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="p-5 md:bg-paper-soft/30" style={{ background: 'var(--paper-soft)' }}>
                  <div className="otto-label mb-3">Otto cannot</div>
                  <ul className="space-y-2">
                    {l.cannotDo.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <X size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--signal)' }} />
                        <span className="text-foreground">{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Warnings */}
              {l.warnings.length > 0 && (
                <div
                  className="px-5 py-4 border-t"
                  style={{
                    borderColor: 'var(--hair)',
                    background: isBeta ? 'var(--signal-soft)' : 'var(--warn-soft)',
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={14} style={{ color: isBeta ? 'var(--signal)' : 'var(--warn)' }} />
                    <span
                      className="otto-label"
                      style={{ color: isBeta ? 'var(--signal)' : 'var(--warn)' }}
                    >
                      Warnings
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {l.warnings.map((w, i) => (
                      <li key={i} className="text-sm text-foreground leading-relaxed pl-6">
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
