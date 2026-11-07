import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/analytics — bundle of activity stats for the Analytics view
export async function GET() {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const [
    allActivity,
    last7,
    last30,
    byRiskTier,
    byAction,
    byAgent,
    byHour,
    tasksByStatus,
    tasksByPriority,
    agents,
    autonomyHistory,
  ] = await Promise.all([
    db.activityLog.findMany({ take: 5000, orderBy: { createdAt: 'desc' } }),
    db.activityLog.findMany({ where: { createdAt: { gte: sevenDaysAgo } } }),
    db.activityLog.findMany({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    db.activityLog.groupBy({ by: ['riskTier'], _count: true }),
    db.activityLog.groupBy({ by: ['action'], _count: true, orderBy: { _count: { action: 'desc' } }, take: 12 }),
    db.activityLog.groupBy({ by: ['agentName'], _count: true, orderBy: { _count: { agentName: 'desc' } } }),
    // Hour of day distribution — derived in JS below
    db.activityLog.findMany({ select: { createdAt: true }, take: 5000 }),
    db.task.groupBy({ by: ['status'], _count: true }),
    db.task.groupBy({ by: ['priority'], _count: true }),
    db.agent.findMany(),
    db.activityLog.findMany({
      where: { action: 'autonomy.change' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ])

  // Actions per day (last 7 days)
  const dayBuckets: { date: string; count: number; high: number; medium: number; low: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
    const items = last7.filter((a) => a.createdAt >= dayStart && a.createdAt < dayEnd)
    dayBuckets.push({
      date: dayStart.toISOString().slice(0, 10),
      count: items.length,
      high: items.filter((a) => a.riskTier === 'high' || a.riskTier === 'critical').length,
      medium: items.filter((a) => a.riskTier === 'medium').length,
      low: items.filter((a) => a.riskTier === 'low').length,
    })
  }

  // Hour of day distribution
  const hourBuckets = new Array(24).fill(0)
  for (const a of byHour) {
    hourBuckets[new Date(a.createdAt).getHours()]++
  }

  return NextResponse.json({
    totals: {
      allTime: allActivity.length,
      last7: last7.length,
      last30: last30.length,
    },
    perDay: dayBuckets,
    byRiskTier: byRiskTier.map((r) => ({ tier: r.riskTier, count: r._count })),
    byAction: byAction.map((a) => ({ action: a.action, count: a._count })),
    byAgent: byAgent.map((a) => ({ agent: a.agentName ?? 'unknown', count: a._count })),
    byHour: hourBuckets,
    tasksByStatus: tasksByStatus.map((t) => ({ status: t.status, count: t._count })),
    tasksByPriority: tasksByPriority.map((t) => ({ priority: t.priority, count: t._count })),
    activeAgents: agents.filter((a) => a.status === 'executing' || a.status === 'thinking').length,
    totalAgents: agents.length,
    autonomyHistory: autonomyHistory.map((a) => ({
      when: a.createdAt,
      summary: a.summary,
      riskTier: a.riskTier,
    })),
  })
}
