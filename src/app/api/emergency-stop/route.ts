import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/emergency-stop — toggle halt
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const target = body?.active ?? true
  await db.systemState.upsert({
    where: { key: 'emergencyStop' },
    update: { value: JSON.stringify({ active: target, lastTriggered: target ? new Date().toISOString() : null }) },
    create: { key: 'emergencyStop', value: JSON.stringify({ active: target, lastTriggered: target ? new Date().toISOString() : null }) },
  })
  // halt all active agents
  if (target) {
    await db.agent.updateMany({
      where: { status: { in: ['executing', 'thinking', 'waiting'] } },
      data: { status: 'stopped' },
    })
    await db.task.updateMany({
      where: { status: { in: ['executing', 'planning', 'queued'] } },
      data: { status: 'cancelled' },
    })
    await db.activityLog.create({
      data: {
        agentName: 'Owner',
        action: 'emergency.stop',
        target: 'system',
        summary: 'EMERGENCY STOP triggered. All agents halted, all queued tasks cancelled.',
        riskTier: 'critical',
        undoable: false,
        autonomyLevel: 0,
      },
    })
  } else {
    await db.agent.updateMany({
      where: { status: 'stopped' },
      data: { status: 'idle' },
    })
  }
  return NextResponse.json({ ok: true, active: target })
}

// GET
export async function GET() {
  const row = await db.systemState.findUnique({ where: { key: 'emergencyStop' } })
  const state = row ? JSON.parse(row.value) : { active: false }
  return NextResponse.json(state)
}
