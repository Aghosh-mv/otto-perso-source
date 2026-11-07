// Email credentials storage + test endpoint — mirrors /api/phone.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'
import { maskKey, obfuscate, deobfuscate } from '@/lib/email-store'

// GET /api/email — current status (no secrets)
export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const rows = await db.systemState.findMany({
    where: { key: { startsWith: 'email.' } },
  })
  const map: Record<string, string> = {}
  for (const r of rows) map[r.key] = r.value

  if (!map['email.provider']) {
    return NextResponse.json({ configured: false })
  }

  return NextResponse.json({
    configured: true,
    provider: map['email.provider'],
    fromEmail: map['email.fromEmail'] || '',
    fromName: map['email.fromName'] || 'Otto Perso',
    maskedKey: maskKey(deobfuscate(map['email.apiKey'] || map['email.smtpPass'] || '')),
    smtpHost: map['email.smtpHost'] || '',
  })
}

// POST /api/email — save credentials
export async function POST(req: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  const updates: { key: string; value: string }[] = []

  if (body.provider) updates.push({ key: 'email.provider', value: body.provider })
  if (body.fromEmail) updates.push({ key: 'email.fromEmail', value: body.fromEmail })
  if (body.fromName) updates.push({ key: 'email.fromName', value: body.fromName })

  if (body.apiKey) updates.push({ key: 'email.apiKey', value: obfuscate(body.apiKey) })

  // SMTP fields
  if (body.smtpHost) updates.push({ key: 'email.smtpHost', value: body.smtpHost })
  if (body.smtpPort) updates.push({ key: 'email.smtpPort', value: String(body.smtpPort) })
  if (body.smtpUser) updates.push({ key: 'email.smtpUser', value: body.smtpUser })
  if (body.smtpPass) updates.push({ key: 'email.smtpPass', value: obfuscate(body.smtpPass) })

  for (const u of updates) {
    await db.systemState.upsert({
      where: { key: u.key },
      update: { value: u.value },
      create: { key: u.key, value: u.value },
    })
  }

  // Reload
  const rows = await db.systemState.findMany({
    where: { key: { startsWith: 'email.' } },
  })
  const map: Record<string, string> = {}
  for (const r of rows) map[r.key] = r.value

  return NextResponse.json({
    configured: !!map['email.provider'],
    provider: map['email.provider'],
    fromEmail: map['email.fromEmail'] || '',
    fromName: map['email.fromName'] || 'Otto Perso',
    maskedKey: maskKey(deobfuscate(map['email.apiKey'] || map['email.smtpPass'] || '')),
    smtpHost: map['email.smtpHost'] || '',
  })
}

// DELETE /api/email
export async function DELETE() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  await db.systemState.deleteMany({
    where: { key: { startsWith: 'email.' } },
  })
  return NextResponse.json({ ok: true, configured: false })
}
