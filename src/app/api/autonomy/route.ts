import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/autonomy — list all levels
export async function GET() {
  const rows = await db.autonomySetting.findMany({ orderBy: { level: 'asc' } })
  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      level: r.level,
      name: r.name,
      tagline: r.tagline,
      canDo: JSON.parse(r.canDo),
      cannotDo: JSON.parse(r.cannotDo),
      warnings: r.warnings ? JSON.parse(r.warnings) : [],
      isCurrent: r.isCurrent,
    }))
  )
}

// PUT /api/autonomy — set current level
export async function PUT(req: Request) {
  const { level } = await req.json()
  if (typeof level !== 'number' || level < 1 || level > 5) {
    return NextResponse.json({ error: 'invalid level' }, { status: 400 })
  }
  await db.autonomySetting.updateMany({ data: { isCurrent: false } })
  await db.autonomySetting.update({ where: { level }, data: { isCurrent: true } })

  const target = await db.autonomySetting.findUnique({ where: { level } })
  await db.activityLog.create({
    data: {
      agentName: 'Owner',
      action: 'autonomy.change',
      target: `level ${level}`,
      summary: `Autonomy set to L${level} — ${target?.name ?? ''}`,
      riskTier: level >= 4 ? 'high' : level === 3 ? 'medium' : 'low',
      undoable: false,
      autonomyLevel: level,
    },
  })

  return NextResponse.json({ ok: true, level })
}
