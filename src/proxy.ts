// Next.js 16 proxy (formerly middleware) — gates all routes behind NextAuth.
// Public routes: /api/auth/*, /api/invite/validate, /api/config/test, /login, /register, /download, static assets.

import { withAuth } from 'next-auth/middleware'

export default withAuth({
  pages: { signIn: '/login' },
})

export const config = {
  matcher: [
    '/((?!api/auth|api/invite/validate|api/config/test|login|register|download|_next/static|_next/image|favicon.ico|icon.svg|icon-180.png|icon-192.png|icon-512.png|manifest.json|sw.js|robots.txt).*)',
  ],
}
