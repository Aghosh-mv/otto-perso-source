import { db } from '@/lib/db'

// Always-on cloud scheduler. The Otto backend ticks every minute and runs any
// due ScheduledJob — spawning the named user-created bot with the job's prompt
// and letting it work on the SERVER. This runs independent of any user device:
// once Otto is deployed on an always-on host (e.g. Tharavad), agents keep doing
// their scheduled work even when every phone/laptop is off. Results land in the
// activity log + the job's lastResult, so the user sees them when they return.

let started = false

async function runJob(job: { id: string; botName: string; prompt: string; name: string }) {
  try {
    const bot = await db.customBot.findFirst({ where: { name: job.botName, isActive: true } })
    const agent = await db.agent.create({
      data: {
        name: bot?.name || job.botName,
        kind: 'worker',
        task: job.prompt,
        modelName: bot?.modelName || 'gemini-3.5-flash-lite',
      },
    })
    await db.scheduledJob.update({ where: { id: job.id }, data: { lastRunAt: new Date(), lastResult: 'running…' } })
    const { runAgent } = await import('@/lib/agent-runtime')
    const run = await runAgent(agent.id)
    const result = (run.result || 'done').slice(0, 500)
    await db.scheduledJob.update({ where: { id: job.id }, data: { lastResult: result } })
    await db.activityLog.create({
      data: {
        agentName: bot?.name || job.botName,
        action: 'schedule.run',
        target: job.id,
        summary: `Scheduled job "${job.name}" ran: ${result.slice(0, 90)}${result.length > 90 ? '…' : ''}`,
        riskTier: 'low',
        undoable: false,
      },
    })
  } catch (e: any) {
    await db.scheduledJob.update({
      where: { id: job.id },
      data: { lastResult: `error: ${e?.message || 'failed'}` },
    })
  }
}

async function tick() {
  try {
    const due = await db.scheduledJob.findMany({
      where: { enabled: true, nextRunAt: { lte: new Date() } },
      take: 10,
    })
    for (const job of due) {
      // re-schedule first so a slow run doesn't double-fire
      const next = new Date(Date.now() + Math.max(1, job.intervalMinutes) * 60_000)
      await db.scheduledJob.update({ where: { id: job.id }, data: { nextRunAt: next } })
      runJob(job).catch(() => {}) // fire and forget — don't block the tick
    }
  } catch {
    // tick never throws the server
  }
}

export function startScheduler() {
  if (started) return
  started = true
  tick()
  setInterval(tick, 60_000) // every minute
}

export async function runSchedulerOnce() {
  await tick()
}
