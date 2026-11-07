import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { syncAllNotes, getVaultStats, VAULT_DIR } from '@/lib/vault-sync'
import path from 'path'

// POST /api/vault/sync — bulk sync all DB notes to disk
export async function POST() {
  const notes = await db.vaultNote.findMany()
  const result = syncAllNotes(
    notes.map((n) => ({
      ...n,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    }))
  )

  // Update filePaths in DB
  for (let i = 0; i < notes.length; i++) {
    const fp = result.paths[i]
    if (fp) {
      const rel = path.relative(VAULT_DIR, fp)
      if (notes[i].filePath !== rel) {
        await db.vaultNote.update({
          where: { id: notes[i].id },
          data: { filePath: rel },
        })
      }
    }
  }

  const stats = getVaultStats()

  await db.activityLog.create({
    data: {
      agentName: 'Owner',
      action: 'vault.sync',
      target: VAULT_DIR,
      summary: `Synced ${result.written} notes to disk (${result.failed} failed)`,
      riskTier: 'low',
      undoable: false,
      autonomyLevel: 2,
    },
  })

  return NextResponse.json({
    ok: true,
    written: result.written,
    failed: result.failed,
    vaultDir: VAULT_DIR,
    stats,
  })
}

// GET /api/vault/sync — disk stats only
export async function GET() {
  const stats = getVaultStats()
  return NextResponse.json({
    vaultDir: VAULT_DIR,
    ...stats,
  })
}
