'use client'

import { useState, useEffect, Suspense } from 'react'
import { signIn, getSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Lock, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}>
      <LoginInner />
    </Suspense>
  )
}

function LoginInner() {
  const router = useRouter()
  const search = useSearchParams()
  const callbackUrl = search.get('callbackUrl') || '/'

  const [email, setEmail] = useState('owner@otto.local')
  const [password, setPassword] = useState('otto-perso-owner')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    getSession().then((s) => {
      if (s) router.replace(callbackUrl)
      else setChecking(false)
    })
  }, [router, callbackUrl])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
      callbackUrl,
    })
    setLoading(false)
    if (res?.error) {
      toast.error('Wrong email or password.')
    } else if (res?.ok) {
      toast.success('Welcome back.')
      router.replace(callbackUrl)
      router.refresh()
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Logo lockup */}
        <div className="flex flex-col items-center mb-8">
          <div className="h-12 w-12 bg-foreground text-background flex items-center justify-center font-mono text-lg font-bold tracking-tight">
            O
          </div>
          <div className="mt-4 text-center">
            <h1 className="text-xl font-semibold tracking-tight">Otto Perso</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              A digital employee that lives on your computer.
            </p>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="border border-border bg-card space-y-4 p-6"
        >
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              className="bg-background"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="bg-background"
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Lock className="h-4 w-4" />
                <span>Sign in</span>
                <ArrowRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        </form>

        <div className="mt-4 text-center text-[11px] text-muted-foreground">
          Default owner:&nbsp;
          <code className="font-mono">owner@otto.local</code>
          &nbsp;/&nbsp;
          <code className="font-mono">otto-perso-owner</code>
        </div>

        <div className="mt-2 text-center text-[11px] text-muted-foreground">
          New here?{' '}
          <button
            onClick={() => router.push('/register')}
            className="font-medium text-foreground hover:underline"
          >
            Create an account →
          </button>
        </div>
      </div>
    </div>
  )
}
