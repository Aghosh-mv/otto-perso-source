import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/system — update a SystemState row by key
export async function POST(req: Request) {
  const { key, value } = await req.json()
  if (!key || typeof value !== 'string') {
    return NextResponse.json({ error: 'key and value required' }, { status: 400 })
  }
  const updated = await db.systemState.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  })
  return NextResponse.json({ ok: true, key: updated.key })
}

// GET /api/system — bundle of overview counts + current autonomy + risk thresholds + emergency state
export async function GET() {
  const [
    taskCounts,
    agents,
    vaultCount,
    credCount,
    recipeCount,
    activityCount,
    pendingProactive,
    currentAutonomy,
    emergencyRow,
    riskRow,
  ] = await Promise.all([
    db.task.groupBy({ by: ['status'], _count: true }),
    db.agent.findMany({ select: { id: true, status: true, kind: true } }),
    db.vaultNote.count(),
    db.credential.count(),
    db.recipe.count(),
    db.activityLog.count(),
    db.proactivePrompt.count({ where: { status: 'pending' } }),
    db.autonomySetting.findFirst({ where: { isCurrent: true } }),
    db.systemState.findUnique({ where: { key: 'emergencyStop' } }),
    db.systemState.findUnique({ where: { key: 'riskThresholds' } }),
  ])

  const tasksByStatus: Record<string, number> = {}
  for (const t of taskCounts) tasksByStatus[t.status] = t._count

  const agentsByStatus: Record<string, number> = {}
  for (const a of agents) agentsByStatus[a.status] = (agentsByStatus[a.status] ?? 0) + 1

  return NextResponse.json({
    tasksByStatus,
    agentsByStatus,
    totalAgents: agents.length,
    vaultCount,
    credCount,
    recipeCount,
    activityCount,
    pendingProactive,
    currentAutonomy: currentAutonomy
      ? {
          level: currentAutonomy.level,
          name: currentAutonomy.name,
          tagline: currentAutonomy.tagline,
        }
      : null,
    emergency: emergencyRow ? JSON.parse(emergencyRow.value) : { active: false },
    riskThresholds: riskRow ? JSON.parse(riskRow.value) : null,
  })
}
