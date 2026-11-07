// POST /api/auth/register — create a new user account.
// Public endpoint (not behind auth). Validates input, hashes password,
// creates User row, returns success. User then signs in via credentials.
//
// Registration is FREE for all platforms — Mac, Windows, Linux, Android.
// Invite codes are ONLY for iOS TestFlight access (managed separately).

import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const { email, password, name } = body

  // ─── Validation ────────────────────────────────────────────────────────
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }
  if (!password || typeof password !== 'string') {
    return NextResponse.json({ error: 'Password is required' }, { status: 400 })
  }
  if (!name || typeof name !== 'string' || name.trim().length < 1) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const cleanEmail = email.toLowerCase().trim()
  const cleanName = name.trim().slice(0, 60)

  // Email format check
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRe.test(cleanEmail)) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
  }

  // Password strength: min 8 chars
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }
  if (password.length > 200) {
    return NextResponse.json({ error: 'Password too long' }, { status: 400 })
  }

  // Duplicate check
  const existing = await db.user.findUnique({ where: { email: cleanEmail } })
  if (existing) {
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
  }

  // ─── Create user ───────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(password, 10)

  // First user becomes the owner; subsequent users are members
  const userCount = await db.user.count()
  const role = userCount === 0 ? 'owner' : 'member'

  const user = await db.user.create({
    data: {
      email: cleanEmail,
      name: cleanName,
      passwordHash,
      role,
      avatarColor: 'ink',
      isActive: true,
      lastLoginAt: null,
    },
  })

  return NextResponse.json({
    ok: true,
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    message: userCount === 0
      ? 'Owner account created. Sign in with your credentials.'
      : 'Account created. Sign in with your credentials.',
  }, { status: 201 })
}
