// NextAuth configuration — Credentials provider backed by the User table.
// Single-owner mode by default (one owner account seeded on first run).

import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

async function ensureOwnerSeeded() {
  const ownerEmail = process.env.OTTO_OWNER_EMAIL || 'owner@otto.local'
  const ownerPassword = process.env.OTTO_OWNER_PASSWORD || 'otto-perso-owner'

  const existing = await db.user.findUnique({ where: { email: ownerEmail } })
  if (existing) return

  const passwordHash = await bcrypt.hash(ownerPassword, 10)
  await db.user.create({
    data: {
      email: ownerEmail,
      name: 'Owner',
      passwordHash,
      role: 'owner',
      avatarColor: 'signal',
    },
  })
  console.log(`[auth] Seeded owner account: ${ownerEmail}`)
}

let seedPromise: Promise<void> | null = null
export function ensureOwner() {
  if (!seedPromise) seedPromise = ensureOwnerSeeded()
  return seedPromise
}

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'Otto Perso',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        await ensureOwner()
        if (!credentials?.email || !credentials?.password) return null

        const user = await db.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        })
        if (!user || !user.isActive) return null

        const ok = await bcrypt.compare(credentials.password, user.passwordHash)
        if (!ok) return null

        await db.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        })

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          avatarColor: user.avatarColor,
        } as any
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id
        token.role = (user as any).role
        token.avatarColor = (user as any).avatarColor
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        ;(session.user as any).id = token.id
        ;(session.user as any).role = token.role
        ;(session.user as any).avatarColor = token.avatarColor
      }
      return session
    },
  },
}

export type { Session } from 'next-auth'
