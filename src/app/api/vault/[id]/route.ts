import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { writeNoteToDisk, deleteNoteFromDisk, VAULT_DIR } from '@/lib/vault-sync'
import path from 'path'

// PATCH /api/vault/[id] — updates note AND re-syncs to disk
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const data: Record<string, unknown> = { ...body }
  if (body.frontmatter && typeof body.frontmatter !== 'string') {
    data.frontmatter = JSON.stringify(body.frontmatter)
  }
  const updated = await db.vaultNote.update({ where: { id }, data })

  // Re-sync to disk
  const syncRes = writeNoteToDisk({
    id: updated.id,
    title: updated.title,
    category: updated.category,
    tags: updated.tags,
    body: updated.body,
    frontmatter: updated.frontmatter,
    pinned: updated.pinned,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  })
  if (syncRes.ok) {
    const rel = path.relative(VAULT_DIR, syncRes.filePath)
    await db.vaultNote.update({ where: { id }, data: { filePath: rel } })
    updated.filePath = rel
  }

  return NextResponse.json({ ...updated, diskSynced: syncRes.ok })
}

// DELETE — also removes from disk
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const note = await db.vaultNote.findUnique({ where: { id } })
  if (note?.filePath) {
    // Try absolute path first, else resolve from VAULT_DIR
    const abs = note.filePath.startsWith('/')
      ? note.filePath
      : path.join(VAULT_DIR, note.filePath)
    deleteNoteFromDisk(abs)
  }
  await db.vaultNote.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
