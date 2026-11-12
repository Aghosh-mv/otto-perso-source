'use client'

// Cross-device Lok presence. Each running Otto instance (desktop / phone / web)
// registers a device, heartbeats every 30s, and claims "active" on focus or on
// hearing "hey Otto". The active device is where Lok lives — when you move from
// monitor to phone, the phone claims active and the desktop Lok stands down.
//
// NOTE: true cross-device sync assumes the devices share a backend (same Otto
// server / account). Otto is local-first, so for now this enables LAN-synced or
// hosted-backend deployments; the API + client are in place either way.

const DEVICE_KEY = 'otto.deviceId'

export function getDeviceId(): string {
  if (typeof window === 'undefined') return ''
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(DEVICE_KEY, id) }
    return id
  } catch {
    return ''
  }
}

export function detectPlatform(): { kind: string; platform: string; name: string } {
  if (typeof navigator === 'undefined') return { kind: 'desktop', platform: '', name: 'Otto device' }
  const ua = navigator.userAgent
  const isMobile = /Android|iPhone|iPad|iPod/i.test(ua)
  const kind = isMobile ? 'phone' : 'desktop'
  let platform = 'web'
  if (/Win/.test(ua)) platform = 'win'
  else if (/Mac/.test(ua)) platform = 'mac'
  else if (/Linux/.test(ua)) platform = 'linux'
  else if (/Android/.test(ua)) platform = 'android'
  else if (/iPhone|iPad|iPod/.test(ua)) platform = 'ios'
  return { kind, platform, name: `${kind === 'phone' ? 'Phone' : 'Device'} · ${platform}` }
}

export async function registerDevice(): Promise<string> {
  const id = getDeviceId()
  if (!id) return ''
  const { kind, platform, name } = detectPlatform()
  try {
    await fetch('/api/devices', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, kind, platform, name }),
    })
  } catch {}
  return id
}

export async function heartbeat(deviceId: string) {
  if (!deviceId) return
  try {
    await fetch(`/api/devices/${deviceId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ heartbeat: true }),
    })
  } catch {}
}

export async function claimActive(deviceId: string) {
  if (!deviceId) return
  try {
    await fetch(`/api/devices/${deviceId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setActive: true }),
    })
  } catch {}
}

export async function getActiveDevice(): Promise<{ id: string; isMine: boolean } | null> {
  const myId = getDeviceId()
  try {
    const r = await fetch('/api/devices')
    const devices: any[] = await r.json()
    const online = devices.filter((d) => d.online)
    const active = online.find((d) => d.isActive)
    if (active) return { id: active.id, isMine: active.id === myId }
    // No explicitly-active online device — if I'm online, I'm effectively it.
    const me = online.find((d) => d.id === myId)
    return me ? { id: myId, isMine: true } : null
  } catch {
    return null
  }
}

// Start presence for this device: register, claim active on launch + on focus,
// heartbeat every 30s. Returns a handle to stop.
export function startPresence(): { stop: () => void; deviceId: string } {
  if (typeof window === 'undefined') return { stop: () => {}, deviceId: '' }
  let deviceId = ''
  let timer: ReturnType<typeof setInterval> | null = null
  const onFocus = () => { if (deviceId) claimActive(deviceId) }
  const onVis = () => { if (document.visibilityState === 'visible' && deviceId) claimActive(deviceId) }

  registerDevice().then((id) => {
    deviceId = id
    claimActive(id)
    timer = setInterval(() => heartbeat(id), 30_000)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVis)
  })

  return {
    stop: () => {
      if (timer) clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVis)
    },
    deviceId: getDeviceId(),
  }
}
