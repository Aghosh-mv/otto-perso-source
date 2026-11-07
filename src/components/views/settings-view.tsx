'use client'

import { useEffect, useState } from 'react'
import { Save, AlertTriangle, Keyboard, Activity, ShieldAlert, Phone, Mail, Brain, ExternalLink, Check, X, Loader2, Cpu, Ticket, Copy, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'

interface RiskThresholds {
  autoApproveBelow: number
  askBetween: [number, number]
  alwaysAskBelow: number
  spendBudget24h: number
  emailBudget1h: number
}

export function SettingsView() {
  const [thresholds, setThresholds] = useState<RiskThresholds | null>(null)
  const [draft, setDraft] = useState<RiskThresholds | null>(null)
  const [phoneCreds, setPhoneCreds] = useState<{ provider: string; apiKey: string; apiSecret: string; fromNumber: string } | null>(null)
  const [phoneDraft, setPhoneDraft] = useState<{ provider: string; apiKey: string; apiSecret: string; fromNumber: string }>({ provider: 'telnyx', apiKey: '', apiSecret: '', fromNumber: '' })
  const [phoneStatus, setPhoneStatus] = useState<{ configured: boolean; maskedKey?: string; fromNumber?: string; provider?: string } | null>(null)
  const [testingPhone, setTestingPhone] = useState(false)
  const [testNumber, setTestNumber] = useState('')
  const [emailDraft, setEmailDraft] = useState<{ provider: string; apiKey: string; fromEmail: string; fromName: string; smtpHost: string; smtpPort: string; smtpUser: string; smtpPass: string }>({
    provider: 'resend', apiKey: '', fromEmail: '', fromName: 'Otto Perso',
    smtpHost: '', smtpPort: '587', smtpUser: '', smtpPass: '',
  })
  const [emailStatus, setEmailStatus] = useState<{ configured: boolean; maskedKey?: string; fromEmail?: string; fromName?: string; provider?: string; smtpHost?: string } | null>(null)
  const [testingEmail, setTestingEmail] = useState(false)
  const [testEmailTo, setTestEmailTo] = useState('')
  const [brainStatus, setBrainStatus] = useState<{ configured: boolean; source: 'bundled' | 'user'; model: string; maskedKey: string; hasUserOverride: boolean; bundledModel: string } | null>(null)
  const [brainKeyDraft, setBrainKeyDraft] = useState('')
  const [brainModelDraft, setBrainModelDraft] = useState('')
  const [testingBrain, setTestingBrain] = useState(false)

  useEffect(() => {
    fetch('/api/system').then((r) => r.json()).then((sys) => {
      if (sys.riskThresholds) {
        setThresholds(sys.riskThresholds)
        setDraft(sys.riskThresholds)
      }
    })
    fetch('/api/phone').then((r) => r.ok ? r.json() : null).then((data) => {
      if (data) {
        setPhoneStatus(data)
        if (data.configured) {
          setPhoneDraft((p) => ({
            ...p,
            provider: data.provider || 'telnyx',
            fromNumber: data.fromNumber || '',
            apiKey: '',
            apiSecret: '',
          }))
        }
      }
    }).catch(() => {})
    fetch('/api/email').then((r) => r.ok ? r.json() : null).then((data) => {
      if (data) {
        setEmailStatus(data)
        if (data.configured) {
          setEmailDraft((p) => ({
            ...p,
            provider: data.provider || 'resend',
            fromEmail: data.fromEmail || '',
            fromName: data.fromName || 'Otto Perso',
            apiKey: '',
            smtpHost: data.smtpHost || '',
            smtpUser: '',
            smtpPass: '',
          }))
        }
      }
    }).catch(() => {})
    fetch('/api/config').then((r) => r.ok ? r.json() : null).then((data) => {
      if (data) setBrainStatus(data)
    }).catch(() => {})
  }, [])

  async function saveEmail() {
    const res = await fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...emailDraft,
        smtpPort: emailDraft.provider === 'smtp' ? parseInt(emailDraft.smtpPort, 10) || 587 : undefined,
      }),
    })
    if (res.ok) {
      const data = await res.json()
      setEmailStatus(data)
      setEmailDraft((p) => ({ ...p, apiKey: '', smtpPass: '' }))
      toast.success('Email credentials saved')
    } else {
      toast.error('Failed to save email credentials')
    }
  }

  async function deleteEmail() {
    if (!confirm('Remove email credentials? Otto will lose email tools.')) return
    await fetch('/api/email', { method: 'DELETE' })
    setEmailStatus({ configured: false })
    setEmailDraft({ provider: 'resend', apiKey: '', fromEmail: '', fromName: 'Otto Perso', smtpHost: '', smtpPort: '587', smtpUser: '', smtpPass: '' })
    toast.success('Email credentials removed')
  }

  async function testEmail() {
    if (!testEmailTo.trim()) {
      toast.error('Enter an email address to test')
      return
    }
    setTestingEmail(true)
    try {
      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testEmailTo.trim() }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        toast.success(`Test email sent to ${testEmailTo}`)
      } else {
        toast.error(data.error || 'Test failed')
      }
    } catch (e) {
      toast.error(`Test failed: ${(e as Error).message}`)
    } finally {
      setTestingEmail(false)
    }
  }

  async function savePhone() {
    const res = await fetch('/api/phone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(phoneDraft),
    })
    if (res.ok) {
      const data = await res.json()
      setPhoneStatus(data)
      setPhoneDraft((p) => ({ ...p, apiKey: '', apiSecret: '' }))
      toast.success('Phone credentials saved')
    } else {
      toast.error('Failed to save phone credentials')
    }
  }

  async function deletePhone() {
    if (!confirm('Remove phone credentials? Otto will lose SMS/call tools.')) return
    await fetch('/api/phone', { method: 'DELETE' })
    setPhoneStatus({ configured: false })
    setPhoneDraft({ provider: 'telnyx', apiKey: '', apiSecret: '', fromNumber: '' })
    toast.success('Phone credentials removed')
  }

  async function testPhone() {
    if (!testNumber.trim()) {
      toast.error('Enter a number to test (E.164: +15551234567)')
      return
    }
    setTestingPhone(true)
    try {
      const res = await fetch('/api/phone/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testNumber.trim() }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        toast.success(`Test SMS sent to ${testNumber}`)
      } else {
        toast.error(data.error || 'Test failed')
      }
    } catch (e) {
      toast.error(`Test failed: ${(e as Error).message}`)
    } finally {
      setTestingPhone(false)
    }
  }

  async function save() {
    if (!draft) return
    // store back through a system state upsert — for simplicity, use the same fetch pattern
    await fetch('/api/system', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'riskThresholds', value: JSON.stringify(draft) }),
    })
    setThresholds(draft)
    toast.success('Settings saved')
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Risk thresholds, action budgets, and emergency controls. These apply across all autonomy levels.
        </p>
      </div>

      {/* Brain — Otto's brain config (bundled key + optional user override) */}
      <section className="border border-hair bg-card" style={{ borderColor: 'var(--hair)' }}>
        <div className="px-5 py-3 border-b border-hair flex items-center justify-between" style={{ borderColor: 'var(--hair)' }}>
          <div className="flex items-center gap-2">
            <Brain size={14} />
            <h2 className="otto-eyebrow">Otto's brain</h2>
          </div>
          {brainStatus?.configured ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-green-700">
              <Check size={11} /> {brainStatus.source === 'user' ? 'Your key active' : 'Bundled key active'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <X size={11} /> Not configured
            </span>
          )}
        </div>
        <div className="p-5 space-y-4">
          <div className="text-xs text-muted-foreground space-y-1.5">
            <p>
              Otto ships with a bundled brain key — it works the moment you install the app. No setup required.
            </p>
            <p>
              If you want more quota or your own key, paste it below. Otto will use your key instead of the bundled one. You can switch back anytime.
            </p>
            {brainStatus && (
              <p className="text-[11px] font-mono">
                Active key: {brainStatus.maskedKey} · Source: {brainStatus.source === 'user' ? 'your key' : 'bundled'}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="otto-label block mb-1.5">
                Your brain key {brainStatus?.hasUserOverride && <span className="text-muted-foreground">(leave blank to keep current)</span>}
              </label>
              <Input
                type="password"
                value={brainKeyDraft}
                onChange={(e) => setBrainKeyDraft(e.target.value)}
                placeholder={brainStatus?.hasUserOverride ? `Current: ${brainStatus.maskedKey}` : 'Paste your key (optional)'}
                className="otto-mono"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Get your own key from Google AI Studio (aistudio.google.com) — free tier gives 500 requests/day.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button
              onClick={async () => {
                const res = await fetch('/api/config', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ apiKey: brainKeyDraft || '' }),
                })
                if (res.ok) {
                  const data = await res.json()
                  setBrainStatus(data)
                  setBrainKeyDraft('')
                  toast.success(brainKeyDraft ? 'Brain key saved — Otto will use your key now.' : 'Reverted to bundled key.')
                } else {
                  toast.error('Failed to save brain key')
                }
              }}
              size="sm"
              className="gap-1.5"
              disabled={!brainKeyDraft && !brainStatus?.hasUserOverride}
            >
              <Save size={13} /> {brainKeyDraft ? 'Use my key' : 'Save'}
            </Button>
            {brainStatus?.hasUserOverride && (
              <Button
                onClick={async () => {
                  const res = await fetch('/api/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ apiKey: '' }),
                  })
                  if (res.ok) {
                    const data = await res.json()
                    setBrainStatus(data)
                    toast.success('Reverted to bundled key')
                  }
                }}
                variant="outline"
                size="sm"
              >
                Use bundled key
              </Button>
            )}
            <Button
              onClick={async () => {
                if (!brainKeyDraft) {
                  toast.error('Paste a key to test first')
                  return
                }
                setTestingBrain(true)
                try {
                  const res = await fetch('/api/config/test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ apiKey: brainKeyDraft }),
                  })
                  const data = await res.json()
                  if (data.ok) {
                    toast.success(`Brain key works — ${data.models?.length || 0} models available.`)
                  } else {
                    toast.error(`Brain key test failed: ${data.error}`)
                  }
                } catch (e) {
                  toast.error(`Test failed: ${(e as Error).message}`)
                } finally {
                  setTestingBrain(false)
                }
              }}
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={!brainKeyDraft || testingBrain}
            >
              {testingBrain ? <Loader2 size={13} className="animate-spin" /> : <Cpu size={13} />}
              Test key
            </Button>
          </div>
        </div>
      </section>

      {/* Risk thresholds */}
      <section className="border border-hair bg-card" style={{ borderColor: 'var(--hair)' }}>
        <div className="px-5 py-3 border-b border-hair flex items-center gap-2" style={{ borderColor: 'var(--hair)' }}>
          <ShieldAlert size={14} />
          <h2 className="otto-eyebrow">Confidence thresholds</h2>
        </div>
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ThresholdField
              label="Auto-approve ≥"
              suffix="%"
              value={draft ? draft.autoApproveBelow * 100 : 0}
              onChange={(v) => setDraft({ ...(draft as RiskThresholds), autoApproveBelow: v / 100 })}
              help="Otto acts without asking above this confidence."
            />
            <ThresholdField
              label="Always ask ≤"
              suffix="%"
              value={draft ? draft.alwaysAskBelow * 100 : 0}
              onChange={(v) => setDraft({ ...(draft as RiskThresholds), alwaysAskBelow: v / 100 })}
              help="Otto asks regardless of autonomy level."
            />
            <ThresholdField
              label="Ask between"
              suffix="%"
              value={draft ? draft.askBetween[0] * 100 : 0}
              onChange={(v) =>
                setDraft({
                  ...(draft as RiskThresholds),
                  askBetween: [v / 100, (draft as RiskThresholds).askBetween[1]],
                })
              }
              help="Otto acts but flags for review."
            />
          </div>
        </div>
      </section>

      {/* Action budgets */}
      <section className="border border-hair bg-card" style={{ borderColor: 'var(--hair)' }}>
        <div className="px-5 py-3 border-b border-hair flex items-center gap-2" style={{ borderColor: 'var(--hair)' }}>
          <Activity size={14} />
          <h2 className="otto-eyebrow">Action budgets</h2>
        </div>
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ThresholdField
              label="Spend limit (24h)"
              prefix="$"
              value={draft ? draft.spendBudget24h : 0}
              onChange={(v) => setDraft({ ...(draft as RiskThresholds), spendBudget24h: v })}
              help="Otto cannot spend above this in any 24h window. 0 = no spend allowed."
            />
            <ThresholdField
              label="Email send limit (1h)"
              suffix=" emails"
              value={draft ? draft.emailBudget1h : 0}
              onChange={(v) => setDraft({ ...(draft as RiskThresholds), emailBudget1h: v })}
              help="Max emails Otto can send in an hour."
            />
          </div>
          <div
            className="px-3 py-2 border text-xs flex items-start gap-2"
            style={{
              borderColor: 'var(--warn)',
              background: 'var(--warn-soft)',
              color: 'var(--warn)',
            }}
          >
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>
              Budgets are hard limits. Even in Vacation Mode, Otto will halt and ask if hitting one.
              Critical actions (money movement, legal docs) always require 2FA regardless.
            </span>
          </div>
        </div>
      </section>

      {/* Phone integration */}
      <section className="border border-hair bg-card" style={{ borderColor: 'var(--hair)' }}>
        <div className="px-5 py-3 border-b border-hair flex items-center justify-between" style={{ borderColor: 'var(--hair)' }}>
          <div className="flex items-center gap-2">
            <Phone size={14} />
            <h2 className="otto-eyebrow">Phone number (for SMS & calls)</h2>
          </div>
          {phoneStatus?.configured ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-green-700">
              <Check size={11} /> Connected · {phoneStatus.provider} · {phoneStatus.fromNumber}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <X size={11} /> Not configured
            </span>
          )}
        </div>
        <div className="p-5 space-y-4">
          <div className="text-xs text-muted-foreground space-y-1.5">
            <p>
              Otto can send SMS and make voice calls — but it needs a real phone number. <strong>Phone numbers are not free.</strong> You buy your own from a carrier-API provider, paste the credentials here, and Otto uses them via tools.
            </p>
            <p className="flex items-center gap-2 flex-wrap">
              <span>Recommended providers (US local number, monthly cost):</span>
              <a href="https://telnyx.com/pricing/numbers" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">Telnyx $1/mo <ExternalLink size={10} /></a>
              <a href="https://www.vonage.com/communications-apis/pricing" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">Vonage $0.90/mo <ExternalLink size={10} /></a>
              <a href="https://www.twilio.com/en-us/pricing" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">Twilio $1.15/mo <ExternalLink size={10} /></a>
            </p>
            <p className="text-[11px]">
              Per-message costs ~$0.004 (Telnyx) to ~$0.008 (Twilio). Voice ~$0.002–0.014/min. Trial credits exist but expire; this is real money.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="otto-label block mb-1.5">Provider</label>
              <select
                value={phoneDraft.provider}
                onChange={(e) => setPhoneDraft({ ...phoneDraft, provider: e.target.value })}
                className="w-full h-9 px-2 border border-hair bg-background text-sm otto-mono"
                style={{ borderColor: 'var(--hair)' }}
              >
                <option value="telnyx">Telnyx</option>
                <option value="twilio">Twilio</option>
                <option value="vonage">Vonage</option>
                <option value="plivo">Plivo</option>
              </select>
            </div>
            <div>
              <label className="otto-label block mb-1.5">Your phone number (E.164)</label>
              <Input
                value={phoneDraft.fromNumber}
                onChange={(e) => setPhoneDraft({ ...phoneDraft, fromNumber: e.target.value })}
                placeholder="+15551234567"
                className="otto-mono"
              />
            </div>
            <div>
              <label className="otto-label block mb-1.5">API key {phoneStatus?.configured && <span className="text-muted-foreground">(leave blank to keep current)</span>}</label>
              <Input
                type="password"
                value={phoneDraft.apiKey}
                onChange={(e) => setPhoneDraft({ ...phoneDraft, apiKey: e.target.value })}
                placeholder={phoneStatus?.maskedKey ? `Current: ${phoneStatus.maskedKey}` : 'sk_...'}
                className="otto-mono"
              />
            </div>
            <div>
              <label className="otto-label block mb-1.5">API secret / token</label>
              <Input
                type="password"
                value={phoneDraft.apiSecret}
                onChange={(e) => setPhoneDraft({ ...phoneDraft, apiSecret: e.target.value })}
                placeholder="••••••••"
                className="otto-mono"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button onClick={savePhone} size="sm" className="gap-1.5">
              <Save size={13} /> Save phone credentials
            </Button>
            {phoneStatus?.configured && (
              <Button onClick={deletePhone} variant="outline" size="sm">
                Remove
              </Button>
            )}
          </div>

          {phoneStatus?.configured && (
            <div className="border-t border-hair pt-4 mt-2" style={{ borderColor: 'var(--hair)' }}>
              <label className="otto-label block mb-1.5">Send a test SMS</label>
              <div className="flex gap-2">
                <Input
                  value={testNumber}
                  onChange={(e) => setTestNumber(e.target.value)}
                  placeholder="+15551234567 (your mobile)"
                  className="otto-mono flex-1"
                />
                <Button onClick={testPhone} disabled={testingPhone} size="sm" className="gap-1.5">
                  {testingPhone ? <Loader2 size={13} className="animate-spin" /> : <Phone size={13} />}
                  Send test
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Otto will send "Otto Perso test message ✓" to the number above. Standard SMS rates apply (~$0.008).
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Email integration */}
      <section className="border border-hair bg-card" style={{ borderColor: 'var(--hair)' }}>
        <div className="px-5 py-3 border-b border-hair flex items-center justify-between" style={{ borderColor: 'var(--hair)' }}>
          <div className="flex items-center gap-2">
            <Mail size={14} />
            <h2 className="otto-eyebrow">Email (for sending)</h2>
          </div>
          {emailStatus?.configured ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-green-700">
              <Check size={11} /> Connected · {emailStatus.provider} · {emailStatus.fromEmail}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <X size={11} /> Not configured
            </span>
          )}
        </div>
        <div className="p-5 space-y-4">
          <div className="text-xs text-muted-foreground space-y-1.5">
            <p>
              Otto can send emails — digests, reports, notifications — but needs an email provider. Like phone numbers, <strong>email is not free at scale</strong>. Pricing per email:
            </p>
            <p className="flex items-center gap-2 flex-wrap">
              <a href="https://resend.com/pricing" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">Resend 3k/mo free, then $0.0001/email <ExternalLink size={10} /></a>
              <a href="https://sendgrid.com/pricing/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">SendGrid 100/day free, then ~$0.0005/email <ExternalLink size={10} /></a>
              <a href="https://www.smtp2go.com/pricing/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">SMTP2GO 1k/mo free <ExternalLink size={10} /></a>
            </p>
            <p className="text-[11px]">
              Free tiers are fine for personal use. For raw SMTP, you can use Gmail (app password), Fastmail, or any provider that gives you SMTP creds.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="otto-label block mb-1.5">Provider</label>
              <select
                value={emailDraft.provider}
                onChange={(e) => setEmailDraft({ ...emailDraft, provider: e.target.value })}
                className="w-full h-9 px-2 border border-hair bg-background text-sm otto-mono"
                style={{ borderColor: 'var(--hair)' }}
              >
                <option value="resend">Resend (recommended)</option>
                <option value="sendgrid">SendGrid</option>
                <option value="smtp">Raw SMTP (Gmail/Fastmail/etc.)</option>
              </select>
            </div>
            <div>
              <label className="otto-label block mb-1.5">From email</label>
              <Input
                value={emailDraft.fromEmail}
                onChange={(e) => setEmailDraft({ ...emailDraft, fromEmail: e.target.value })}
                placeholder="otto@yourdomain.com"
                className="otto-mono"
              />
            </div>
            <div>
              <label className="otto-label block mb-1.5">From name</label>
              <Input
                value={emailDraft.fromName}
                onChange={(e) => setEmailDraft({ ...emailDraft, fromName: e.target.value })}
                placeholder="Otto Perso"
              />
            </div>
            {emailDraft.provider !== 'smtp' ? (
              <div>
                <label className="otto-label block mb-1.5">API key {emailStatus?.configured && <span className="text-muted-foreground">(blank = keep current)</span>}</label>
                <Input
                  type="password"
                  value={emailDraft.apiKey}
                  onChange={(e) => setEmailDraft({ ...emailDraft, apiKey: e.target.value })}
                  placeholder={emailStatus?.maskedKey ? `Current: ${emailStatus.maskedKey}` : 're_... / SG.'}
                  className="otto-mono"
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="otto-label block mb-1.5">SMTP host</label>
                  <Input
                    value={emailDraft.smtpHost}
                    onChange={(e) => setEmailDraft({ ...emailDraft, smtpHost: e.target.value })}
                    placeholder="smtp.gmail.com"
                    className="otto-mono"
                  />
                </div>
                <div>
                  <label className="otto-label block mb-1.5">SMTP port</label>
                  <Input
                    type="number"
                    value={emailDraft.smtpPort}
                    onChange={(e) => setEmailDraft({ ...emailDraft, smtpPort: e.target.value })}
                    placeholder="587"
                    className="otto-mono"
                  />
                </div>
                <div>
                  <label className="otto-label block mb-1.5">SMTP user</label>
                  <Input
                    value={emailDraft.smtpUser}
                    onChange={(e) => setEmailDraft({ ...emailDraft, smtpUser: e.target.value })}
                    placeholder="you@gmail.com"
                    className="otto-mono"
                  />
                </div>
                <div>
                  <label className="otto-label block mb-1.5">SMTP password {emailStatus?.configured && <span className="text-muted-foreground">(blank = keep current)</span>}</label>
                  <Input
                    type="password"
                    value={emailDraft.smtpPass}
                    onChange={(e) => setEmailDraft({ ...emailDraft, smtpPass: e.target.value })}
                    placeholder="app password"
                    className="otto-mono"
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button onClick={saveEmail} size="sm" className="gap-1.5">
              <Save size={13} /> Save email credentials
            </Button>
            {emailStatus?.configured && (
              <Button onClick={deleteEmail} variant="outline" size="sm">
                Remove
              </Button>
            )}
          </div>

          {emailStatus?.configured && (
            <div className="border-t border-hair pt-4 mt-2" style={{ borderColor: 'var(--hair)' }}>
              <label className="otto-label block mb-1.5">Send a test email</label>
              <div className="flex gap-2">
                <Input
                  value={testEmailTo}
                  onChange={(e) => setTestEmailTo(e.target.value)}
                  placeholder="you@example.com"
                  className="otto-mono flex-1"
                />
                <Button onClick={testEmail} disabled={testingEmail} size="sm" className="gap-1.5">
                  {testingEmail ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                  Send test
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Otto will send a styled test email from {emailStatus.fromEmail}.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Emergency hotkey */}
      <section className="border border-hair bg-card" style={{ borderColor: 'var(--hair)' }}>
        <div className="px-5 py-3 border-b border-hair flex items-center gap-2" style={{ borderColor: 'var(--hair)' }}>
          <Keyboard size={14} />
          <h2 className="otto-eyebrow">Emergency stop</h2>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            Hotkey triggers instant halt from anywhere — even if Otto is mid-action.
            Also available as a fixed red button on the mobile companion app.
          </p>
          <div
            className="flex items-center gap-2 px-3 py-2 border otto-mono text-xs"
            style={{ borderColor: 'var(--hair)', background: 'var(--paper-soft)' }}
          >
            <kbd className="px-2 py-1 border border-hair bg-background">Ctrl</kbd>
            <span className="text-muted-foreground">+</span>
            <kbd className="px-2 py-1 border border-hair bg-background">Shift</kbd>
            <span className="text-muted-foreground">+</span>
            <kbd className="px-2 py-1 border border-hair bg-background">Esc</kbd>
            <span className="ml-2 text-muted-foreground">→ Engage Emergency Stop</span>
          </div>
        </div>
      </section>

      {/* iOS TestFlight invite codes — owner only */}
      <InviteCodesSection />

      {/* Architecture notes */}
      <section className="border border-hair bg-card" style={{ borderColor: 'var(--hair)' }}>
        <div className="px-5 py-3 border-b border-hair flex items-center gap-2" style={{ borderColor: 'var(--hair)' }}>
          <h2 className="otto-eyebrow">Architecture</h2>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <InfoRow label="Engine" value="qwen3-coder-32b · Ollama (local)" />
          <InfoRow label="Vault path" value="~/Otto/vault (synced)" />
          <InfoRow label="Credential store" value="~/Otto/creds.enc (AES-256)" />
          <InfoRow label="Audit log" value="~/Otto/audit.log (append-only)" />
          <InfoRow label="Mobile bridge" value="local relay when desktop on" />
          <InfoRow label="Cloud (optional)" value="not configured" />
        </div>
      </section>

      <div className="flex items-center gap-2 sticky bottom-12 bg-background py-3">
        <Button onClick={save} disabled={!draft || JSON.stringify(draft) === JSON.stringify(thresholds)} className="gap-1.5">
          <Save size={14} /> Save settings
        </Button>
        <Button
          variant="outline"
          onClick={() => draft && setThresholds(draft)}
          disabled={!draft || JSON.stringify(draft) === JSON.stringify(thresholds)}
        >
          Discard
        </Button>
      </div>
    </div>
  )
}

function ThresholdField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  help,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  prefix?: string
  suffix?: string
  help?: string
}) {
  return (
    <div>
      <label className="otto-label block mb-1.5">{label}</label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground otto-mono">
            {prefix}
          </span>
        )}
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={cn(prefix && 'pl-6', 'otto-mono')}
        />
        {suffix && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground otto-mono">
            {suffix}
          </span>
        )}
      </div>
      {help && <p className="text-[10px] text-muted-foreground mt-1 leading-snug">{help}</p>}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="otto-label shrink-0">{label}</span>
      <span className="otto-mono text-xs text-right">{value}</span>
    </div>
  )
}

