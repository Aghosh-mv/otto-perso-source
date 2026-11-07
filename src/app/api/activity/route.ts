import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/activity
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const riskTier = searchParams.get('riskTier')
  const agentName = searchParams.get('agent')
  const where: Record<string, unknown> = {}
  if (riskTier) where.riskTier = riskTier
  if (agentName) where.agentName = agentName
  const items = await db.activityLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return NextResponse.json(items)
}
