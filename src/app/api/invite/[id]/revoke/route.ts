// POST /api/invite/[id]/revoke — revoke an invite code (owner only).

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (session.user.role !== 'owner') return NextResponse.json({ error: 'only the owner can revoke codes' }, { status: 403 })

  const { id } = await params
  const updated = await db.inviteCode.update({
    where: { id },
    data: { status: 'revoked' },
  })
  return NextResponse.json({ ok: true, code: updated.code, status: updated.status })
}
