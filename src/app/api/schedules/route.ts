import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

// GET /api/schedules — list scheduled (always-on) jobs
// POST /api/schedules — create one. body: { name, botName, prompt, intervalMinutes }

export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const jobs = await db.scheduledJob.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json(jobs)
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { name, botName, prompt, intervalMinutes } = await req.json()
  if (!name || !botName || !prompt) {
    return NextResponse.json({ error: 'name, botName, prompt required' }, { status: 400 })
  }
  const job = await db.scheduledJob.create({
    data: {
      name: String(name),
      botName: String(botName),
      prompt: String(prompt),
      intervalMinutes: Math.max(1, Number(intervalMinutes) || 60),
      nextRunAt: new Date(), // fire on the next tick
    },
  })
  return NextResponse.json(job)
}
