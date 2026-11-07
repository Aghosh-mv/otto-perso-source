// Otto Perso — vault disk sync
// Mirrors DB vault notes to real .md files on disk so they're openable in Obsidian.
// Format: YAML frontmatter + Markdown body, Obsidian-compatible.

import fs from 'fs'
import path from 'path'

export const VAULT_DIR = process.env.OTTO_VAULT_DIR || '/home/z/otto-vault'

const CATEGORY_DIRS: Record<string, string> = {
  preference: 'preferences',
  decision: 'decisions',
  pattern: 'patterns',
  memory: 'memories',
  recipe: 'recipes',
  log: 'logs',
  general: 'general',
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true })
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || `note-${Date.now()}`
}

function toYAML(obj: Record<string, unknown>): string {
  const lines: string[] = ['---']
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue
    if (Array.isArray(v)) {
      lines.push(`${k}:`)
      for (const item of v) lines.push(`  - ${String(item)}`)
    } else if (typeof v === 'object') {
      lines.push(`${k}: ${JSON.stringify(v)}`)
    } else if (typeof v === 'string') {
      // Quote if contains special chars
      if (/[:#\[\]{}&*!|>'"%@`,]/.test(v) || v.includes('\n')) {
        lines.push(`${k}: ${JSON.stringify(v)}`)
      } else {
        lines.push(`${k}: ${v}`)
      }
    } else {
      lines.push(`${k}: ${String(v)}`)
    }
  }
  lines.push('---')
  return lines.join('\n')
}

export interface DiskSyncResult {
  filePath: string
  ok: boolean
  error?: string
}

export function writeNoteToDisk(note: {
  id: string
  title: string
  category: string
  tags: string
  body: string
  frontmatter: string
  pinned: boolean
  createdAt: Date | string
  updatedAt: Date | string
}): DiskSyncResult {
  try {
    const subdir = CATEGORY_DIRS[note.category] ?? 'general'
    const dir = path.join(VAULT_DIR, subdir)
    ensureDir(dir)

    const slug = slugify(note.title)
    const filename = `${slug}.md`
    const filePath = path.join(dir, filename)

    // Parse frontmatter JSON → merge with our standard fields
    let fm: Record<string, unknown> = {}
    try {
      fm = JSON.parse(note.frontmatter || '{}')
    } catch {
      fm = {}
    }

    const tags = note.tags
      ? note.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : []

    const yaml = toYAML({
      id: note.id,
      title: note.title,
      category: note.category,
      tags,
      pinned: note.pinned,
      type: (fm.type as string) ?? note.category,
      created: new Date(note.createdAt).toISOString(),
      updated: new Date(note.updatedAt).toISOString(),
      source: 'otto-perso',
      ...fm,
    })

    const md = `# ${note.title}\n\n${note.body || '_(empty note)_'}\n`
    const content = `${yaml}\n\n${md}`

    fs.writeFileSync(filePath, content, 'utf-8')
    return { filePath, ok: true }
  } catch (e) {
    return { filePath: '', ok: false, error: (e as Error).message }
  }
}

export function deleteNoteFromDisk(filePath: string | null): void {
  if (!filePath) return
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  } catch {
    // ignore — best-effort
  }
}

export function syncAllNotes(notes: Array<Parameters<typeof writeNoteToDisk>[0] & { filePath?: string | null }>): {
  written: number
  failed: number
  paths: string[]
} {
  // Ensure vault root + subdirs exist
  ensureDir(VAULT_DIR)
  for (const dir of Object.values(CATEGORY_DIRS)) {
    ensureDir(path.join(VAULT_DIR, dir))
  }

  // Ensure .obsidian folder exists so Obsidian recognizes the vault
  ensureDir(path.join(VAULT_DIR, '.obsidian'))

  let written = 0
  let failed = 0
  const paths: string[] = []
  for (const n of notes) {
    const r = writeNoteToDisk(n)
    if (r.ok) {
      written++
      paths.push(r.filePath)
    } else {
      failed++
    }
  }
  return { written, failed, paths }
}

export function getVaultStats(): { totalFiles: number; totalBytes: number; lastModified: Date | null } {
  try {
    if (!fs.existsSync(VAULT_DIR)) {
      return { totalFiles: 0, totalBytes: 0, lastModified: null }
    }
    let totalFiles = 0
    let totalBytes = 0
    let lastModified: Date | null = null
    function walk(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const e of entries) {
        if (e.name.startsWith('.obsidian')) continue
        const full = path.join(dir, e.name)
        if (e.isDirectory()) {
          walk(full)
        } else if (e.name.endsWith('.md')) {
          totalFiles++
          const stat = fs.statSync(full)
          totalBytes += stat.size
          const m = stat.mtime
          if (!lastModified || m > lastModified) lastModified = m
        }
      }
    }
    walk(VAULT_DIR)
    return { totalFiles, totalBytes, lastModified }
  } catch {
    return { totalFiles: 0, totalBytes: 0, lastModified: null }
  }
}

