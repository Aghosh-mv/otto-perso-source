// GET /api/invite/list — list all invite codes (auth required, owner only).
// Returns codes with their usage stats so the owner can manage them.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (session.user.role !== 'owner') return NextResponse.json({ error: 'only the owner can view invite codes' }, { status: 403 })

  const codes = await db.inviteCode.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { createdBy: { select: { name: true, email: true } } },
  })

  return NextResponse.json({
    codes: codes.map((c) => ({
      id: c.id,
      code: c.code,
      status: c.status,
      maxUses: c.maxUses,
      useCount: c.useCount,
      remainingUses: c.maxUses - c.useCount,
      usedBy: c.usedBy,
      usedAt: c.usedAt?.toISOString() || null,
      note: c.note,
      expiresAt: c.expiresAt?.toISOString() || null,
      createdAt: c.createdAt.toISOString(),
      createdBy: c.createdBy?.name || 'unknown',
    })),
  })
}
