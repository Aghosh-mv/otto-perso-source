'use client'

import { useEffect, useState } from 'react'

// Schedules — always-on cloud agents. Each job runs a user-created bot on the
// SERVER on a timer, independent of any device. Create one (e.g. "Every morning,
// Inboxer: triage my inbox and save a summary to the vault"), and it keeps
// running on the backend even when your phone + laptop are off.

type Job = {
  id: string; name: string; botName: string; prompt: string
  intervalMinutes: number; nextRunAt: string; lastRunAt: string | null
  lastResult: string; enabled: boolean; createdAt: string
}
type Bot = { id: string; name: string; description?: string }

export function SchedulesView() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [bots, setBots] = useState<Bot[]>([])
  const [form, setForm] = useState({ name: '', botName: '', prompt: '', intervalMinutes: 60 })

  useEffect(() => {
    refresh()
    fetch('/api/bots').then((r) => r.json()).then((b) => Array.isArray(b) && setBots(b)).catch(() => {})
    const t = setInterval(refresh, 5000)
    return () => clearInterval(t)
  }, [])

  async function refresh() {
    try { const r = await fetch('/api/schedules', { cache: 'no-store' }); setJobs(await r.json()) } catch {}
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.botName || !form.prompt) return
    await fetch('/api/schedules', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setForm({ name: '', botName: '', prompt: '', intervalMinutes: 60 })
    refresh()
  }

  async function toggle(j: Job) {
    await fetch(`/api/schedules/${j.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !j.enabled }),
    })
    refresh()
  }

  async function del(id: string) {
    if (!confirm('Delete this scheduled job?')) return
    await fetch(`/api/schedules/${id}`, { method: 'DELETE' })
    refresh()
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, margin: '0 0 4px', fontWeight: 700 }}>Always-on agents</h1>
      <p style={{ margin: '0 0 18px', color: '#666', fontSize: 13 }}>
        Cloud-side scheduled jobs. Each runs a bot on the server on a timer — even when all your devices are off.
      </p>

      <form onSubmit={create} style={{ display: 'grid', gap: 8, padding: 16, border: '1px solid #eee', borderRadius: 14, marginBottom: 20, background: '#fafafa' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input placeholder="Job name (e.g. Morning inbox triage)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inp} />
          <select value={form.botName} onChange={(e) => setForm({ ...form, botName: e.target.value })} style={inp}>
            <option value="">Pick a bot…</option>
            {bots.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
          </select>
          <input type="number" min={1} value={form.intervalMinutes} onChange={(e) => setForm({ ...form, intervalMinutes: Number(e.target.value) })} style={{ ...inp, width: 90 }} title="Interval (minutes)" />
          <span style={{ alignSelf: 'center', color: '#999', fontSize: 12 }}>min</span>
        </div>
        <textarea placeholder="Prompt — what the bot does each run (e.g. 'Triage my inbox, reply to urgent ones, save a summary to the vault.')" value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} rows={2} style={{ ...inp, resize: 'vertical' }} />
        <button type="submit" style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: '#0a0a0a', color: '#fff', fontWeight: 600, cursor: 'pointer', justifySelf: 'start' }}>+ Schedule</button>
        {bots.length === 0 && <p style={{ color: '#dc2626', fontSize: 12, margin: 0 }}>Create a bot first in the Bots tab — scheduled jobs only run user-created bots.</p>}
      </form>

      {jobs.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', color: '#888', border: '1px dashed #ddd', borderRadius: 14 }}>No scheduled jobs yet.</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {jobs.map((j) => (
            <div key={j.id} style={{ padding: 14, border: '1px solid #eee', borderRadius: 12, background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <strong style={{ fontSize: 14 }}>{j.name}</strong>
                <span style={{ fontSize: 11, color: '#999' }}>{j.botName} · every {j.intervalMinutes}m</span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button onClick={() => toggle(j)} style={j.enabled ? btnOn : btnOff}>{j.enabled ? '● ON' : '○ off'}</button>
                  <button onClick={() => del(j.id)} style={{ ...btnOff, color: '#dc2626' }}>✕</button>
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#555', marginBottom: 6 }}>{j.prompt}</div>
              <div style={{ fontSize: 11, color: '#999' }}>
                next: {new Date(j.nextRunAt).toLocaleString()}
                {j.lastRunAt ? <> · last: {new Date(j.lastRunAt).toLocaleString()}</> : null}
              </div>
              {j.lastResult && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#333', background: '#f6f6f6', borderRadius: 8, padding: 8, maxHeight: 80, overflow: 'hidden', whiteSpace: 'pre-wrap' }}>
                  {j.lastResult}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, fontFamily: 'inherit', flex: 1, minWidth: 120 }
const btnOn: React.CSSProperties = { padding: '4px 10px', borderRadius: 999, border: 'none', background: '#16a34a', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }
const btnOff: React.CSSProperties = { padding: '4px 10px', borderRadius: 999, border: '1px solid #ddd', background: '#fff', color: '#666', fontSize: 11, cursor: 'pointer' }