// ─── Invite Codes Section ─────────────────────────────────────────────────
interface InviteCode {
  id: string
  code: string
  status: string
  maxUses: number
  useCount: number
  remainingUses: number
  usedBy: string | null
  usedAt: string | null
  note: string | null
  expiresAt: string | null
  createdAt: string
  createdBy: string
}

function InviteCodesSection() {
  const { data: session } = useSession()
  const [codes, setCodes] = useState<InviteCode[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [newMaxUses, setNewMaxUses] = useState('1')

  const isOwner = session?.user?.role === 'owner'

  async function load() {
    try {
      const res = await fetch('/api/invite/list')
      if (!res.ok) return
      const data = await res.json()
      setCodes(data.codes || [])
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (isOwner) load() }, [isOwner])

  async function generate() {
    setGenerating(true)
    try {
      const res = await fetch('/api/invite/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: newNote || undefined,
          maxUses: parseInt(newMaxUses, 10) || 1,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(`Generated: ${data.code}`)
        setNewNote('')
        setNewMaxUses('1')
        load()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to generate')
      }
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`)
    } finally {
      setGenerating(false)
    }
  }

  async function revoke(id: string) {
    if (!confirm('Revoke this invite code? It will stop working immediately.')) return
    const res = await fetch(`/api/invite/${id}/revoke`, { method: 'POST' })
    if (res.ok) {
      toast.success('Code revoked')
      load()
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code)
    toast.success(`Copied ${code}`)
  }

  if (!isOwner) return null

  return (
    <section className="border border-hair bg-card" style={{ borderColor: 'var(--hair)' }}>
      <div className="px-5 py-3 border-b border-hair flex items-center gap-2" style={{ borderColor: 'var(--hair)' }}>
        <Ticket size={14} />
        <h2 className="otto-eyebrow">iOS TestFlight invite codes</h2>
        {codes.length > 0 && (
          <span className="ml-auto text-[10px] otto-mono text-muted-foreground">
            {codes.filter(c => c.status === 'active').length} active · {codes.length} total
          </span>
        )}
      </div>
      <div className="p-5 space-y-4">
        <p className="text-xs text-muted-foreground">
          iOS is in TestFlight beta with limited slots. Generate invite codes to give people access to the iOS app — they enter the code on the website to join the TestFlight. Mac, Windows, Linux, and Android are freely downloadable — no code needed for those.
        </p>

        {/* Generate new code */}
        <div className="border border-hair p-3 space-y-3" style={{ borderColor: 'var(--hair)' }}>
          <div className="text-[11px] otto-mono uppercase tracking-wider text-muted-foreground">Generate new code</div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_auto] gap-2">
            <Input
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Note (optional) — e.g. 'for Sarah' or 'twitter giveaway'"
              className="text-sm"
            />
            <Input
              type="number"
              min="1"
              max="100"
              value={newMaxUses}
              onChange={(e) => setNewMaxUses(e.target.value)}
              placeholder="Max uses"
              className="otto-mono text-sm"
            />
            <Button onClick={generate} disabled={generating} size="sm" className="gap-1.5">
              {generating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Generate
            </Button>
          </div>
        </div>

        {/* Existing codes */}
        {loading ? (
          <div className="text-xs text-muted-foreground py-4 text-center">Loading codes…</div>
        ) : codes.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center italic">
            No invite codes yet. Generate one above to start inviting people.
          </div>
        ) : (
          <div className="space-y-1.5">
            {codes.map((c) => (
              <div key={c.id} className="border border-hair p-3 flex items-center gap-3" style={{ borderColor: 'var(--hair)' }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-sm font-semibold">{c.code}</code>
                    <button onClick={() => copyCode(c.code)} className="text-muted-foreground hover:text-foreground" title="Copy">
                      <Copy size={12} />
                    </button>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {c.useCount}/{c.maxUses} used · {c.remainingUses} remaining
                    {c.note && <> · "{c.note}"</>}
                    {c.usedBy && <> · used by {c.usedBy}</>}
                    {' · '}{new Date(c.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <span className={cn(
                  'text-[10px] otto-mono uppercase tracking-wider px-1.5 py-0.5 border',
                  c.status === 'active' ? 'border-green-600 text-green-700' :
                  c.status === 'used' ? 'border-foreground/30 text-muted-foreground' :
                  'border-red-600 text-red-700'
                )}>
                  {c.status}
                </span>
                {c.status === 'active' && (
                  <button
                    onClick={() => revoke(c.id)}
                    className="text-[10px] text-muted-foreground hover:text-red-600"
                    title="Revoke"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
