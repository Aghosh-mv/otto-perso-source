// GET /api/config — current brain config status (no plaintext key)
// POST /api/config — save user override (apiKey, model) or clear (apiKey: '')

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getBrainStatus, saveBrainConfig } from '@/lib/brain-config'

export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const status = await getBrainStatus()
  return NextResponse.json(status)
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const updates: { apiKey?: string; model?: string } = {}

  if (typeof body.apiKey === 'string') {
    updates.apiKey = body.apiKey
  }
  if (typeof body.model === 'string' && body.model) {
    updates.model = body.model
  }

  const cfg = await saveBrainConfig(updates)
  // Return the public status (model shown as "Otto Perso", never the underlying name)
  const status = await getBrainStatus()
  return NextResponse.json({
    ok: true,
    configured: !!cfg.apiKey,
    source: cfg.source,
    model: status.model,
    maskedKey: cfg.maskedKey,
    hasUserOverride: cfg.hasUserOverride,
  })
}
