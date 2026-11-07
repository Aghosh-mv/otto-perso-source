import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { writeNoteToDisk, deleteNoteFromDisk, VAULT_DIR } from '@/lib/vault-sync'
import path from 'path'

// GET /api/vault
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const q = searchParams.get('q')?.toLowerCase()
  const where: Record<string, unknown> = {}
  if (category && category !== 'all') where.category = category
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { body: { contains: q } },
      { tags: { contains: q } },
    ]
  }
  const notes = await db.vaultNote.findMany({
    where,
    orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
    take: 200,
  })
  return NextResponse.json(notes)
}

// POST /api/vault — creates note AND writes to disk
export async function POST(req: Request) {
  const body = await req.json()
  const created = await db.vaultNote.create({
    data: {
      title: body.title,
      category: body.category ?? 'general',
      tags: body.tags ?? '',
      body: body.body ?? '',
      frontmatter: body.frontmatter ? JSON.stringify(body.frontmatter) : '{}',
      pinned: body.pinned ?? false,
      filePath: body.filePath ?? null, // will be set by sync
    },
  })

  // Sync to disk
  const syncRes = writeNoteToDisk({
    id: created.id,
    title: created.title,
    category: created.category,
    tags: created.tags,
    body: created.body,
    frontmatter: created.frontmatter,
    pinned: created.pinned,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  })

  let filePath = created.filePath
  if (syncRes.ok) {
    filePath = path.relative(VAULT_DIR, syncRes.filePath)
    await db.vaultNote.update({ where: { id: created.id }, data: { filePath } })
  }

  await db.activityLog.create({
    data: {
      agentName: 'Owner',
      action: 'vault.note.write',
      target: created.id,
      summary: `Wrote vault note: ${created.title}${syncRes.ok ? ' (synced to disk)' : ''}`,
      riskTier: 'low',
      undoable: true,
      autonomyLevel: 2,
    },
  })

  return NextResponse.json(
    { ...created, filePath, diskSynced: syncRes.ok },
    { status: 201 }
  )
}
