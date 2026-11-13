import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

// Otto Drive — personal mini-cloud files. GET lists, POST uploads.
// Bytes land under OTTO_DRIVE_DIR (default: <workspace>/drive), metadata in DB.

function driveDir() {
  return process.env.OTTO_DRIVE_DIR || path.join(process.env.OTTO_WORKSPACE_ROOT || '/home/z/otto-workspace', 'drive')
}

export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const files = await db.driveFile.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json(files.map((f) => ({ id: f.id, name: f.name, mime: f.mime, size: f.size, uploadedBy: f.uploadedBy, createdAt: f.createdAt })))
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'multipart form expected' }, { status: 400 })
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'file field required' }, { status: 400 })

  const id = randomUUID()
  const dir = driveDir()
  await fs.mkdir(dir, { recursive: true })
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'file'
  const diskPath = path.join(dir, `${id}-${safe}`)
  await fs.writeFile(diskPath, Buffer.from(await file.arrayBuffer()))

  const rec = await db.driveFile.create({
    data: {
      id,
      name: file.name,
      mime: file.type || 'application/octet-stream',
      size: file.size,
      path: diskPath,
      uploadedBy: (form.get('device') as string) || '',
    },
  })
  return NextResponse.json({ id: rec.id, name: rec.name, mime: rec.mime, size: rec.size, createdAt: rec.createdAt })
}
