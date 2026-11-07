import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/credentials — Otto sees only category + label
export async function GET() {
  const creds = await db.credential.findMany({ orderBy: { category: 'asc' } })
  return NextResponse.json(
    creds.map((c) => ({
      id: c.id,
      label: c.label,
      category: c.category,
      issuer: c.issuer,
      maskedValue: c.maskedValue,
      notes: c.notes,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      // secretRef intentionally not exposed
    }))
  )
}

// POST /api/credentials
export async function POST(req: Request) {
  const body = await req.json()
  const maskedValue = maskSecret(body.value)
  const created = await db.credential.create({
    data: {
      label: body.label,
      category: body.category,
      issuer: body.issuer ?? null,
      maskedValue,
      encryptedRef: `vault://creds/${Buffer.from(body.label + ':' + Date.now()).toString('base64')}`,
      notes: body.notes ?? null,
    },
  })
  await db.activityLog.create({
    data: {
      agentName: 'Owner',
      action: 'credential.add',
      target: created.id,
      summary: `Added credential to vault: ${created.label} (${created.category})`,
      riskTier: 'medium',
      undoable: false,
      autonomyLevel: 2,
    },
  })
  return NextResponse.json({
    id: created.id,
    label: created.label,
    category: created.category,
    issuer: created.issuer,
    maskedValue: created.maskedValue,
  }, { status: 201 })
}

function maskSecret(value: string): string {
  if (!value) return ''
  if (value.length <= 4) return '••••'
  return '•'.repeat(Math.min(8, value.length - 4)) + value.slice(-4)
}
