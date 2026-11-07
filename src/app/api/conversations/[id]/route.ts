import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/conversations/[id] — single conversation with messages
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const convo = await db.conversation.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!convo) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({
    ...convo,
    messages: convo.messages.map((m) => ({
      ...m,
      actions: JSON.parse(m.actions || '[]'),
      attachments: JSON.parse(m.attachments || '[]'),
      thoughts: m.thoughts || '',
    })),
  })
}

// PATCH — rename, pin, archive, update autonomy
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const updated = await db.conversation.update({ where: { id }, data: body })
  return NextResponse.json(updated)
}

// DELETE
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await db.conversation.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
