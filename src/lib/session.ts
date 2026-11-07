// Server-side auth helpers — getServerSession wrapper that also seeds owner
// on first call.

import { getServerSession } from 'next-auth/next'
import { authOptions, ensureOwner } from '@/lib/auth'

export async function getSession() {
  await ensureOwner()
  return getServerSession(authOptions)
}

export async function requireUser() {
  const session = await getSession()
  if (!session?.user) {
    throw new Error('UNAUTHORIZED')
  }
  return session
}
