'use client'

import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  AreaChart, Area, Legend, Cell,
} from 'recharts'
import { Activity, AlertTriangle, TrendingUp, Clock, Bot, Gauge } from 'lucide-react'
import { useOtto } from '@/components/otto/store'

interface AnalyticsData {
  totals: { allTime: number; last7: number; last30: number }
  perDay: { date: string; count: number; high: number; medium: number; low: number }[]
  byRiskTier: { tier: string; count: number }[]
  byAction: { action: string; count: number }[]
  byAgent: { agent: string; count: number }[]
  byHour: number[]
  tasksByStatus: { status: string; count: number }[]
  tasksByPriority: { priority: string; count: number }[]
  activeAgents: number
  totalAgents: number
  autonomyHistory: { when: string; summary: string; riskTier: string }[]
}

const RISK_COLORS: Record<string, string> = {
  low: 'var(--ink-muted)',
  medium: 'var(--warn)',
  high: 'var(--signal)',
  critical: 'var(--signal)',
}

const PRIORITY_TONE: Record<string, string> = {
  low: 'var(--ink-muted)',
  normal: 'var(--ink)',
  high: 'var(--warn)',
  critical: 'var(--signal)',
}

const STATUS_TONE: Record<string, string> = {
  queued: 'var(--ink-muted)',
  planning: 'var(--warn)',
  executing: 'var(--good)',
  waiting_approval: 'var(--warn)',
  done: 'var(--good)',
  failed: 'var(--signal)',
  cancelled: 'var(--ink-muted)',
}

