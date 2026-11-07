// POST /api/invite/validate — public endpoint to check if a code is valid.
// Used by the marketing site (no auth). Does NOT consume the code.
//
// Body: { code: "OTTO-XXXX-XXXX" }
// Returns: { valid: boolean, reason?: string, remainingUses?: number }

import { NextResponse } from 'next/server'
import { validateInviteCode } from '@/lib/invite'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const code = body.code || ''

  const result = await validateInviteCode(code)
  return NextResponse.json(result, { status: result.valid ? 200 : 400 })
}
