'use client'

import { useEffect, useState, useRef } from 'react'

// Otto Drive — your personal mini-cloud files. Upload from any device, stored on
// the backend, downloadable from any device on the account. Otto can also save
// drafts/artifacts here via the drive_save tool.

type File = { id: string; name: string; mime: string; size: number; uploadedBy: string; createdAt: string }

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function DriveView() {
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [device, setDevice] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    refresh()
    try { setDevice(localStorage.getItem('otto.deviceId') || '') } catch {}
  }, [])

  async function refresh() {
    try { const r = await fetch('/api/drive', { cache: 'no-store' }); setFiles(await r.json()) } catch {}
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files
    if (!list || !list.length) return
    setBusy(true)
    try {
      for (const f of Array.from(list)) {
        const form = new FormData()
        form.append('file', f)
        form.append('device', device)
        await fetch('/api/drive', { method: 'POST', body: form })
      }
      await refresh()
    } finally { setBusy(false); if (inputRef.current) inputRef.current.value = '' }
  }

  async function del(id: string) {
    if (!confirm('Delete this file?')) return
    await fetch(`/api/drive/${id}`, { method: 'DELETE' })
    refresh()
  }

  const total = files.reduce((s, f) => s + f.size, 0)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0, fontWeight: 700 }}>Otto Drive</h1>
          <p style={{ margin: '4px 0 0', color: '#666', fontSize: 13 }}>Your mini-cloud — files on your backend, from any device on the account.</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: '#666', fontSize: 12 }}>{files.length} file{files.length === 1 ? '' : 's'} · {fmtSize(total)}</span>
          <button onClick={() => inputRef.current?.click()} disabled={busy} style={btnPrimary}>{busy ? 'Uploading…' : '↑ Upload'}</button>
          <input ref={inputRef} type="file" multiple style={{ display: 'none' }} onChange={onPick} />
          <button onClick={refresh} style={btnGhost}>↻</button>
        </div>
      </div>

      {files.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#888', border: '1px dashed #ddd', borderRadius: 14, fontSize: 14 }}>
          No files yet. Upload something — it lives on your backend and shows up on every device you sign into.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {files.map((f) => {
            const isImg = f.mime.startsWith('image/')
            return (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, border: '1px solid #eee', borderRadius: 12, background: '#fff' }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  {isImg ? '🖼️' : f.mime.startsWith('audio') ? '🎵' : f.mime.includes('pdf') ? '📕' : f.mime.includes('zip') ? '🗜️' : '📄'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>{fmtSize(f.size)} · {new Date(f.createdAt).toLocaleString()}{f.uploadedBy ? ` · via ${f.uploadedBy.slice(0, 8)}` : ''}</div>
                </div>
                <a href={`/api/drive/${f.id}`} download style={{ ...btnGhost, textDecoration: 'none' }}>↓</a>
                <button onClick={() => del(f.id)} style={{ ...btnGhost, color: '#dc2626' }}>✕</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const btnPrimary: React.CSSProperties = { padding: '8px 16px', borderRadius: 10, border: 'none', background: '#0a0a0a', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const btnGhost: React.CSSProperties = { padding: '8px 12px', borderRadius: 10, border: '1px solid #ddd', background: '#fff', color: '#333', fontSize: 13, cursor: 'pointer' }
