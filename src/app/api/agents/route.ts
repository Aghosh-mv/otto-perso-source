import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/agents
export async function GET() {
  const agents = await db.agent.findMany({
    include: { assignedTasks: { where: { status: { in: ['queued', 'executing', 'planning', 'waiting_approval'] } }, take: 5 } },
    orderBy: { spawnedAt: 'asc' },
  })
  return NextResponse.json(agents)
}

// POST /api/agents — spawn a new worker
export async function POST(req: Request) {
  const body = await req.json()
  const agent = await db.agent.create({
    data: {
      name: body.name ?? `Worker-${Math.floor(Math.random() * 9999)}`,
      kind: body.kind ?? 'worker',
      status: 'idle',
      parentId: body.parentId ?? 'otto-main',
      modelName: body.modelName ?? null,
      task: body.task ?? 'Available',
      confidence: 0,
    },
  })
  await db.activityLog.create({
    data: {
      agentName: 'Otto',
      action: 'agent.spawn',
      target: agent.id,
      summary: `Spawned ${agent.kind} agent: ${agent.name}`,
      riskTier: 'low',
      undoable: true,
      autonomyLevel: 3,
    },
  })
  return NextResponse.json(agent, { status: 201 })
}
