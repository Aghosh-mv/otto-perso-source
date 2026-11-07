import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/conversations — list all (not archived)
export async function GET() {
  const convos = await db.conversation.findMany({
    where: { isArchived: false },
    orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
    take: 100,
    include: { _count: { select: { messages: true } } },
  })
  return NextResponse.json(
    convos.map((c) => ({
      id: c.id,
      title: c.title,
      isPinned: c.isPinned,
      autonomyLevel: c.autonomyLevel,
      messageCount: c._count.messages,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }))
  )
}

// POST /api/conversations — create new
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const created = await db.conversation.create({
    data: {
      title: body.title || 'New conversation',
      autonomyLevel: body.autonomyLevel ?? 2,
    },
  })
  return NextResponse.json(created, { status: 201 })
}
