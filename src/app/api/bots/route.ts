import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/bots
export async function GET() {
  const bots = await db.customBot.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json(
    bots.map((b) => ({
      ...b,
      allowedActions: JSON.parse(b.allowedActions),
    }))
  )
}

// POST /api/bots
export async function POST(req: Request) {
  const body = await req.json()
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name required' }, { status: 400 })
  }
  const created = await db.customBot.create({
    data: {
      name: body.name,
      description: body.description ?? '',
      systemPrompt: body.systemPrompt ?? '',
      modelName: body.modelName ?? '',
      allowedActions: JSON.stringify(body.allowedActions ?? []),
      autonomyCap: body.autonomyCap ?? 2,
      color: body.color ?? 'ink',
      isActive: body.isActive ?? true,
    },
  })
  await db.activityLog.create({
    data: {
      agentName: 'Owner',
      action: 'bot.create',
      target: created.id,
      summary: `Created custom bot: ${created.name}`,
      riskTier: 'low',
      undoable: false,
      autonomyLevel: 2,
    },
  })
  return NextResponse.json({ ...created, allowedActions: JSON.parse(created.allowedActions) }, { status: 201 })
}
