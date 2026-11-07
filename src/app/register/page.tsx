'use client'

import { useState, useEffect, Suspense } from 'react'
import { signIn, getSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, UserPlus, ArrowRight, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}>
      <RegisterInner />
    </Suspense>
  )
}

function RegisterInner() {
  const router = useRouter()
  const search = useSearchParams()
  const callbackUrl = search.get('callbackUrl') || '/'

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [created, setCreated] = useState(false)

  useEffect(() => {
    getSession().then((s) => {
      if (s) router.replace(callbackUrl)
      else setChecking(false)
    })
  }, [router, callbackUrl])

  async function submit(e: React.FormEvent) {
    e.preventDefault()

    // Client-side validation
    if (!name.trim()) {
      toast.error('Name is required.')
      return
    }
    if (!email.trim()) {
      toast.error('Email is required.')
      return
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRe.test(email)) {
      toast.error('Please enter a valid email.')
      return
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      toast.error('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Registration failed.')
        return
      }

      // Account created — auto sign-in
      setCreated(true)
      toast.success(`Welcome, ${name}. Your account is ready.`)

      // Brief pause to show the success state, then sign in
      setTimeout(async () => {
        const signInRes = await signIn('credentials', {
          email,
          password,
          redirect: false,
          callbackUrl,
        })
        if (signInRes?.ok) {
          router.replace(callbackUrl)
          router.refresh()
        } else {
          // If auto sign-in fails, send them to the login page
          router.push(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`)
        }
      }, 800)
    } catch (e) {
      toast.error(`Registration failed: ${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (created) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto h-12 w-12 bg-foreground text-background flex items-center justify-center mb-4">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Account created</h1>
          <p className="mt-2 text-sm text-muted-foreground">Signing you in…</p>
          <Loader2 className="h-4 w-4 animate-spin mx-auto mt-4 text-muted-foreground" />
        </div>
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
            <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Join Otto Perso — your digital employee.
            </p>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="border border-border bg-card space-y-4 p-6"
        >
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs uppercase tracking-wider text-muted-foreground">
              Name
            </Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
              placeholder="Your name"
              className="bg-background"
            />
          </div>
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
              autoComplete="new-password"
              required
              className="bg-background"
            />
            <p className="text-[10px] text-muted-foreground">Min 8 characters.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm" className="text-xs uppercase tracking-wider text-muted-foreground">
              Confirm password
            </Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
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
                <UserPlus className="h-4 w-4" />
                <span>Create account</span>
                <ArrowRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        </form>

        <div className="mt-4 text-center text-xs text-muted-foreground">
          Already have an account?{' '}
          <button
            onClick={() => router.push(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`)}
            className="font-medium text-foreground hover:underline inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" /> Sign in
          </button>
        </div>

        <div className="mt-2 text-center text-[11px] text-muted-foreground">
          The first account becomes the owner. Subsequent accounts are members.
        </div>
      </div>
    </div>
  )
}
