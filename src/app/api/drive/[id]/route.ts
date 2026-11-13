import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

// GET /api/drive/[id]  — download a file (stream bytes + content-disposition)
// DELETE /api/drive/[id] — remove a file (disk + record)

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const rec = await db.driveFile.findUnique({ where: { id } })
  if (!rec) return NextResponse.json({ error: 'not found' }, { status: 404 })
  let buf: Buffer
  try { buf = await fs.readFile(rec.path) } catch { return NextResponse.json({ error: 'file missing on disk' }, { status: 410 }) }
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': rec.mime,
      'Content-Disposition': `attachment; filename="${rec.name.replace(/"/g, '')}"`,
      'Content-Length': String(rec.size),
    },
  })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const rec = await db.driveFile.findUnique({ where: { id } })
  if (rec) {
    try { await fs.unlink(rec.path) } catch {}
    await db.driveFile.delete({ where: { id } })
  }
  return NextResponse.json({ ok: true })
}