export function AnalyticsView() {
  const { setView } = useOtto()
  const [data, setData] = useState<AnalyticsData | null>(null)

  useEffect(() => {
    fetch('/api/analytics').then((r) => r.json()).then(setData)
  }, [])

  if (!data) {
    return <div className="text-sm text-muted-foreground">Loading analytics…</div>
  }

  const hourData = data.byHour.map((count, hour) => ({
    hour: `${hour}:00`,
    count,
  }))

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          What Otto's been up to. Action volume, risk distribution, agent uptime, and patterns over time.
        </p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-hair border border-hair" style={{ background: 'var(--hair)' }}>
        <StatBlock label="Total actions" value={data.totals.allTime} sub="all-time" icon={Activity} />
        <StatBlock label="Last 7 days" value={data.totals.last7} sub="actions" icon={TrendingUp} />
        <StatBlock label="Active agents" value={data.activeAgents} sub={`of ${data.totalAgents} total`} icon={Bot} />
        <StatBlock
          label="High-risk (7d)"
          value={data.perDay.reduce((s, d) => s + d.high, 0)}
          sub="actions"
          icon={AlertTriangle}
          accent="signal"
        />
      </div>

      {/* Actions per day (last 7 days) — stacked area */}
      <ChartCard title="Actions per day" subtitle="Last 7 days, stacked by risk tier">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data.perDay} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="gHigh" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--signal)" stopOpacity={0.9} />
                <stop offset="95%" stopColor="var(--signal)" stopOpacity={0.4} />
              </linearGradient>
              <linearGradient id="gMed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--warn)" stopOpacity={0.7} />
                <stop offset="95%" stopColor="var(--warn)" stopOpacity={0.3} />
              </linearGradient>
              <linearGradient id="gLow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--ink-muted)" stopOpacity={0.5} />
                <stop offset="95%" stopColor="var(--ink-muted)" stopOpacity={0.15} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--hair)" />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => d.slice(5)}
              tick={{ fill: 'var(--ink-muted)', fontSize: 10, fontFamily: 'var(--font-geist-mono), monospace' }}
              axisLine={{ stroke: 'var(--hair)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'var(--ink-muted)', fontSize: 10, fontFamily: 'var(--font-geist-mono), monospace' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--card)',
                border: '1px solid var(--ink)',
                borderRadius: 0,
                fontSize: 11,
                fontFamily: 'var(--font-geist-mono), monospace',
              }}
              labelStyle={{ color: 'var(--ink)' }}
            />
            <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'var(--font-geist-mono), monospace', textTransform: 'uppercase' }} />
            <Area type="monotone" dataKey="low" stackId="1" stroke="var(--ink-muted)" fill="url(#gLow)" name="Low" />
            <Area type="monotone" dataKey="medium" stackId="1" stroke="var(--warn)" fill="url(#gMed)" name="Medium" />
            <Area type="monotone" dataKey="high" stackId="1" stroke="var(--signal)" fill="url(#gHigh)" name="High+Critical" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hour of day distribution */}
        <ChartCard title="Activity by hour" subtitle="When Otto is most active">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourData} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--hair)" vertical={false} />
              <XAxis
                dataKey="hour"
                tick={{ fill: 'var(--ink-muted)', fontSize: 9, fontFamily: 'var(--font-geist-mono), monospace' }}
                axisLine={{ stroke: 'var(--hair)' }}
                tickLine={false}
                interval={3}
              />
              <YAxis
                tick={{ fill: 'var(--ink-muted)', fontSize: 10, fontFamily: 'var(--font-geist-mono), monospace' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--card)',
                  border: '1px solid var(--ink)',
                  borderRadius: 0,
                  fontSize: 11,
                  fontFamily: 'var(--font-geist-mono), monospace',
                }}
              />
              <Bar dataKey="count" fill="var(--ink)" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Top actions */}
        <ChartCard title="Top actions" subtitle="Most frequent operations">
          <div className="space-y-1.5">
            {data.byAction.slice(0, 8).map((a) => {
              const max = data.byAction[0]?.count || 1
              const pct = (a.count / max) * 100
              return (
                <div key={a.action} className="flex items-center gap-3 text-xs">
                  <code className="otto-mono text-foreground w-40 truncate shrink-0">{a.action}</code>
                  <div className="flex-1 h-4 border border-hair relative" style={{ borderColor: 'var(--hair)' }}>
                    <div
                      className="h-full transition-all"
                      style={{ width: `${pct}%`, background: 'var(--ink)' }}
                    />
                  </div>
                  <span className="otto-mono text-muted-foreground w-10 text-right tabular-nums">{a.count}</span>
                </div>
              )
            })}
          </div>
        </ChartCard>

        {/* Risk tier distribution */}
        <ChartCard title="Risk distribution" subtitle="All-time by risk tier">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.byRiskTier} layout="vertical" margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--hair)" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: 'var(--ink-muted)', fontSize: 10, fontFamily: 'var(--font-geist-mono), monospace' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="tier"
                tick={{ fill: 'var(--ink-muted)', fontSize: 10, fontFamily: 'var(--font-geist-mono), monospace', textTransform: 'uppercase' }}
                axisLine={false}
                tickLine={false}
                width={80}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--card)',
                  border: '1px solid var(--ink)',
                  borderRadius: 0,
                  fontSize: 11,
                  fontFamily: 'var(--font-geist-mono), monospace',
                }}
              />
              <Bar dataKey="count" radius={0}>
                {data.byRiskTier.map((entry) => (
                  <Cell key={entry.tier} fill={RISK_COLORS[entry.tier] ?? 'var(--ink)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Agent activity */}
        <ChartCard title="Agent activity" subtitle="Actions per agent, all-time">
          <div className="space-y-1.5">
            {data.byAgent.slice(0, 8).map((a) => {
              const max = data.byAgent[0]?.count || 1
              const pct = (a.count / max) * 100
              return (
                <div key={a.agent} className="flex items-center gap-3 text-xs">
                  <span className="text-foreground w-24 truncate shrink-0">{a.agent}</span>
                  <div className="flex-1 h-4 border border-hair relative" style={{ borderColor: 'var(--hair)' }}>
                    <div
                      className="h-full transition-all"
                      style={{ width: `${pct}%`, background: a.agent === 'Otto' ? 'var(--ink)' : 'var(--ink-muted)' }}
                    />
                  </div>
                  <span className="otto-mono text-muted-foreground w-10 text-right tabular-nums">{a.count}</span>
                </div>
              )
            })}
          </div>
        </ChartCard>
      </div>

      {/* Tasks status + priority */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Task status" subtitle="Current queue distribution">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {data.tasksByStatus.map((t) => (
              <div key={t.status} className="border border-hair p-3" style={{ borderColor: 'var(--hair)' }}>
                <div className="otto-label">{t.status.replace('_', ' ')}</div>
                <div className="text-2xl font-semibold tabular-nums mt-1" style={{ color: STATUS_TONE[t.status] ?? 'var(--ink)' }}>
                  {t.count}
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
        <ChartCard title="Task priority" subtitle="Current queue by priority">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {data.tasksByPriority.map((t) => (
              <div key={t.priority} className="border border-hair p-3" style={{ borderColor: 'var(--hair)' }}>
                <div className="otto-label">{t.priority}</div>
                <div className="text-2xl font-semibold tabular-nums mt-1" style={{ color: PRIORITY_TONE[t.priority] ?? 'var(--ink)' }}>
                  {t.count}
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* Autonomy change history */}
      <ChartCard title="Autonomy changes" subtitle="Recent dial adjustments">
        {data.autonomyHistory.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">No autonomy changes yet.</div>
        ) : (
          <div className="divide-y divide-hair" style={{ borderColor: 'var(--hair)' }}>
            {data.autonomyHistory.map((h, i) => (
              <div key={i} className="py-2 flex items-center gap-3 text-sm">
                <Gauge size={13} style={{ color: h.riskTier === 'high' ? 'var(--signal)' : 'var(--ink-muted)' }} />
                <span className="text-foreground flex-1">{h.summary}</span>
                <span className="otto-mono text-[10px] text-muted-foreground">
                  {new Date(h.when).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </ChartCard>
    </div>
  )
}

function StatBlock({
  label, value, sub, icon: Icon, accent,
}: {
  label: string
  value: number
  sub: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  accent?: 'signal'
}) {
  return (
    <div className="bg-card p-5" style={{ background: 'var(--card)' }}>
      <div className="flex items-center justify-between">
        <span className="otto-label">{label}</span>
        <Icon size={14} style={{ color: accent === 'signal' ? 'var(--signal)' : 'var(--ink-muted)' }} />
      </div>
      <div className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  )
}

function ChartCard({
  title, subtitle, children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="border border-hair bg-card" style={{ borderColor: 'var(--hair)' }}>
      <div className="px-5 py-3 border-b border-hair" style={{ borderColor: 'var(--hair)' }}>
        <h2 className="otto-eyebrow">{title}</h2>
        {subtitle && <p className="text-[10px] otto-mono text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}
