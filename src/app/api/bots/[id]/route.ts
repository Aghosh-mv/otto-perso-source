import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PATCH /api/bots/[id]
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const data: Record<string, unknown> = { ...body }
  if (Array.isArray(body.allowedActions)) {
    data.allowedActions = JSON.stringify(body.allowedActions)
  }
  const updated = await db.customBot.update({ where: { id }, data })
  return NextResponse.json({ ...updated, allowedActions: JSON.parse(updated.allowedActions) })
}

// DELETE
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const bot = await db.customBot.findUnique({ where: { id } })
  if (!bot) return NextResponse.json({ error: 'not found' }, { status: 404 })
  await db.customBot.delete({ where: { id } })
  await db.activityLog.create({
    data: {
      agentName: 'Owner',
      action: 'bot.delete',
      target: id,
      summary: `Deleted custom bot: ${bot.name}`,
      riskTier: 'low',
      undoable: false,
      autonomyLevel: 2,
    },
  })
  return NextResponse.json({ ok: true })
}
