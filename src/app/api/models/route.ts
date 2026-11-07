import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/models
export async function GET() {
  const providers = await db.modelProvider.findMany({ orderBy: { name: 'asc' } })
  return NextResponse.json(
    providers.map((p) => ({
      ...p,
      models: JSON.parse(p.models),
    }))
  )
}

// POST /api/models — add provider
export async function POST(req: Request) {
  const body = await req.json()
  const created = await db.modelProvider.create({
    data: {
      name: body.name,
      kind: body.kind ?? 'custom',
      endpoint: body.endpoint ?? null,
      apiKeyRef: body.apiKeyRef ?? null,
      isDefault: body.isDefault ?? false,
      isActive: body.isActive ?? true,
      models: JSON.stringify(body.models ?? []),
      latencyMs: 0,
    },
  })
  if (body.isDefault) {
    await db.modelProvider.updateMany({
      where: { id: { not: created.id } },
      data: { isDefault: false },
    })
  }
  return NextResponse.json({ ...created, models: JSON.parse(created.models) }, { status: 201 })
}

// PUT — set defaults / activate
export async function PUT(req: Request) {
  const body = await req.json()
  if (body.setDefault) {
    await db.modelProvider.updateMany({ data: { isDefault: false } })
    await db.modelProvider.update({ where: { id: body.id }, data: { isDefault: true } })
  }
  if (typeof body.isActive === 'boolean') {
    await db.modelProvider.update({ where: { id: body.id }, data: { isActive: body.isActive } })
  }
  return NextResponse.json({ ok: true })
}
