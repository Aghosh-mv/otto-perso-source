// Helpers for invite codes — generation, validation, redemption.

import { db } from '@/lib/db'

// Generate a random invite code like "OTTO-XK4P-7Q2M"
export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I, O, 0, 1 (avoid confusion)
  const part = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `OTTO-${part(4)}-${part(4)}`
}

export interface InviteValidation {
  valid: boolean
  reason?: string
  code?: string
  remainingUses?: number
  maxUses?: number
}

// Check if a code is valid (active, not expired, under max uses).
// Does NOT consume the code — use redeemInviteCode for that.
export async function validateInviteCode(code: string): Promise<InviteValidation> {
  const normalized = (code || '').trim().toUpperCase()
  if (!normalized) return { valid: false, reason: 'No code provided' }

  const invite = await db.inviteCode.findUnique({ where: { code: normalized } })
  if (!invite) return { valid: false, reason: 'Invalid code' }
  if (invite.status === 'revoked') return { valid: false, reason: 'This code has been revoked' }
  if (invite.status === 'used' && invite.maxUses <= 1) return { valid: false, reason: 'This code has already been used' }
  if (invite.useCount >= invite.maxUses) return { valid: false, reason: 'This code has reached its use limit' }
  if (invite.expiresAt && new Date() > invite.expiresAt) return { valid: false, reason: 'This code has expired' }

  return {
    valid: true,
    code: invite.code,
    remainingUses: invite.maxUses - invite.useCount,
    maxUses: invite.maxUses,
  }
}

// Consume a code (increment use count). Returns true on success.
export async function redeemInviteCode(code: string, usedByEmail: string): Promise<boolean> {
  const normalized = (code || '').trim().toUpperCase()
  const validation = await validateInviteCode(normalized)
  if (!validation.valid) return false

  const invite = await db.inviteCode.findUnique({ where: { code: normalized } })
  if (!invite) return false

  const newUseCount = invite.useCount + 1
  const isLastUse = newUseCount >= invite.maxUses

  await db.inviteCode.update({
    where: { id: invite.id },
    data: {
      useCount: newUseCount,
      status: isLastUse ? 'used' : 'active',
      usedBy: usedByEmail,
      usedAt: new Date(),
    },
  })

  return true
}
