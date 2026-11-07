// Phone credential store helpers — simple obfuscation (NOT real encryption).
// For a real install, swap obfuscate/deobfuscate for AES-256-GCM with a key
// from env. This keeps secrets out of plaintext in the DB and out of API
// responses, which is enough for the local single-user install.

const SECRET = process.env.NEXTAUTH_SECRET || 'otto-perso-local-dev'

export function obfuscate(plain: string): string {
  // XOR each char with the secret (repeating) and base64-encode
  const buf = Buffer.from(plain, 'utf-8')
  const key = Buffer.from(SECRET, 'utf-8')
  for (let i = 0; i < buf.length; i++) {
    buf[i] = buf[i] ^ key[i % key.length]
  }
  return buf.toString('base64')
}

export function deobfuscate(stored: string): string {
  if (!stored) return ''
  try {
    const buf = Buffer.from(stored, 'base64')
    const key = Buffer.from(SECRET, 'utf-8')
    for (let i = 0; i < buf.length; i++) {
      buf[i] = buf[i] ^ key[i % key.length]
    }
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

// Load all phone creds from DB (server-side only)
import { db } from '@/lib/db'

export interface PhoneCreds {
  provider: string
  apiKey: string
  apiSecret: string
  fromNumber: string
}

export async function loadPhoneCreds(): Promise<PhoneCreds | null> {
  const rows = await db.systemState.findMany({
    where: { key: { startsWith: 'phone.' } },
  })
  const map: Record<string, string> = {}
  for (const r of rows) map[r.key] = r.value

  if (!map['phone.apiKey']) return null

  return {
    provider: map['phone.provider'] || 'telnyx',
    apiKey: deobfuscate(map['phone.apiKey'] || ''),
    apiSecret: deobfuscate(map['phone.apiSecret'] || ''),
    fromNumber: map['phone.fromNumber'] || '',
  }
}

// Send an SMS via the configured provider. Returns provider's response.
export async function sendSms(opts: { to: string; body: string }): Promise<{ ok: boolean; messageId?: string; error?: string; cost?: number }> {
  const creds = await loadPhoneCreds()
  if (!creds) {
    return { ok: false, error: 'Phone not configured. Add credentials in Settings.' }
  }

  const { to, body } = opts
  if (!to || !body) return { ok: false, error: 'to and body required' }

  try {
    switch (creds.provider) {
      case 'telnyx': {
        // Telnyx Messaging API: https://developers.telnyx.com/docs/api/v2/messaging
        const res = await fetch('https://api.telnyx.com/v2/messages', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${creds.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: creds.fromNumber,
            to,
            text: body,
          }),
        })
        const data = await res.json()
        if (!res.ok) return { ok: false, error: data.errors?.[0]?.detail || data.error || `HTTP ${res.status}` }
        return { ok: true, messageId: data.data?.id, cost: 0.004 }
      }
      case 'twilio': {
        // Twilio API: https://www.twilio.com/docs/sms/api/message-resource
        const auth = Buffer.from(`${creds.apiKey}:${creds.apiSecret}`).toString('base64')
        const url = `https://api.twilio.com/2010-04-01/Accounts/${creds.apiKey}/Messages.json`
        const form = new URLSearchParams()
        form.append('From', creds.fromNumber)
        form.append('To', to)
        form.append('Body', body)
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
        })
        const data = await res.json()
        if (!res.ok) return { ok: false, error: data.message || data.error || `HTTP ${res.status}` }
        return { ok: true, messageId: data.sid, cost: 0.008 }
      }
      case 'vonage': {
        // Vonage (Nexmo) SMS API: https://developer.vonage.com/api/sms
        const res = await fetch('https://rest.nexmo.com/sms/json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: creds.apiKey,
            api_secret: creds.apiSecret,
            from: creds.fromNumber,
            to: to.replace('+', ''),
            text: body,
          }),
        })
        const data = await res.json()
        if (data.messages?.[0]?.status !== '0') {
          return { ok: false, error: data.messages?.[0]?.['error-text'] || 'Vonage error' }
        }
        return { ok: true, messageId: data.messages?.[0]?.['message-id'], cost: 0.005 }
      }
      case 'plivo': {
        // Plivo SMS API: https://www.plivo.com/docs/sms/api/message/
        const auth = Buffer.from(`${creds.apiKey}:${creds.apiSecret}`).toString('base64')
        const res = await fetch('https://api.plivo.com/v1/Account/' + creds.apiKey + '/Message/', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            src: creds.fromNumber,
            dst: to,
            text: body,
          }),
        })
        const data = await res.json()
        if (!res.ok) return { ok: false, error: data.error || `HTTP ${res.status}` }
        return { ok: true, messageId: data.message_uuid?.[0], cost: 0.004 }
      }
      default:
        return { ok: false, error: `Unknown provider: ${creds.provider}` }
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
