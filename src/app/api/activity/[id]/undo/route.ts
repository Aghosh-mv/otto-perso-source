import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/activity/[id]/undo
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const entry = await db.activityLog.findUnique({ where: { id } })
  if (!entry) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (!entry.undoable) return NextResponse.json({ error: 'not undoable' }, { status: 400 })
  if (entry.undone) return NextResponse.json({ error: 'already undone' }, { status: 400 })

  await db.activityLog.update({ where: { id }, data: { undone: true } })
  await db.activityLog.create({
    data: {
      agentName: 'Owner',
      action: 'activity.undo',
      target: entry.target,
      summary: `Reverted: ${entry.summary}`,
      riskTier: 'low',
      undoable: false,
      autonomyLevel: 2,
    },
  })
  return NextResponse.json({ ok: true })
}
