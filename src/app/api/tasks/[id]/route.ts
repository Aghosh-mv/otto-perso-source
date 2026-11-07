import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PATCH /api/tasks/[id]
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  // If updating blockedBy, recompute status
  let data: Record<string, unknown> = { ...body }
  if (Array.isArray(body.blockedBy)) {
    data.blockedBy = JSON.stringify(body.blockedBy)
  }

  const updated = await db.task.update({
    where: { id },
    data: {
      ...data,
      startedAt: body.status === 'executing' ? new Date() : undefined,
      completedAt: body.status === 'done' || body.status === 'failed' ? new Date() : undefined,
    },
  })

  // If task is now done/cancelled/failed, unblock dependents
  if (body.status === 'done' || body.status === 'cancelled' || body.status === 'failed') {
    const allTasks = await db.task.findMany({
      where: { status: 'blocked' },
      select: { id: true, blockedBy: true, title: true },
    })
    for (const t of allTasks) {
      const deps: string[] = JSON.parse(t.blockedBy || '[]')
      if (deps.includes(id)) {
        // Recompute — are all blockers done?
        const remainingBlockers = await db.task.findMany({
          where: { id: { in: deps } },
          select: { status: true },
        })
        const stillBlocked = remainingBlockers.some(
          (b) => b.status !== 'done' && b.status !== 'cancelled' && b.status !== 'failed'
        )
        if (!stillBlocked) {
          await db.task.update({
            where: { id: t.id },
            data: { status: 'queued' },
          })
          await db.activityLog.create({
            data: {
              agentName: 'Otto',
              action: 'task.unblocked',
              target: t.id,
              summary: `Task unblocked: ${t.title}`,
              riskTier: 'low',
              undoable: false,
              autonomyLevel: 2,
            },
          })
        }
      }
    }
  }

  if (body.status) {
    await db.activityLog.create({
      data: {
        agentName: 'Owner',
        action: 'task.status',
        target: id,
        summary: `Task ${body.status}: ${updated.title}`,
        riskTier: 'low',
        undoable: false,
        autonomyLevel: updated.autonomyLevel,
      },
    })
  }
  return NextResponse.json({ ...updated, blockedBy: JSON.parse(updated.blockedBy || '[]') })
}

// DELETE
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await db.task.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
