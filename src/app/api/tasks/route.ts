import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/tasks
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const where = status ? { status } : {}
  const tasks = await db.task.findMany({
    where,
    include: { assignee: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  // Parse blockedBy JSON for each task
  return NextResponse.json(
    tasks.map((t) => ({
      ...t,
      blockedBy: JSON.parse(t.blockedBy || '[]'),
    }))
  )
}

// POST /api/tasks
export async function POST(req: Request) {
  const body = await req.json()
  const blockedBy: string[] = Array.isArray(body.blockedBy) ? body.blockedBy : []

  // If blocked by unfinished tasks, set status to 'blocked'
  let initialStatus: string = 'queued'
  if (blockedBy.length > 0) {
    const blockers = await db.task.findMany({
      where: { id: { in: blockedBy } },
      select: { id: true, status: true },
    })
    const unfinished = blockers.filter(
      (b) => b.status !== 'done' && b.status !== 'cancelled' && b.status !== 'failed'
    )
    if (unfinished.length > 0) {
      initialStatus = 'blocked'
    }
  }

  const created = await db.task.create({
    data: {
      title: body.title,
      description: body.description ?? null,
      priority: body.priority ?? 'normal',
      runMode: body.runMode ?? 'foreground',
      autonomyLevel: body.autonomyLevel ?? 2,
      blockedBy: JSON.stringify(blockedBy),
      status: initialStatus,
    },
  })
  await db.activityLog.create({
    data: {
      agentName: 'Owner',
      action: 'task.create',
      target: created.id,
      summary: `Queued task: ${created.title}${blockedBy.length > 0 ? ` (blocked by ${blockedBy.length} task${blockedBy.length === 1 ? '' : 's'})` : ''}`,
      riskTier: 'low',
      undoable: true,
      autonomyLevel: created.autonomyLevel,
    },
  })

  // When a task completes, unblock any tasks waiting on it
  // (handled in PATCH endpoint when status changes to done)

  return NextResponse.json(
    { ...created, blockedBy: JSON.parse(created.blockedBy || '[]') },
    { status: 201 }
  )
}
