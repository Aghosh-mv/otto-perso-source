import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { DEFAULT_MASCOT } from '@/components/mascot/wardrobe'

// /api/mascot-config — DB-backed Lok config so the same mascot travels across
// devices on the same account. GET returns the merged config; POST upserts it.
// Stored as a SystemState row under key 'mascot' (JSON value).

const KEY = 'mascot'

export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const row = await db.systemState.findUnique({ where: { key: KEY } })
  let cfg = DEFAULT_MASCOT
  if (row) {
    try { cfg = { ...DEFAULT_MASCOT, ...JSON.parse(row.value) } } catch {}
  }
  return NextResponse.json(cfg)
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const row = await db.systemState.upsert({
    where: { key: KEY },
    update: { value: JSON.stringify(body) },
    create: { key: KEY, value: JSON.stringify(body) },
  })
  return NextResponse.json({ ok: true, updatedAt: row.updatedAt })
}
