import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// DELETE /api/credentials/[id]
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cred = await db.credential.findUnique({ where: { id } })
  if (!cred) return NextResponse.json({ error: 'not found' }, { status: 404 })
  await db.credential.delete({ where: { id } })
  await db.activityLog.create({
    data: {
      agentName: 'Owner',
      action: 'credential.delete',
      target: id,
      summary: `Removed credential from vault: ${cred.label}`,
      riskTier: 'medium',
      undoable: false,
      autonomyLevel: 2,
    },
  })
  return NextResponse.json({ ok: true })
}
