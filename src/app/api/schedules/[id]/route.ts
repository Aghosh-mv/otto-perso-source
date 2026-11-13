import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

// PATCH /api/schedules/[id] — { enabled?, intervalMinutes?, prompt? }
// DELETE /api/schedules/[id]

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const data: any = {}
  if (typeof body.enabled === 'boolean') data.enabled = body.enabled
  if (typeof body.intervalMinutes === 'number') data.intervalMinutes = Math.max(1, body.intervalMinutes)
  if (typeof body.prompt === 'string') data.prompt = body.prompt
  const job = await db.scheduledJob.update({ where: { id }, data })
  return NextResponse.json(job)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  await db.scheduledJob.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
