// Augment next-auth types so session.user carries our extra fields.
// The `import 'next-auth'` makes this a module, so `declare module` below
// is treated as augmentation (additive), not replacement.

import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
  interface User {
    id: string
    role?: string
    avatarColor?: string
  }
  interface Session {
    user: {
      id: string
      email: string
      name: string
      role?: string
      avatarColor?: string
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role?: string
    avatarColor?: string
  }
}
