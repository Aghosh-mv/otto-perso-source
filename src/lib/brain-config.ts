// Otto Perso — Brain configuration store.
// Otto ships with a bundled brain key by default (works out of the box).
// Users can paste their own key in Settings → Brain if they want more quota
// or a different model. Stored in SystemState, never returned in plaintext.
//
// Note: the underlying model is an implementation detail. Users see "Otto Perso"
// as the brain name, never the underlying provider.

import { db } from '@/lib/db'

const BUNDLED_KEY = process.env.GEMINI_API_KEY || ''
const BUNDLED_MODEL = process.env.OTTO_MODEL || 'gemini-3.5-flash-lite'

// ─── Obfuscation (XOR + base64, same as phone/email stores) ────────────────
const SECRET = process.env.NEXTAUTH_SECRET || 'otto-perso-local-dev'

function obfuscate(plain: string): string {
  if (!plain) return ''
  const buf = Buffer.from(plain, 'utf-8')
  const key = Buffer.from(SECRET, 'utf-8')
  for (let i = 0; i < buf.length; i++) buf[i] = buf[i] ^ key[i % key.length]
  return buf.toString('base64')
}

function deobfuscate(stored: string): string {
  if (!stored) return ''
  try {
    const buf = Buffer.from(stored, 'base64')
    const key = Buffer.from(SECRET, 'utf-8')
    for (let i = 0; i < buf.length; i++) buf[i] = buf[i] ^ key[i % key.length]
    return buf.toString('utf-8')
  } catch {
    return ''
  }
}

function maskKey(plain: string): string {
  if (!plain) return ''
  if (plain.length <= 8) return '••••'
  return plain.slice(0, 6) + '••••' + plain.slice(-4)
}

export interface BrainConfig {
  apiKey: string      // the actual key to use (user override or bundled)
  model: string       // the model to use
  source: 'bundled' | 'user'   // which key is active
  hasUserOverride: boolean
  maskedKey: string
}

// Load the effective brain config: user override first, then bundled key.
export async function loadBrainConfig(): Promise<BrainConfig> {
  const rows = await db.systemState.findMany({
    where: { key: { in: ['brain.apiKey', 'brain.model'] } },
  })
  const map: Record<string, string> = {}
  for (const r of rows) map[r.key] = r.value

  const userKey = deobfuscate(map['brain.apiKey'] || '')
  const userModel = map['brain.model'] || ''

  const hasUserOverride = !!userKey
  const apiKey = userKey || BUNDLED_KEY
  const model = userModel || BUNDLED_MODEL

  return {
    apiKey,
    model,
    source: hasUserOverride ? 'user' : 'bundled',
    hasUserOverride,
    maskedKey: maskKey(apiKey),
  }
}

// Save a user-provided key (overrides bundled). Pass empty string to clear.
export async function saveBrainConfig(opts: { apiKey?: string; model?: string }): Promise<BrainConfig> {
  if (opts.apiKey !== undefined) {
    if (opts.apiKey === '') {
      // Clear override — go back to bundled
      await db.systemState.deleteMany({ where: { key: 'brain.apiKey' } })
    } else {
      await db.systemState.upsert({
        where: { key: 'brain.apiKey' },
        update: { value: obfuscate(opts.apiKey) },
        create: { key: 'brain.apiKey', value: obfuscate(opts.apiKey) },
      })
    }
  }
  if (opts.model) {
    await db.systemState.upsert({
      where: { key: 'brain.model' },
      update: { value: opts.model },
      create: { key: 'brain.model', value: opts.model },
    })
  }
  return loadBrainConfig()
}

// Public status — safe to return to the client (no plaintext key, no underlying model name).
// Users see "Otto Perso" as the brain, never the underlying provider.
export async function getBrainStatus(): Promise<{
  configured: boolean
  source: 'bundled' | 'user'
  model: string          // always "Otto Perso" — the underlying model is hidden
  maskedKey: string
  hasUserOverride: boolean
  bundledModel: string   // also "Otto Perso" for display
}> {
  const cfg = await loadBrainConfig()
  return {
    configured: !!cfg.apiKey,
    source: cfg.source,
    model: 'Otto Perso',
    maskedKey: cfg.maskedKey,
    hasUserOverride: cfg.hasUserOverride,
    bundledModel: 'Otto Perso',
  }
}

// Test a brain key by calling the underlying provider's model list endpoint.
// Returns ok + sample models. Internal use only — UI shows "test brain".
export async function testBrainKey(apiKey: string): Promise<{ ok: boolean; error?: string; models?: string[] }> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { ok: false, error: data?.error?.message || `HTTP ${res.status}` }
    }
    const data = await res.json()
    const models = (data.models || [])
      .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m: any) => m.name.replace('models/', ''))
      .slice(0, 20)
    return { ok: true, models }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
