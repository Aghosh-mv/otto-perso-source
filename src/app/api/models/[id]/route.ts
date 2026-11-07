import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// DELETE /api/models/[id]
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await db.modelProvider.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
