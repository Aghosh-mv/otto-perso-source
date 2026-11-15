import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Security middleware — protects ALL /api routes from unauthenticated access.
// Before this, 10+ routes (credentials, conversations, agents, bots, etc.)
// had NO auth check — anyone could read private data. Now every /api route
// requires a valid JWT session, except /api/auth/* (login/register/callback).
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname
  if (path.startsWith('/api/') && !path.startsWith('/api/auth/')) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*'],
}
