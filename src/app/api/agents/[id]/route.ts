import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PATCH /api/agents/[id]
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const updated = await db.agent.update({
    where: { id },
    data: { ...body, lastBeatAt: new Date() },
  })
  return NextResponse.json(updated)
}

// DELETE
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await db.agent.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
