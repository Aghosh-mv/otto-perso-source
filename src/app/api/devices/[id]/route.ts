import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

// PATCH /api/devices/[id]
//   { heartbeat: true }                       → bump lastSeen
//   { setActive: true }                       → this device becomes the active Lok
//                                                host (all others stand down)
// DELETE /api/devices/[id]                    → remove a device

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  if (body.setActive) {
    // Claim active for this device; clear the flag on every other device so
    // Lok only lives on one screen at a time (travels monitor → phone).
    await db.device.updateMany({ where: { isActive: true, NOT: { id } }, data: { isActive: false } })
    const dev = await db.device.update({ where: { id }, data: { isActive: true, lastSeenAt: new Date() } })
    return NextResponse.json({ ok: true, activeDeviceId: dev.id })
  }

  if (body.heartbeat) {
    await db.device.update({ where: { id }, data: { lastSeenAt: new Date() } }).catch(() => {})
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'nothing to do' }, { status: 400 })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  await db.device.delete({ where: { id } }).catch(() => {})
  return NextResponse.json({ ok: true })
}
