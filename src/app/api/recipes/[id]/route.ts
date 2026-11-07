import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PATCH /api/recipes/[id] — toggle favorite, etc.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const updated = await db.recipe.update({ where: { id }, data: body })
  return NextResponse.json({ ...updated, steps: JSON.parse(updated.steps) })
}

// DELETE
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await db.recipe.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
