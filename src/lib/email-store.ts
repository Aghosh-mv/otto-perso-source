// Email credential store + send function — mirrors phone-store.
// Supports Resend, SendGrid, and raw SMTP (via nodemailer).
// Credentials are obfuscated (XOR + base64) in SystemState.

const SECRET = process.env.NEXTAUTH_SECRET || 'otto-perso-local-dev'

export function obfuscate(plain: string): string {
  const buf = Buffer.from(plain, 'utf-8')
  const key = Buffer.from(SECRET, 'utf-8')
  for (let i = 0; i < buf.length; i++) buf[i] = buf[i] ^ key[i % key.length]
  return buf.toString('base64')
}

export function deobfuscate(stored: string): string {
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

export function maskKey(plain: string): string {
  if (!plain) return ''
  if (plain.length <= 8) return '••••'
  return plain.slice(0, 4) + '••••' + plain.slice(-4)
}

import { db } from '@/lib/db'

export interface EmailCreds {
  provider: 'resend' | 'sendgrid' | 'smtp'
  apiKey: string    // for resend/sendgrid
  smtpHost: string  // for smtp
  smtpPort: number  // for smtp
  smtpUser: string  // for smtp
  smtpPass: string  // for smtp
  fromEmail: string
  fromName: string
}

export async function loadEmailCreds(): Promise<EmailCreds | null> {
  const rows = await db.systemState.findMany({
    where: { key: { startsWith: 'email.' } },
  })
  const map: Record<string, string> = {}
  for (const r of rows) map[r.key] = r.value

  if (!map['email.provider']) return null

  return {
    provider: (map['email.provider'] as EmailCreds['provider']) || 'resend',
    apiKey: deobfuscate(map['email.apiKey'] || ''),
    smtpHost: map['email.smtpHost'] || '',
    smtpPort: parseInt(map['email.smtpPort'] || '587', 10),
    smtpUser: map['email.smtpUser'] || '',
    smtpPass: deobfuscate(map['email.smtpPass'] || ''),
    fromEmail: map['email.fromEmail'] || '',
    fromName: map['email.fromName'] || 'Otto Perso',
  }
}

export interface EmailResult {
  ok: boolean
  messageId?: string
  error?: string
  cost?: number
}

export async function sendEmail(opts: {
  to: string
  subject: string
  body: string
  isHtml?: boolean
}): Promise<EmailResult> {
  const creds = await loadEmailCreds()
  if (!creds) {
    return { ok: false, error: 'Email not configured. Add credentials in Settings.' }
  }

  const { to, subject, body } = opts
  if (!to || !subject || !body) return { ok: false, error: 'to, subject, body required' }

  try {
    switch (creds.provider) {
      case 'resend': {
        // Resend API: https://resend.com/docs/api-reference/emails/send-email
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${creds.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `${creds.fromName} <${creds.fromEmail}>`,
            to: [to],
            subject,
            [opts.isHtml ? 'html' : 'text']: body,
          }),
        })
        const data = await res.json()
        if (!res.ok) return { ok: false, error: data.message || data.error || `HTTP ${res.status}` }
        return { ok: true, messageId: data.id, cost: 0.0001 } // Resend ~$0.0001/email after free tier
      }
      case 'sendgrid': {
        // SendGrid v3 API: https://docs.sendgrid.com/api-reference/mail-send/mail-send
        const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${creds.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: to }] }],
            from: { email: creds.fromEmail, name: creds.fromName },
            subject,
            content: [{
              type: opts.isHtml ? 'text/html' : 'text/plain',
              value: body,
            }],
          }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          return { ok: false, error: err.errors?.[0]?.message || `HTTP ${res.status}` }
        }
        return { ok: true, messageId: res.headers.get('x-message-id') || 'sent', cost: 0.0005 }
      }
      case 'smtp': {
        // SMTP via nodemailer — dynamically import so we don't pay the cost unless needed
        try {
          const nodemailer = await import('nodemailer')
          const transporter = nodemailer.createTransport({
            host: creds.smtpHost,
            port: creds.smtpPort,
            secure: creds.smtpPort === 465,
            auth: { user: creds.smtpUser, pass: creds.smtpPass },
          })
          const info = await transporter.sendMail({
            from: `"${creds.fromName}" <${creds.fromEmail}>`,
            to,
            subject,
            [opts.isHtml ? 'html' : 'text']: body,
          })
          return { ok: true, messageId: info.messageId, cost: 0 } // SMTP cost is the user's email plan
        } catch (e) {
          return { ok: false, error: `SMTP error: ${(e as Error).message}` }
        }
      }
      default:
        return { ok: false, error: `Unknown email provider: ${creds.provider}` }
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
