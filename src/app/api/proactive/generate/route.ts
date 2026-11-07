// POST /api/proactive/generate — Otto observes its state and generates
// proactive prompts based on what it sees (vault patterns, stale tasks,
// time of day, recent activity). Returns new prompts.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'

function istNow(): Date {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000)
}

function istHour(): number {
  return istNow().getUTCHours()
}

// Heuristics — Otto looks at its own state and notices things.
async function generateProactivePrompts(): Promise<{ content: string; suggestedAction: string; trigger: string; confidence: number }[]> {
  const prompts: { content: string; suggestedAction: string; trigger: string; confidence: number }[] = []
  const hour = istHour()

  const [tasks, vaultNotes, recentActivity, lastProactive] = await Promise.all([
    db.task.findMany({
      where: { status: { in: ['queued', 'planning', 'blocked', 'waiting_approval'] } },
      orderBy: { createdAt: 'asc' },
      take: 20,
    }),
    db.vaultNote.findMany({ orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }], take: 20 }),
    db.activityLog.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
    db.proactivePrompt.findMany({
      where: { createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
  ])

  // Avoid duplicates: skip if we already raised something similar in the last 24h
  const recentContents = new Set(lastProactive.map((p) => p.content.toLowerCase()))

  // 1. Stale queued tasks — task has been queued >6 hours with no movement
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000)
  const staleTasks = tasks.filter((t) => t.createdAt < sixHoursAgo && t.status === 'queued')
  if (staleTasks.length > 0) {
    const t = staleTasks[0]
    const content = `You have ${staleTasks.length} task${staleTasks.length === 1 ? '' : 's'} that have been queued for over 6 hours. Top: "${t.title}". Want me to start on it, or push it back?`
    if (!recentContents.has(content.toLowerCase())) {
      prompts.push({
        content,
        suggestedAction: `Start task: ${t.title}`,
        trigger: 'stale_task',
        confidence: 0.8,
      })
    }
  }

  // 2. Time-of-day routines — morning brief, evening review
  if (hour >= 7 && hour < 10) {
    const content = `Good morning. Want a brief? I can summarize yesterday's activity, list today's pending tasks, and surface anything new in the vault.`
    if (!recentContents.has(content.toLowerCase())) {
      prompts.push({
        content,
        suggestedAction: 'Generate morning brief',
        trigger: 'morning_routine',
        confidence: 0.7,
      })
    }
  } else if (hour >= 17 && hour < 20) {
    const content = `End of day. Want me to write a recap of what got done, defer anything still open, and update the vault?`
    if (!recentContents.has(content.toLowerCase())) {
      prompts.push({
        content,
        suggestedAction: 'Generate evening recap',
        trigger: 'evening_routine',
        confidence: 0.7,
      })
    }
  }

  // 3. Vault notes that haven't been touched in 30+ days — flag for review
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const staleNotes = vaultNotes.filter((n) => new Date(n.updatedAt) < thirtyDaysAgo && !n.pinned)
  if (staleNotes.length >= 3) {
    const content = `${staleNotes.length} vault notes haven't been touched in 30+ days. Want me to review them and either archive or refresh?`
    if (!recentContents.has(content.toLowerCase())) {
      prompts.push({
        content,
        suggestedAction: 'Audit stale vault notes',
        trigger: 'vault_staleness',
        confidence: 0.6,
      })
    }
  }

  // 4. Pattern from vault: Q3 reports start around the 15th
  const today = istNow()
  if (today.getUTCDate() >= 13 && today.getUTCDate() <= 15) {
    const hasQ3Pattern = vaultNotes.some((n) => n.title.toLowerCase().includes('q3') || n.tags.toLowerCase().includes('reporting'))
    if (hasQ3Pattern) {
      const content = `It's around the 15th — your pattern shows Q3 report prep starts now. Want me to pull competitor financials and prior-year comparisons?`
      if (!recentContents.has(content.toLowerCase())) {
        prompts.push({
          content,
          suggestedAction: 'Start Q3 report prep',
          trigger: 'vault_pattern',
          confidence: 0.75,
        })
      }
    }
  }

  // 5. Recent activity slowdown — no actions in 2+ hours during working time
  if (hour >= 9 && hour < 18) {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    const recentActions = recentActivity.filter((a) => new Date(a.createdAt) > twoHoursAgo)
    if (recentActions.length === 0 && tasks.length > 0) {
      const content = `It's been quiet for 2 hours during work time. I have ${tasks.length} open task${tasks.length === 1 ? '' : 's'} — want me to make progress on the highest priority one?`
      if (!recentContents.has(content.toLowerCase())) {
        prompts.push({
          content,
          suggestedAction: 'Work on highest priority task',
          trigger: 'inactivity',
          confidence: 0.5,
        })
      }
    }
  }

  // 6. Failed tasks — surface for retry
  const failedTasks = await db.task.findMany({
    where: { status: 'failed' },
    orderBy: { updatedAt: 'desc' },
    take: 3,
  })
  if (failedTasks.length > 0) {
    const t = failedTasks[0]
    const content = `Task "${t.title}" failed earlier. Want me to retry it, or mark it as cancelled?`
    if (!recentContents.has(content.toLowerCase())) {
      prompts.push({
        content,
        suggestedAction: `Retry: ${t.title}`,
        trigger: 'failed_task',
        confidence: 0.65,
      })
    }
  }

  return prompts
}

export async function POST() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const newPrompts = await generateProactivePrompts()
  const created: Array<{ id: string; content: string; suggestedAction: string | null; trigger: string | null; confidence: number; status: string }> = []
  for (const p of newPrompts) {
    const row = await db.proactivePrompt.create({
      data: {
        content: p.content,
        suggestedAction: p.suggestedAction,
        trigger: p.trigger,
        confidence: p.confidence,
        status: 'pending',
      },
    })
    created.push({
      id: row.id,
      content: row.content,
      suggestedAction: row.suggestedAction,
      trigger: row.trigger,
      confidence: row.confidence,
      status: row.status,
    })
  }

  return NextResponse.json({ generated: created.length, prompts: created })
}

// Also allow GET to just generate without saving
export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const prompts = await generateProactivePrompts()
  return NextResponse.json({ prompts })
}
