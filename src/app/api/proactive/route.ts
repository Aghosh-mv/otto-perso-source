import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/proactive
export async function GET() {
  const items = await db.proactivePrompt.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return NextResponse.json(items)
}

// POST /api/proactive — accept/dismiss/snooze
export async function POST(req: Request) {
  const body = await req.json()
  const { id, action } = body // action: accept | dismiss | snooze
  const status = action === 'accept' ? 'accepted' : action === 'dismiss' ? 'dismissed' : 'snoozed'
  const updated = await db.proactivePrompt.update({
    where: { id },
    data: { status, resolvedAt: new Date() },
  })
  if (action === 'accept' && updated.suggestedAction) {
    const task = await db.task.create({
      data: {
        title: updated.suggestedAction,
        description: updated.content,
        status: 'queued',
        priority: 'normal',
        runMode: 'foreground',
        autonomyLevel: 2,
      },
    })
    await db.activityLog.create({
      data: {
        agentName: 'Owner',
        action: 'proactive.accept',
        target: task.id,
        summary: `Accepted proactive prompt: ${updated.suggestedAction}`,
        riskTier: 'low',
        undoable: true,
        autonomyLevel: 2,
      },
    })
    return NextResponse.json({ ok: true, taskId: task.id })
  }
  return NextResponse.json({ ok: true })
}
