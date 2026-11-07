// POST /api/agents/[id]/run — kicks off agent execution in the background.
// Returns immediately with status "started". The agent runs async and writes
// results to its row + activity log when done.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'
import { runAgent } from '@/lib/agent-runtime'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const agent = await db.agent.findUnique({ where: { id } })
  if (!agent) {
    return NextResponse.json({ error: 'agent not found' }, { status: 404 })
  }

  // Don't start if already executing
  if (agent.status === 'executing' || agent.status === 'thinking') {
    return NextResponse.json({ error: 'agent already running', status: agent.status }, { status: 409 })
  }

  // Mark as thinking immediately so UI reflects it
  await db.agent.update({
    where: { id },
    data: { status: 'thinking', lastBeatAt: new Date() },
  })

  // Fire and forget — run the agent in the background
  // We don't await this; the endpoint returns immediately.
  runAgent(id).catch((e) => {
    console.error(`[agent-runtime] agent ${id} failed:`, e)
  })

  return NextResponse.json({
    ok: true,
    agentId: id,
    status: 'started',
    message: `Agent "${agent.name}" is now running. Check the agents view or activity log for progress.`,
  })
}