// ─── Disk → DB sync (used by tools and watcher to pull external edits) ─────
const DIR_TO_CATEGORY: Record<string, string> = {
  preferences: 'preference',
  decisions: 'decision',
  patterns: 'pattern',
  memories: 'memory',
  recipes: 'recipe',
  logs: 'log',
  general: 'general',
}

interface ParsedNote {
  frontmatter: Record<string, unknown>
  body: string
}

function parseMarkdown(content: string): ParsedNote | null {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!fmMatch) return null
  const [, fmRaw, body] = fmMatch
  const fm: Record<string, unknown> = {}
  let currentArrayKey: string | null = null
  let currentArray: string[] = []
  for (const line of fmRaw.split('\n')) {
    const arrayItemMatch = line.match(/^\s+-\s+(.+)$/)
    if (arrayItemMatch && currentArrayKey) {
      currentArray.push(arrayItemMatch[1].trim().replace(/^"|"$/g, ''))
      continue
    }
    if (currentArrayKey && !arrayItemMatch) {
      fm[currentArrayKey] = currentArray
      currentArrayKey = null
      currentArray = []
    }
    const kvMatch = line.match(/^([\w_]+):\s*(.*)$/)
    if (kvMatch) {
      const [, k, v] = kvMatch
      if (v === '') {
        currentArrayKey = k
        currentArray = []
      } else {
        let val: string | number | boolean = v.replace(/^"|"$/g, '')
        if (val === 'true') val = true
        else if (val === 'false') val = false
        else if (/^-?\d+$/.test(val)) val = Number(val)
        fm[k] = val
      }
    }
  }
  if (currentArrayKey) fm[currentArrayKey] = currentArray
  const cleanBody = body.replace(/^#\s+.*\n+/, '').trim()
  return { frontmatter: fm, body: cleanBody }
}

import { db } from '@/lib/db'

/**
 * Sync all .md files in the vault directory into the DB.
 * Walks every category dir, parses frontmatter, upserts VaultNote rows.
 * Returns counts.
 */
export async function syncVaultFromDisk(): Promise<{ scanned: number; updated: number; created: number; failed: number }> {
  if (!fs.existsSync(VAULT_DIR)) {
    return { scanned: 0, updated: 0, created: 0, failed: 0 }
  }
  let scanned = 0, updated = 0, created = 0, failed = 0

  async function syncFile(filePath: string) {
    scanned++
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const parsed = parseMarkdown(content)
      if (!parsed) return
      const fm = parsed.frontmatter
      const id = fm.id as string | undefined
      const title = (fm.title as string) || path.basename(filePath, '.md')
      const rel = path.relative(VAULT_DIR, filePath)
      const dirName = rel.split(path.sep)[0]
      const category = DIR_TO_CATEGORY[dirName] || 'general'
      let tags = ''
      if (Array.isArray(fm.tags)) tags = (fm.tags as string[]).join(',')
      else if (typeof fm.tags === 'string') tags = fm.tags
      const pinned = fm.pinned === true || fm.pinned === 'true'
      const { id: _id, title: _title, category: _cat, tags: _tags, pinned: _pinned, created: _created, updated: _updated, source: _source, ...rest } = fm
      const fmJson = JSON.stringify(rest)

      if (id) {
        await db.vaultNote.upsert({
          where: { id },
          update: { title, category, tags, pinned, body: parsed.body, frontmatter: fmJson, filePath: rel, updatedAt: new Date() },
          create: { id, title, category, tags, pinned, body: parsed.body, frontmatter: fmJson, filePath: rel },
        })
        updated++
      } else {
        const existing = await db.vaultNote.findFirst({ where: { filePath: rel } })
        if (existing) {
          await db.vaultNote.update({ where: { id: existing.id }, data: { title, category, tags, pinned, body: parsed.body, frontmatter: fmJson, updatedAt: new Date() } })
          updated++
        } else {
          await db.vaultNote.create({ data: { title, category, tags, pinned, body: parsed.body, frontmatter: fmJson, filePath: rel } })
          created++
        }
      }
    } catch (e) {
      failed++
      console.warn(`[vault-sync] failed to sync ${filePath}:`, (e as Error).message)
    }
  }

  async function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        await walk(full)
      } else if (e.name.endsWith('.md')) {
        await syncFile(full)
      }
    }
  }

  await walk(VAULT_DIR)
  return { scanned, updated, created, failed }
}
