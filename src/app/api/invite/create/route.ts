// POST /api/invite/create — generate a new invite code (auth required, owner only).
// Body: { note?: string, maxUses?: number, expiresAt?: string }
// Returns: { ok: true, code: "OTTO-XXXX-XXXX", ... }

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'
import { generateInviteCode } from '@/lib/invite'

export async function POST(req: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (session.user.role !== 'owner') return NextResponse.json({ error: 'only the owner can create invite codes' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const maxUses = Math.max(1, Math.min(100, body.maxUses || 1)) // 1-100 uses
  const note = (body.note || '').toString().slice(0, 200)
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null
  if (expiresAt && isNaN(expiresAt.getTime())) {
    return NextResponse.json({ error: 'invalid expiresAt' }, { status: 400 })
  }

  // Generate a unique code (retry if collision)
  let code = generateInviteCode()
  for (let i = 0; i < 5; i++) {
    const existing = await db.inviteCode.findUnique({ where: { code } })
    if (!existing) break
    code = generateInviteCode()
  }

  const invite = await db.inviteCode.create({
    data: {
      code,
      createdById: session.user.id,
      maxUses,
      note,
      expiresAt,
    },
  })

  return NextResponse.json({
    ok: true,
    code: invite.code,
    maxUses: invite.maxUses,
    note: invite.note,
    expiresAt: invite.expiresAt?.toISOString() || null,
    createdAt: invite.createdAt.toISOString(),
  }, { status: 201 })
}
