// Phone credentials storage — SystemState-backed, never returned in plaintext.
// Keys:
//   phone.provider     — telnyx | twilio | vonage | plivo
//   phone.apiKey       — encrypted/obfuscated (we use a simple XOR + base64 for dev)
//   phone.apiSecret    — same
//   phone.fromNumber   — E.164

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'
import { maskKey, obfuscate, deobfuscate } from '@/lib/phone-store'

// GET /api/phone — current status (no secrets)
export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const rows = await db.systemState.findMany({
    where: { key: { startsWith: 'phone.' } },
  })
  const map: Record<string, string> = {}
  for (const r of rows) map[r.key] = r.value

  if (!map['phone.apiKey']) {
    return NextResponse.json({ configured: false })
  }

  return NextResponse.json({
    configured: true,
    provider: map['phone.provider'] || 'telnyx',
    fromNumber: map['phone.fromNumber'] || '',
    maskedKey: maskKey(deobfuscate(map['phone.apiKey'])),
  })
}

// POST /api/phone — save credentials
export async function POST(req: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  const updates: { key: string; value: string }[] = []

  if (body.provider) updates.push({ key: 'phone.provider', value: body.provider })
  if (body.fromNumber) updates.push({ key: 'phone.fromNumber', value: body.fromNumber })

  // Only update apiKey/apiSecret if provided (allow blank to keep current)
  if (body.apiKey) updates.push({ key: 'phone.apiKey', value: obfuscate(body.apiKey) })
  if (body.apiSecret) updates.push({ key: 'phone.apiSecret', value: obfuscate(body.apiSecret) })

  for (const u of updates) {
    await db.systemState.upsert({
      where: { key: u.key },
      update: { value: u.value },
      create: { key: u.key, value: u.value },
    })
  }

  // Reload to return current state
  const rows = await db.systemState.findMany({
    where: { key: { startsWith: 'phone.' } },
  })
  const map: Record<string, string> = {}
  for (const r of rows) map[r.key] = r.value

  return NextResponse.json({
    configured: !!map['phone.apiKey'],
    provider: map['phone.provider'] || 'telnyx',
    fromNumber: map['phone.fromNumber'] || '',
    maskedKey: maskKey(deobfuscate(map['phone.apiKey'] || '')),
  })
}

// DELETE /api/phone — remove all phone creds
export async function DELETE() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  await db.systemState.deleteMany({
    where: { key: { startsWith: 'phone.' } },
  })
  return NextResponse.json({ ok: true, configured: false })
}
