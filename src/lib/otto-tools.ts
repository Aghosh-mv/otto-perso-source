// Otto's tool catalog — real implementations, no placeholders.
// Each tool: { name, description, parameters (JSON Schema), execute }
// The chat loop calls these when Gemini emits a functionCall.

import { db } from '@/lib/db'
import { syncVaultFromDisk } from '@/lib/vault-sync'
import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { loadBrainConfig } from '@/lib/brain-config'
import vm from 'vm'

const VAULT_ROOT = process.env.OTTO_VAULT_ROOT || '/home/z/otto-vault'

// ─── Tool types ────────────────────────────────────────────────────────────
export interface ToolDef {
  name: string
  description: string
  parameters: Record<string, unknown> // JSON Schema
}

export interface ToolCall {
  name: string
  args: Record<string, unknown>
}

export interface ToolResult {
  name: string
  ok: boolean
  summary: string        // human-readable, shown in the Thoughts panel
  data: unknown          // structured payload, returned to the model
  activity?: {           // optional activity log entry
    action: string
    target?: string
    summary: string
    riskTier: 'low' | 'medium' | 'high' | 'critical'
    undoable?: boolean
  }
}

// ─── Tool implementations ──────────────────────────────────────────────────

async function toolVaultRead(args: { category?: string; query?: string }) {
  const where: Record<string, unknown> = {}
  if (args.category && args.category !== 'all') where.category = args.category
  const notes = await db.vaultNote.findMany({
    where,
    orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
    take: args.query ? 30 : 15,
  })

  let filtered = notes
  if (args.query) {
    const q = args.query.toLowerCase()
    filtered = notes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q) ||
        n.tags.toLowerCase().includes(q),
    )
  }

  return {
    name: 'vault_read',
    ok: true,
    summary: `Read ${filtered.length} vault note${filtered.length === 1 ? '' : 's'}${args.category ? ` from "${args.category}"` : ''}${args.query ? ` matching "${args.query}"` : ''}.`,
    data: filtered.map((n) => ({
      id: n.id,
      title: n.title,
      category: n.category,
      tags: n.tags,
      body: n.body.slice(0, 800),
      pinned: n.pinned,
      updatedAt: n.updatedAt.toISOString(),
    })),
    activity: {
      action: 'vault.read',
      target: args.category || 'all',
      summary: `Otto read ${filtered.length} vault note(s)${args.category ? ` in category "${args.category}"` : ''}.`,
      riskTier: 'low' as const,
    },
  }
}

async function toolVaultWrite(args: {
  title: string
  body: string
  category?: string
  tags?: string
}) {
  const category = args.category || 'general'
  const safeTitle = args.title.replace(/[^a-zA-Z0-9-_ ]/g, '').slice(0, 80) || 'untitled'
  const fileName = safeTitle.replace(/\s+/g, '_') + '.md'
  const dir = path.join(VAULT_ROOT, category)
  const filePath = path.join(dir, fileName)

  const frontmatter = [
    '---',
    `title: "${safeTitle.replace(/"/g, '\\"')}"`,
    `category: ${category}`,
    `tags: [${(args.tags || '').split(',').map((t) => `"${t.trim()}"`).join(', ')}]`,
    `created: ${new Date().toISOString()}`,
    `source: otto`,
    '---',
    '',
  ].join('\n')

  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(filePath, frontmatter + args.body + '\n', 'utf8')

  // Sync from disk so DB has the new note (the watcher will pick it up too,
  // but we sync synchronously so the next vault_read sees it).
  try { await syncVaultFromDisk() } catch {}

  return {
    name: 'vault_write',
    ok: true,
    summary: `Wrote vault note "${safeTitle}" → ${category}/${fileName}`,
    data: { title: safeTitle, category, filePath, bytes: frontmatter.length + args.body.length },
    activity: {
      action: 'vault.write',
      target: filePath,
      summary: `Otto wrote vault note "${safeTitle}" in category "${category}".`,
      riskTier: 'low' as const,
      undoable: true,
    },
  }
}

async function toolTaskCreate(args: {
  title: string
  description?: string
  priority?: 'low' | 'normal' | 'high' | 'critical'
  blockedBy?: string[]
}) {
  const task = await db.task.create({
    data: {
      title: args.title,
      description: args.description || '',
      priority: args.priority || 'normal',
      status: 'queued',
      blockedBy: JSON.stringify(args.blockedBy || []),
    },
  })
  return {
    name: 'task_create',
    ok: true,
    summary: `Queued task: "${args.title}" (${args.priority || 'normal'})`,
    data: { id: task.id, title: task.title, status: task.status, priority: task.priority },
    activity: {
      action: 'task.create',
      target: task.id,
      summary: `Otto created task "${args.title}" with priority ${args.priority || 'normal'}.`,
      riskTier: 'low' as const,
    },
  }
}

async function toolTaskList() {
  const tasks = await db.task.findMany({
    where: { status: { in: ['queued', 'executing', 'planning', 'blocked', 'waiting_approval'] } },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    take: 20,
  })
  return {
    name: 'task_list',
    ok: true,
    summary: `Listed ${tasks.length} active task(s).`,
    data: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      description: t.description,
    })),
  }
}

async function toolTaskUpdate(args: {
  taskId: string
  status?: 'queued' | 'planning' | 'executing' | 'waiting_approval' | 'done' | 'failed' | 'cancelled' | 'blocked'
  result?: string
}) {
  const data: Record<string, unknown> = {}
  if (args.status) {
    data.status = args.status
    if (args.status === 'done' || args.status === 'failed' || args.status === 'cancelled') {
      data.completedAt = new Date()
    }
  }
  if (args.result) data.result = args.result
  const task = await db.task.update({ where: { id: args.taskId }, data })
  return {
    name: 'task_update',
    ok: true,
    summary: `Task ${task.title} → ${args.status || 'updated'}`,
    data: { id: task.id, status: task.status, title: task.title },
    activity: {
      action: 'task.update',
      target: task.id,
      summary: `Otto marked task "${task.title}" as ${args.status || 'updated'}.`,
      riskTier: 'low' as const,
    },
  }
}

async function toolAgentSpawn(args: {
  name: string
  kind?: string
  task: string
  modelName?: string
  autoRun?: boolean
}) {
  // Only spawn user-created, named bots — Otto can't invent agent names anymore.
  // The user defines bots in the Bots tab; Otto picks from those.
  const bot = await db.customBot.findFirst({
    where: { name: args.name, isActive: true },
    orderBy: { createdAt: 'desc' },
  })
  if (!bot) {
    const available = await db.customBot.findMany({
      where: { isActive: true },
      select: { name: true, description: true },
      take: 20,
    })
    return {
      name: 'agent_spawn',
      ok: false,
      summary: `Can't spawn "${args.name}" — that isn't a bot the user created. Otto only spawns user-created, named bots (from the Bots tab). Available: ${available.length ? available.map((b) => b.name).join(', ') : '(none yet — ask the user to create one in the Bots tab first)'}.`,
      data: {
        error: 'not a user-created bot',
        requested: args.name,
        available: available.map((b) => ({ name: b.name, description: b.description })),
      },
    }
  }

  const agent = await db.agent.create({
    data: {
      name: bot.name,
      kind: args.kind || 'worker',
      status: 'idle',
      task: args.task,
      modelName: bot.modelName || args.modelName || 'gemini-3.5-flash-lite',
    },
  })

  // If autoRun is true (or at L4+ autonomy), kick off the agent in the background
  const shouldAutoRun = args.autoRun !== false
  let runStarted = false
  if (shouldAutoRun) {
    try {
      // Fire and forget — don't block the tool response
      const { runAgent } = await import('@/lib/agent-runtime')
      runAgent(agent.id).catch((e) => {
        console.error(`[agent_spawn] auto-run failed for ${agent.id}:`, e)
      })
      runStarted = true
    } catch (e) {
      console.warn('[agent_spawn] could not start auto-run:', (e as Error).message)
    }
  }

  return {
    name: 'agent_spawn',
    ok: true,
    summary: `Spawned "${bot.name}" (user-created bot) for: ${args.task}${runStarted ? ' — running' : ' — idle, run via /api/agents/[id]/run'}`,
    data: {
      id: agent.id,
      name: agent.name,
      kind: agent.kind,
      task: agent.task,
      autoRun: runStarted,
      botId: bot.id,
      runEndpoint: `/api/agents/${agent.id}/run`,
    },
    activity: {
      action: 'agent.spawn',
      target: agent.id,
      summary: `Otto spawned user-created bot "${bot.name}" for: ${args.task}${runStarted ? ' (auto-running)' : ''}`,
      riskTier: 'medium' as const,
    },
  }
}

async function toolAgentList() {
  const agents = await db.agent.findMany({ orderBy: { spawnedAt: 'desc' }, take: 20 })
  return {
    name: 'agent_list',
    ok: true,
    summary: `Listed ${agents.length} agent(s).`,
    data: agents.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      status: a.status,
      task: a.task,
      confidence: a.confidence,
    })),
  }
}

async function toolAgentStatus(args: { agentId?: string; name?: string }) {
  // Look up a specific agent by id or name, return its current status + recent activity.
  let agent = null as any
  if (args.agentId) {
    agent = await db.agent.findUnique({ where: { id: args.agentId } })
  } else if (args.name) {
    agent = await db.agent.findFirst({ where: { name: args.name }, orderBy: { spawnedAt: 'desc' } })
  }
  if (!agent) {
    return {
      name: 'agent_status',
      ok: false,
      summary: `Agent not found: ${args.name || args.agentId}`,
      data: { error: 'not found' },
    }
  }
  // Get recent activity for this agent
  const activity = await db.activityLog.findMany({
    where: { OR: [{ agentId: agent.id }, { agentName: agent.name }] },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })
  // Get assigned tasks
  const tasks = await db.task.findMany({
    where: { assigneeId: agent.id },
    orderBy: { updatedAt: 'desc' },
    take: 5,
  })
  return {
    name: 'agent_status',
    ok: true,
    summary: `"${agent.name}" is ${agent.status}${agent.task ? ` — task: ${agent.task.slice(0, 60)}` : ''}`,
    data: {
      id: agent.id,
      name: agent.name,
      status: agent.status,
      task: agent.task,
      confidence: agent.confidence,
      lastBeatAt: agent.lastBeatAt.toISOString(),
      spawnedAt: agent.spawnedAt.toISOString(),
      recentActivity: activity.map((a) => ({
        action: a.action,
        summary: a.summary,
        createdAt: a.createdAt.toISOString(),
      })),
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        result: t.result,
      })),
    },
  }
}

async function toolAgentSpawnMulti(args: {
  workers: { name: string; task: string; kind?: string }[]
}) {
  // Only spawn user-created, named bots. Workers whose names don't match a
  // user-created bot are refused (and listed), so Otto learns to use the user's
  // bots instead of inventing names like Inboxer/Scout/etc.
  const { runAgent } = await import('@/lib/agent-runtime')
  const bots = await db.customBot.findMany({ where: { isActive: true } })
  const botByName = new Map(bots.map((b) => [b.name, b]))
  const spawned: Array<{ id: string; name: string; task: string; autoRun: boolean }> = []
  const refused: Array<{ name: string }> = []
  for (const w of args.workers) {
    const bot = botByName.get(w.name)
    if (!bot) { refused.push({ name: w.name }); continue }
    const agent = await db.agent.create({
      data: { name: bot.name, kind: w.kind || 'worker', status: 'idle', task: w.task, modelName: bot.modelName || 'gemini-3.5-flash-lite' },
    })
    spawned.push({ id: agent.id, name: agent.name, task: agent.task || w.task, autoRun: true })
    runAgent(agent.id).catch((e) => console.error(`[agent_spawn_multi] auto-run failed for ${agent.id}:`, e))
  }
  const available = bots.map((b) => b.name)
  const summary = spawned.length
    ? `Spawned ${spawned.length} user-created bot${spawned.length === 1 ? '' : 's'}: ${spawned.map((s) => `"${s.name}"`).join(', ')}. All running.${refused.length ? ` Refused ${refused.length} (not user-created): ${refused.map((r) => r.name).join(', ')}.` : ''}`
    : `Refused all — none of [${args.workers.map((w) => w.name).join(', ')}] are user-created bots. Available: ${available.length ? available.join(', ') : '(none — ask the user to create bots in the Bots tab first)'}.`
  return {
    name: 'agent_spawn_multi',
    ok: spawned.length > 0,
    summary,
    data: { workers: spawned, refused, available },
    ...(spawned.length ? { activity: { action: 'agent.spawn_multi', target: spawned.map((s) => s.id).join(','), summary: `Otto spawned ${spawned.length} user-created bots in parallel: ${spawned.map((s) => `"${s.name}"`).join(', ')}`, riskTier: 'medium' as const } } : {}),
  }
}

async function toolWebSearch(args: { query: string; maxResults?: number }) {
  // Web search via DuckDuckGo Instant Answer API — no API key required.
  // https://duckduckgo.com/api
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(args.query)}&format=json&no_html=1&skip_disambig=1`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'OttoPerso/1.0 (agent)' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()

    // DuckDuckGo returns: AbstractText, RelatedTopics, Results, etc.
    const results: { title: string; url: string; snippet: string }[] = []

    if (data.AbstractText) {
      results.push({
        title: data.Heading || args.query,
        url: data.AbstractURL || '',
        snippet: data.AbstractText,
      })
    }

    if (data.Results) {
      for (const r of data.Results.slice(0, args.maxResults || 5)) {
        results.push({
          title: r.Text?.slice(0, 100) || args.query,
          url: r.FirstURL || '',
          snippet: r.Text || '',
        })
      }
    }

    if (data.RelatedTopics) {
      for (const t of data.RelatedTopics.slice(0, (args.maxResults || 5) - results.length)) {
        if (t.Text) {
          results.push({
            title: t.Text.slice(0, 100),
            url: t.FirstURL || '',
            snippet: t.Text,
          })
        }
      }
    }

    const text = results.length > 0
      ? results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet.slice(0, 200)}`).join('\n\n')
      : 'No instant results. Try a more specific query or use web_fetch on a specific URL.'

    return {
      name: 'web_search',
      ok: true,
      summary: `Searched DuckDuckGo for "${args.query}" — ${results.length} result(s).`,
      data: { query: args.query, results, raw: text.slice(0, 4000) },
      activity: {
        action: 'web.search',
        target: args.query,
        summary: `Otto searched the web for "${args.query}".`,
        riskTier: 'low' as const,
      },
    }
  } catch (e) {
    return {
      name: 'web_search',
      ok: false,
      summary: `Web search failed: ${(e as Error).message}`,
      data: { error: (e as Error).message },
    }
  }
}

async function toolWebFetch(args: { url: string }) {
  try {
    const res = await fetch(args.url, {
      headers: { 'User-Agent': 'OttoPerso/1.0 (agent)' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const ct = res.headers.get('content-type') || ''
    let text: string
    if (ct.includes('application/json')) {
      text = JSON.stringify(await res.json(), null, 2)
    } else {
      text = await res.text()
    }
    // Strip HTML tags crudely if it looks like HTML
    if (ct.includes('text/html')) {
      text = text
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    }
    return {
      name: 'web_fetch',
      ok: true,
      summary: `Fetched ${args.url} (${text.length} chars)`,
      data: { url: args.url, contentType: ct, content: text.slice(0, 8000) },
      activity: {
        action: 'web.fetch',
        target: args.url,
        summary: `Otto fetched ${args.url}.`,
        riskTier: 'low' as const,
      },
    }
  } catch (e) {
    return {
      name: 'web_fetch',
      ok: false,
      summary: `Fetch failed: ${(e as Error).message}`,
      data: { error: (e as Error).message },
    }
  }
}

async function toolActivityLog(args: { limit?: number }) {
  const logs = await db.activityLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: args.limit || 10,
  })
  return {
    name: 'activity_log',
    ok: true,
    summary: `Retrieved ${logs.length} recent action(s).`,
    data: logs.map((l) => ({
      id: l.id,
      agentName: l.agentName,
      action: l.action,
      target: l.target,
      summary: l.summary,
      riskTier: l.riskTier,
      createdAt: l.createdAt.toISOString(),
    })),
  }
}

async function toolAutonomyGet() {
  const cur = await db.autonomySetting.findFirst({ where: { isCurrent: true } })
  return {
    name: 'autonomy_get',
    ok: true,
    summary: `Current autonomy: ${cur ? `L${cur.level} (${cur.name})` : 'L2 (default)'}`,
    data: cur ? { level: cur.level, name: cur.name, tagline: cur.tagline } : { level: 2, name: 'Mild Edits Only', tagline: 'Default' },
  }
}

async function toolRecipeRun(args: { recipeId: string; inputs?: Record<string, unknown> }) {
  const recipe = await db.recipe.findUnique({ where: { id: args.recipeId } })
  if (!recipe) {
    return {
      name: 'recipe_run',
      ok: false,
      summary: `Recipe not found: ${args.recipeId}`,
      data: { error: 'not found' },
    }
  }
  // Increment run count
  await db.recipe.update({ where: { id: recipe.id }, data: { runCount: { increment: 1 } } })
  // Parse steps and return them so Otto can describe what the recipe does
  let steps: unknown[] = []
  try { steps = JSON.parse(recipe.steps) } catch {}
  return {
    name: 'recipe_run',
    ok: true,
    summary: `Started recipe "${recipe.title}" (${Array.isArray(steps) ? steps.length : '?'} steps).`,
    data: {
      recipeId: recipe.id,
      title: recipe.title,
      steps,
      inputs: args.inputs || {},
      message: 'Recipe queued. In a full install, Otto would execute each step on the user\'s machine. For now, the recipe is logged and its steps are returned for inspection.',
    },
    activity: {
      action: 'recipe.run',
      target: recipe.id,
      summary: `Otto ran recipe "${recipe.title}".`,
      riskTier: 'medium' as const,
    },
  }
}

async function toolRecipeList(args: { category?: string }) {
  const where: Record<string, unknown> = {}
  if (args.category && args.category !== 'all') where.category = args.category
  const recipes = await db.recipe.findMany({
    where,
    orderBy: [{ isFavorite: 'desc' }, { runCount: 'desc' }],
    take: 20,
  })
  return {
    name: 'recipe_list',
    ok: true,
    summary: `Found ${recipes.length} recipe(s)${args.category ? ` in "${args.category}"` : ''}.`,
    data: recipes.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      category: r.category,
      estMinutes: r.estMinutes,
      runCount: r.runCount,
      isFavorite: r.isFavorite,
    })),
  }
}

async function toolRecipeCreate(args: {
  title: string
  description: string
  category?: string
  steps: { action: string; description: string; tool?: string }[]
  estMinutes?: number
}) {
  const recipe = await db.recipe.create({
    data: {
      title: args.title,
      description: args.description,
      category: args.category || 'custom',
      steps: JSON.stringify(args.steps || []),
      estMinutes: args.estMinutes || 5,
      isBuiltIn: false,
      isFavorite: false,
    },
  })
  return {
    name: 'recipe_create',
    ok: true,
    summary: `Created recipe "${args.title}" with ${args.steps?.length || 0} step(s) in category "${args.category || 'custom'}".`,
    data: {
      id: recipe.id,
      title: recipe.title,
      description: recipe.description,
      category: recipe.category,
      steps: args.steps,
      estMinutes: recipe.estMinutes,
    },
    activity: {
      action: 'recipe.create',
      target: recipe.id,
      summary: `Otto created recipe "${args.title}" (${args.steps?.length || 0} steps).`,
      riskTier: 'low' as const,
    },
  }
}

async function toolActivityLogCustom(args: {
  action: string
  summary: string
  target?: string
  riskTier?: 'low' | 'medium' | 'high' | 'critical'
}) {
  const log = await db.activityLog.create({
    data: {
      agentName: 'Otto',
      action: args.action,
      target: args.target,
      summary: args.summary,
      riskTier: args.riskTier || 'low',
      undoable: false,
      autonomyLevel: 2,
    },
  })
  return {
    name: 'activity_log_custom',
    ok: true,
    summary: `Logged: ${args.summary}`,
    data: { id: log.id, action: log.action, summary: log.summary, riskTier: log.riskTier },
    activity: {
      action: args.action,
      target: args.target,
      summary: args.summary,
      riskTier: args.riskTier || ('low' as const),
    },
  }
}

async function toolSystemState(args: { key: string; value?: string }) {
  if (args.value !== undefined) {
    // Set
    const updated = await db.systemState.upsert({
      where: { key: args.key },
      update: { value: args.value },
      create: { key: args.key, value: args.value },
    })
    return {
      name: 'system_state',
      ok: true,
      summary: `Set system state "${args.key}" = "${args.value.slice(0, 60)}${args.value.length > 60 ? '…' : ''}"`,
      data: { key: updated.key, value: updated.value },
      activity: {
        action: 'system.state.set',
        target: args.key,
        summary: `Otto set system state "${args.key}".`,
        riskTier: 'low' as const,
      },
    }
  }
  // Get
  const row = await db.systemState.findUnique({ where: { key: args.key } })
  return {
    name: 'system_state',
    ok: true,
    summary: `System state "${args.key}" = ${row ? `"${row.value.slice(0, 80)}"` : '(unset)'}`,
    data: { key: args.key, value: row?.value ?? null },
  }
}

async function toolWebPageReader(args: { url: string }) {
  // Raw fetch + HTML-to-text conversion. No third-party SDK.
  try {
    const res = await fetch(args.url, {
      headers: { 'User-Agent': 'OttoPerso/1.0 (agent)' },
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const ct = res.headers.get('content-type') || ''
    let text: string
    if (ct.includes('application/json')) {
      text = JSON.stringify(await res.json(), null, 2)
    } else {
      text = await res.text()
    }
    // Strip HTML if needed
    if (ct.includes('text/html') || text.includes('<html') || text.includes('<body')) {
      text = text
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[\s\S]*?<\/footer>/gi, '')
        .replace(/<header[\s\S]*?<\/header>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim()
    }
    return {
      name: 'web_page_reader',
      ok: true,
      summary: `Read ${args.url} (${text.length} chars)`,
      data: { url: args.url, contentType: ct, content: text.slice(0, 8000) },
      activity: {
        action: 'web.page_read',
        target: args.url,
        summary: `Otto read page ${args.url}.`,
        riskTier: 'low' as const,
      },
    }
  } catch (e) {
    return {
      name: 'web_page_reader',
      ok: false,
      summary: `Page reader failed: ${(e as Error).message}`,
      data: { error: (e as Error).message },
    }
  }
}

async function toolSmsSend(args: { to: string; body: string }) {
  // Real SMS via the configured phone provider (Telnyx/Twilio/Vonage/Plivo).
  // Only fires if the user has configured phone credentials in Settings.
  try {
    const { sendSms, loadPhoneCreds } = await import('@/lib/phone-store')
    const creds = await loadPhoneCreds()
    if (!creds) {
      return {
        name: 'sms_send',
        ok: false,
        summary: 'Cannot send SMS — no phone number configured. Ask the user to add phone credentials in Settings.',
        data: { error: 'phone not configured' },
      }
    }
    const result = await sendSms({ to: args.to, body: args.body })
    if (!result.ok) {
      return {
        name: 'sms_send',
        ok: false,
        summary: `SMS to ${args.to} failed: ${result.error}`,
        data: { error: result.error, to: args.to },
      }
    }
    return {
      name: 'sms_send',
      ok: true,
      summary: `Sent SMS to ${args.to} via ${creds.provider} (from ${creds.fromNumber}). ~$${result.cost}/msg.`,
      data: { to: args.to, messageId: result.messageId, provider: creds.provider, from: creds.fromNumber, cost: result.cost },
      activity: {
        action: 'phone.sms_send',
        target: args.to,
        summary: `Otto sent SMS to ${args.to}: "${args.body.slice(0, 60)}${args.body.length > 60 ? '…' : ''}"`,
        riskTier: 'medium' as const,
        undoable: false,
      },
    }
  } catch (e) {
    return {
      name: 'sms_send',
      ok: false,
      summary: `SMS tool failed: ${(e as Error).message}`,
      data: { error: (e as Error).message },
    }
  }
}

async function toolPhoneStatus() {
  try {
    const { loadPhoneCreds } = await import('@/lib/phone-store')
    const creds = await loadPhoneCreds()
    if (!creds) {
      return {
        name: 'phone_status',
        ok: true,
        summary: 'No phone number configured. SMS/call tools will not work until the user adds credentials in Settings.',
        data: { configured: false },
      }
    }
    return {
      name: 'phone_status',
      ok: true,
      summary: `Phone configured: ${creds.fromNumber} via ${creds.provider}.`,
      data: { configured: true, provider: creds.provider, fromNumber: creds.fromNumber },
    }
  } catch (e) {
    return {
      name: 'phone_status',
      ok: false,
      summary: `Phone status check failed: ${(e as Error).message}`,
      data: { error: (e as Error).message },
    }
  }
}

async function toolEmailStatus() {
  try {
    const { loadEmailCreds } = await import('@/lib/email-store')
    const creds = await loadEmailCreds()
    if (!creds) {
      return {
        name: 'email_status',
        ok: true,
        summary: 'No email provider configured. Email tools will not work until the user adds credentials in Settings.',
        data: { configured: false },
      }
    }
    return {
      name: 'email_status',
      ok: true,
      summary: `Email configured: ${creds.fromEmail} via ${creds.provider}.`,
      data: { configured: true, provider: creds.provider, fromEmail: creds.fromEmail, fromName: creds.fromName },
    }
  } catch (e) {
    return {
      name: 'email_status',
      ok: false,
      summary: `Email status check failed: ${(e as Error).message}`,
      data: { error: (e as Error).message },
    }
  }
}

async function toolEmailSend(args: { to: string; subject: string; body: string; isHtml?: boolean }) {
  // Real email via the configured provider (Resend/SendGrid/SMTP).
  try {
    const { sendEmail, loadEmailCreds } = await import('@/lib/email-store')
    const creds = await loadEmailCreds()
    if (!creds) {
      return {
        name: 'email_send',
        ok: false,
        summary: 'Cannot send email — no email provider configured. Ask the user to add email credentials in Settings.',
        data: { error: 'email not configured' },
      }
    }
    const result = await sendEmail({
      to: args.to,
      subject: args.subject,
      body: args.body,
      isHtml: args.isHtml ?? false,
    })
    if (!result.ok) {
      return {
        name: 'email_send',
        ok: false,
        summary: `Email to ${args.to} failed: ${result.error}`,
        data: { error: result.error, to: args.to },
      }
    }
    return {
      name: 'email_send',
      ok: true,
      summary: `Sent email to ${args.to} via ${creds.provider} (from ${creds.fromEmail}). Subject: "${args.subject.slice(0, 50)}".`,
      data: { to: args.to, subject: args.subject, messageId: result.messageId, provider: creds.provider, from: creds.fromEmail, cost: result.cost },
      activity: {
        action: 'email.send',
        target: args.to,
        summary: `Otto sent email to ${args.to}: "${args.subject}"`,
        riskTier: 'medium' as const,
        undoable: false,
      },
    }
  } catch (e) {
    return {
      name: 'email_send',
      ok: false,
      summary: `Email tool failed: ${(e as Error).message}`,
      data: { error: (e as Error).message },
    }
  }
}

// ─── File operations (sandboxed to /home/z/otto-workspace/) ────────────────
const WORKSPACE_ROOT = process.env.OTTO_WORKSPACE_ROOT || '/home/z/otto-workspace'

function safePath(relPath: string): string {
  const path = require('path')
  // Strip leading slashes, prevent path traversal
  const cleaned = (relPath || '').replace(/^\/+/, '').replace(/\.\./g, '')
  const full = path.resolve(WORKSPACE_ROOT, cleaned)
  // Ensure the resolved path is inside the workspace
  if (!full.startsWith(path.resolve(WORKSPACE_ROOT))) {
    throw new Error('path escapes workspace')
  }
  return full
}

async function toolFileRead(args: { path: string }) {
  try {
    const { promises: fs } = await import('fs')
    const full = safePath(args.path)
    const content = await fs.readFile(full, 'utf-8')
    const stat = await fs.stat(full)
    return {
      name: 'file_read',
      ok: true,
      summary: `Read ${args.path} (${content.length} chars, ${stat.size} bytes)`,
      data: {
        path: args.path,
        content: content.slice(0, 12000), // cap for context window
        truncated: content.length > 12000,
        size: stat.size,
        modified: stat.mtime.toISOString(),
      },
      activity: {
        action: 'file.read',
        target: args.path,
        summary: `Otto read file ${args.path}`,
        riskTier: 'low' as const,
      },
    }
  } catch (e) {
    return {
      name: 'file_read',
      ok: false,
      summary: `Read failed: ${(e as Error).message}`,
      data: { error: (e as Error).message, path: args.path },
    }
  }
}

async function toolFileWrite(args: { path: string; content: string; append?: boolean }) {
  try {
    const { promises: fs } = await import('fs')
    const path = await import('path')
    const full = safePath(args.path)
    await fs.mkdir(path.dirname(full), { recursive: true })
    if (args.append) {
      await fs.appendFile(full, args.content, 'utf-8')
    } else {
      await fs.writeFile(full, args.content, 'utf-8')
    }
    const stat = await fs.stat(full)
    return {
      name: 'file_write',
      ok: true,
      summary: `${args.append ? 'Appended to' : 'Wrote'} ${args.path} (${args.content.length} chars)`,
      data: {
        path: args.path,
        bytes: stat.size,
        append: !!args.append,
      },
      activity: {
        action: 'file.write',
        target: args.path,
        summary: `Otto ${args.append ? 'appended to' : 'wrote'} file ${args.path} (${args.content.length} chars)`,
        riskTier: 'low' as const,
        undoable: true,
      },
    }
  } catch (e) {
    return {
      name: 'file_write',
      ok: false,
      summary: `Write failed: ${(e as Error).message}`,
      data: { error: (e as Error).message, path: args.path },
    }
  }
}

async function toolFileList(args: { path?: string }) {
  try {
    const { promises: fs } = await import('fs')
    const path = await import('path')
    const full = safePath(args.path || '')
    const entries = await fs.readdir(full, { withFileTypes: true })
    const items = await Promise.all(entries.map(async (e) => {
      const ep = path.join(full, e.name)
      let size = 0, modified = ''
      try {
        const s = await fs.stat(ep)
        size = s.size
        modified = s.mtime.toISOString()
      } catch {}
      return {
        name: e.name,
        type: e.isDirectory() ? 'dir' : 'file',
        size,
        modified,
        extension: e.isFile() ? path.extname(e.name).slice(1) : '',
      }
    }))
    return {
      name: 'file_list',
      ok: true,
      summary: `Listed ${items.length} item(s) in ${args.path || '/'}`,
      data: { path: args.path || '/', items },
    }
  } catch (e) {
    return {
      name: 'file_list',
      ok: false,
      summary: `List failed: ${(e as Error).message}`,
      data: { error: (e as Error).message, path: args.path },
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REAL-WORLD ACTION TOOLS — booking, reservations, payments, calendar
// These give Otto the ability to DO things in the real world.
// Every provider below is FREE and requires NO credit card:
//   • Geoapify   — free 3,000 req/day, no card (optional key; unlocks richer data)
//   • Nominatim  — OpenStreetMap geocoding + POI search, NO key at all
//   • OSRM       — OpenStreetMap routing, NO key at all
//   • iTunes     — song search + 30-sec previews, NO key at all
//   • Ticketmaster, Travelpayouts, Finnhub — free keys, no card
// Google Places / Uber / Spotify / Kiwi were REMOVED because they need a card
// or a paid/premium account. See .env.example for the full audit.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Shared keyless geo helpers (OpenStreetMap ecosystem — free, no key) ────
async function geoGeocodeFree(address: string): Promise<{ lat: number; lon: number; displayName: string } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'OttoPerso/1.0 (personal AI assistant)' }, signal: AbortSignal.timeout(10000) },
    )
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), displayName: data[0].display_name }
    }
  } catch { /* fall through */ }
  return null
}

async function geoRouteFree(lat1: number, lon1: number, lat2: number, lon2: number): Promise<{ distanceM: number; durationS: number } | null> {
  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`,
      { signal: AbortSignal.timeout(12000) },
    )
    const data = await res.json()
    if (data.code === 'Ok' && data.routes?.[0]) {
      return { distanceM: data.routes[0].distance, durationS: data.routes[0].duration }
    }
  } catch { /* fall through */ }
  return null
}

// ─── Hotel Search (Geoapify if key, else OpenStreetMap — both free, no card) ─
async function toolHotelSearch(args: { location: string; checkIn?: string; checkOut?: string; guests?: number; maxPrice?: number }) {
  try {
    const geoKey = process.env.GEOAPIFY_API_KEY
    let hotels: any[] = []

    if (geoKey) {
      // Geoapify: geocode the location, then search hotels within ~6km
      const geoRes = await fetch(`https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(args.location)}&limit=1&apiKey=${geoKey}`, { signal: AbortSignal.timeout(10000) })
      const geoData = await geoRes.json()
      const center = geoData.features?.[0]?.properties
      if (center?.lat && center?.lon) {
        const placesRes = await fetch(`https://api.geoapify.com/v2/places?categories=accommodation.hotel,accommodation.guest_house,accommodation.hostel&filter=circle:${center.lon},${center.lat},6000&bias=proximity:${center.lon},${center.lat}&limit=10&apiKey=${geoKey}`, { signal: AbortSignal.timeout(15000) })
        const placesData = await placesRes.json()
        hotels = (placesData.features || []).map((f: any) => ({
          name: f.properties?.name || 'Hotel',
          address: f.properties?.formatted,
          stars: f.properties?.datasource?.raw?.stars ? Number(f.properties.datasource.raw.stars) : undefined,
          phone: f.properties?.datasource?.raw?.phone,
          website: f.properties?.datasource?.raw?.website || f.properties?.website,
          lat: f.properties?.lat,
          lon: f.properties?.lon,
          distanceMeters: Math.round(f.properties?.distance || 0),
          source: 'geoapify',
        }))
      }
    }

    // Keyless fallback (and default): OpenStreetMap via Nominatim — completely free, NO key
    if (hotels.length === 0) {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`hotels in ${args.location}`)}&format=json&limit=12&extratags=1`,
        { headers: { 'User-Agent': 'OttoPerso/1.0 (personal AI assistant)' }, signal: AbortSignal.timeout(15000) },
      )
      const data = await res.json()
      if (Array.isArray(data)) {
        hotels = data
          .filter((r: any) => r.class === 'tourism' && ['hotel', 'guest_house', 'hostel', 'motel', 'apartment'].includes(r.type))
          .slice(0, 10)
          .map((r: any) => ({
            name: r.name || (r.display_name || 'Hotel').split(',')[0],
            address: r.display_name,
            stars: r.extratags?.stars ? Number(r.extratags.stars) : undefined,
            phone: r.extratags?.phone || r.extratags?.['contact:phone'],
            website: r.extratags?.website || r.extratags?.['contact:website'],
            lat: parseFloat(r.lat),
            lon: parseFloat(r.lon),
            source: 'openstreetmap',
          }))
      }
    }

    if (hotels.length === 0) {
      return { name: 'hotel_search', ok: true, summary: `No hotels found in ${args.location}.`, data: { hotels: [], location: args.location } }
    }

    return {
      name: 'hotel_search',
      ok: true,
      summary: `Found ${hotels.length} hotels in ${args.location}.`,
      data: { hotels, location: args.location, checkIn: args.checkIn, checkOut: args.checkOut, guests: args.guests || 1, provider: hotels[0]?.source },
      activity: {
        action: 'hotel.search',
        target: args.location,
        summary: `Otto searched for hotels in ${args.location}.`,
        riskTier: 'low' as const,
      },
    }
  } catch (e) {
    return {
      name: 'hotel_search',
      ok: false,
      summary: `Hotel search failed: ${(e as Error).message}`,
      data: { error: (e as Error).message },
    }
  }
}

// ─── Restaurant Search (Geoapify if key, else OpenStreetMap — free, no card) ─
async function toolRestaurantSearch(args: { location: string; cuisine?: string; maxPrice?: number; openNow?: boolean }) {
  try {
    const geoKey = process.env.GEOAPIFY_API_KEY
    let restaurants: any[] = []

    if (geoKey) {
      const geoRes = await fetch(`https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(args.location)}&limit=1&apiKey=${geoKey}`, { signal: AbortSignal.timeout(10000) })
      const geoData = await geoRes.json()
      const center = geoData.features?.[0]?.properties
      if (center?.lat && center?.lon) {
        const placesRes = await fetch(`https://api.geoapify.com/v2/places?categories=catering.restaurant,catering.fast_food,catering.cafe&filter=circle:${center.lon},${center.lat},5000&bias=proximity:${center.lon},${center.lat}&limit=15&apiKey=${geoKey}`, { signal: AbortSignal.timeout(15000) })
        const placesData = await placesRes.json()
        restaurants = (placesData.features || []).map((f: any) => {
          const raw = f.properties?.datasource?.raw || {}
          return {
            name: f.properties?.name || 'Restaurant',
            address: f.properties?.formatted,
            cuisine: raw.cuisine,
            phone: raw.phone || raw['contact:phone'],
            website: raw.website || raw['contact:website'],
            openHours: raw.opening_hours,
            lat: f.properties?.lat,
            lon: f.properties?.lon,
            distanceMeters: Math.round(f.properties?.distance || 0),
            source: 'geoapify',
          }
        })
        if (args.cuisine) {
          const want = args.cuisine.toLowerCase()
          restaurants = restaurants.filter((r: any) => r.cuisine && String(r.cuisine).toLowerCase().includes(want))
        }
      }
    }

    // Keyless fallback: OpenStreetMap via Nominatim (broad query + client-side cuisine filter)
    if (restaurants.length === 0) {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`restaurants in ${args.location}`)}&format=json&limit=25&extratags=1`,
        { headers: { 'User-Agent': 'OttoPerso/1.0 (personal AI assistant)' }, signal: AbortSignal.timeout(15000) },
      )
      const data = await res.json()
      if (Array.isArray(data)) {
        const all = data
          .filter((r: any) => r.class === 'amenity' && ['restaurant', 'fast_food', 'cafe', 'pub', 'bar'].includes(r.type))
          .map((r: any) => ({
            name: r.name || (r.display_name || 'Restaurant').split(',')[0],
            address: r.display_name,
            cuisine: r.extratags?.cuisine,
            phone: r.extratags?.phone || r.extratags?.['contact:phone'],
            website: r.extratags?.website || r.extratags?.['contact:website'],
            openHours: r.extratags?.opening_hours,
            lat: parseFloat(r.lat),
            lon: parseFloat(r.lon),
            source: 'openstreetmap',
          }))
        if (args.cuisine) {
          const want = args.cuisine.toLowerCase()
          const matched = all.filter((r: any) => r.cuisine && String(r.cuisine).toLowerCase().includes(want))
          restaurants = (matched.length > 0 ? matched : all).slice(0, 15)
        } else {
          restaurants = all.slice(0, 15)
        }
      }
    }

    if (restaurants.length === 0) {
      return { name: 'restaurant_search', ok: true, summary: `No restaurants found in ${args.location}.`, data: { restaurants: [], location: args.location } }
    }

    return {
      name: 'restaurant_search',
      ok: true,
      summary: `Found ${restaurants.length} restaurants in ${args.location}${args.cuisine ? ` (${args.cuisine})` : ''}.`,
      data: { restaurants, location: args.location, provider: restaurants[0]?.source },
      activity: {
        action: 'restaurant.search',
        target: args.location,
        summary: `Otto searched for restaurants in ${args.location}.`,
        riskTier: 'low' as const,
      },
    }
  } catch (e) {
    return {
      name: 'restaurant_search',
      ok: false,
      summary: `Restaurant search failed: ${(e as Error).message}`,
      data: { error: (e as Error).message },
    }
  }
}

// ─── Event Search (keyless — web results; optional SeatGeek for structured) ─
// Ticketmaster removed (signup friction). Default path is KEYLESS: returns
// curated search links (Google, DuckDuckGo, Bandsintown) so the user lands on
// real event results in the browser with zero keys and zero signup.
// If SEATGEEK_CLIENT_ID is set (free, no card — seatgeek.com/developer), Otto
// pulls structured event listings (name, date, venue, price, ticket URL) instead.
async function toolEventSearch(args: { location: string; date?: string; category?: string; keyword?: string }) {
  const sgId = process.env.SEATGEEK_CLIENT_ID
  const enc = encodeURIComponent
  const qParts = ['events in', args.location]
  if (args.category) qParts.push(args.category)
  if (args.keyword) qParts.push(args.keyword)
  if (args.date) qParts.push(args.date)
  const q = qParts.join(' ')

  // Optional structured path: SeatGeek (free, no card)
  if (sgId) {
    try {
      const params = new URLSearchParams({ 'venue.city': args.location, per_page: '15', client_id: sgId })
      if (args.date) params.set('datetime_utc.gte', `${args.date}T00:00:00`)
      if (args.keyword) params.set('q', args.keyword)
      const res = await fetch(`https://api.seatgeek.com/2/events?${params.toString()}`, { signal: AbortSignal.timeout(15000) })
      const data = await res.json()
      const events = (data.events || []).slice(0, 15).map((ev: any) => ({
        name: ev.title,
        type: ev.type,
        date: ev.datetime_local,
        venue: ev.venue?.name,
        city: ev.venue?.city,
        url: ev.url,
        priceFrom: ev.stats?.lowest_price,
        priceTo: ev.stats?.highest_price,
        currency: 'usd',
      }))
      return {
        name: 'event_search',
        ok: true,
        summary: `Found ${events.length} events in ${args.location} (SeatGeek).`,
        data: { events, location: args.location, provider: 'seatgeek' },
        activity: { action: 'event.search', target: args.location, summary: `Otto searched for events in ${args.location}.`, riskTier: 'low' as const },
      }
    } catch { /* fall through to keyless */ }
  }

  // Keyless default: curated search links — zero keys, zero signup
  const links = [
    { label: `Google — ${q}`, url: `https://www.google.com/search?q=${enc(q + ' tickets')}` },
    { label: `DuckDuckGo — ${q}`, url: `https://duckduckgo.com/?q=${enc(q)}` },
    { label: `Bandsintown — concerts in ${args.location}`, url: `https://www.bandsintown.com/?q=${enc(args.location)}` },
  ]
  return {
    name: 'event_search',
    ok: true,
    summary: `Opened web results for events in ${args.location}${args.date ? ' on ' + args.date : ''}. For structured listings, add a free SeatGeek client ID (no card).`,
    data: {
      location: args.location,
      provider: 'keyless-web',
      links,
      query: q,
      note: 'Set SEATGEEK_CLIENT_ID (free, no card — seatgeek.com/developer) for structured event data.',
    },
    activity: { action: 'event.search', target: args.location, summary: `Otto searched for events in ${args.location}.`, riskTier: 'low' as const },
  }
}

// ─── Calendar Book (keyless .ics — works with Google/Apple/Outlook) ────────
async function toolCalendarBook(args: { title: string; startTime: string; endTime: string; location?: string; description?: string }) {
  try {
    // Keyless by design. Generates a standard .ics file that imports into
    // Google Calendar, Apple Calendar, Outlook, Thunderbird — anything that
    // speaks iCalendar. No API key, no OAuth, no cloud project.
    const toIcsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Otto Perso//Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:otto-${Date.now()}@ottoperso.app`,
      `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
      `DTSTART:${toIcsDate(args.startTime)}`,
      `DTEND:${toIcsDate(args.endTime)}`,
      `SUMMARY:${args.title.replace(/[\r\n;]/g, ' ')}`,
      args.location ? `LOCATION:${args.location.replace(/[\r\n;]/g, ' ')}` : '',
      args.description ? `DESCRIPTION:${args.description.replace(/[\r\n;]/g, ' ')}` : '',
      'BEGIN:VALARM',
      'TRIGGER:-PT15M',
      'ACTION:DISPLAY',
      `DESCRIPTION:${args.title}`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].filter(Boolean).join('\r\n')

    const { promises: fs } = await import('fs')
    const path = await import('path')
    const wsRoot = process.env.OTTO_WORKSPACE_ROOT || '/home/z/otto-workspace'
    await fs.mkdir(wsRoot, { recursive: true })
    const safeTitle = (args.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'event').slice(0, 40)
    const fileName = `${safeTitle}-${Date.now()}.ics`
    await fs.writeFile(path.join(wsRoot, fileName), icsContent, 'utf-8')

    return {
      name: 'calendar_book',
      ok: true,
      summary: `Created calendar event "${args.title}" on ${args.startTime}. Saved as ${fileName} — open it to import into Google/Apple/Outlook calendar (no API key needed).`,
      data: {
        title: args.title,
        startTime: args.startTime,
        endTime: args.endTime,
        location: args.location,
        description: args.description,
        icsFile: fileName,
        icsContent,
        importHint: 'Open the file to add to any calendar app, or email it as an attachment.',
      },
      activity: {
        action: 'calendar.book',
        target: args.title,
        summary: `Otto created calendar event "${args.title}" for ${args.startTime}.`,
        riskTier: 'low' as const,
      },
    }
  } catch (e) {
    return {
      name: 'calendar_book',
      ok: false,
      summary: `Calendar booking failed: ${(e as Error).message}`,
      data: { error: (e as Error).message },
    }
  }
}

// ─── Payment Setup (Stripe) ────────────────────────────────────────────────
async function toolPaymentStatus() {
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    return {
      name: 'payment_status',
      ok: true,
      summary: 'No payment method configured. Otto cannot charge cards or make purchases. Add a Stripe key in Settings to enable payments.',
      data: { configured: false },
    }
  }
  return {
    name: 'payment_status',
    ok: true,
    summary: 'Payment is configured via Stripe. Otto can charge saved cards.',
    data: { configured: true, provider: 'stripe' },
  }
}

async function toolPaymentCharge(args: { amount: number; currency: string; description: string; customerEmail?: string }) {
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    return {
      name: 'payment_charge',
      ok: false,
      summary: 'Cannot charge — no Stripe key configured. Add one in Settings.',
      data: { error: 'STRIPE_SECRET_KEY not set' },
    }
  }

  try {
    // Create a PaymentIntent via Stripe API
    const amountCents = Math.round(args.amount * 100)
    const res = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        amount: String(amountCents),
        currency: args.currency.toLowerCase(),
        description: args.description,
        'metadata[otto]': 'true',
        'metadata[description]': args.description,
      }),
      signal: AbortSignal.timeout(15000),
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`)

    return {
      name: 'payment_charge',
      ok: true,
      summary: `Created payment intent for ${args.currency.toUpperCase()} ${args.amount} — ${args.description}. Payment ID: ${data.id}. The user needs to confirm the payment.`,
      data: {
        paymentIntentId: data.id,
        clientSecret: data.client_secret,
        amount: args.amount,
        currency: args.currency,
        status: data.status,
      },
      activity: {
        action: 'payment.charge',
        target: data.id,
        summary: `Otto initiated payment of ${args.currency.toUpperCase()} ${args.amount} for: ${args.description}`,
        riskTier: 'critical' as const,
      },
    }
  } catch (e) {
    return {
      name: 'payment_charge',
      ok: false,
      summary: `Payment failed: ${(e as Error).message}`,
      data: { error: (e as Error).message },
    }
  }
}

// ─── Ride Estimate (keyless — OpenStreetMap routing + typical fare rates) ──
// No Uber key needed. Uber stopped issuing server tokens to new apps, so this
// tool geocodes the two points (Nominatim, no key), routes them (OSRM, no key),
// then estimates fares for several ride tiers using typical per-km + per-min
// rates. Real prices vary by city; this is an honest "ballpark" estimate.
async function toolRideEstimate(args: { from?: string; to?: string; startLatitude?: number; startLongitude?: number; endLatitude?: number; endLongitude?: number; currency?: string }) {
  try {
    let startLat = args.startLatitude, startLon = args.startLongitude, startName = args.from || 'start'
    let endLat = args.endLatitude, endLon = args.endLongitude, endName = args.to || 'destination'

    if ((startLat == null || startLon == null) && args.from) {
      const g = await geoGeocodeFree(args.from)
      if (!g) return { name: 'ride_estimate', ok: false, summary: `Could not find "${args.from}".`, data: { error: 'geocode start failed' } }
      startLat = g.lat; startLon = g.lon; startName = g.displayName
    }
    if ((endLat == null || endLon == null) && args.to) {
      const g = await geoGeocodeFree(args.to)
      if (!g) return { name: 'ride_estimate', ok: false, summary: `Could not find "${args.to}".`, data: { error: 'geocode end failed' } }
      endLat = g.lat; endLon = g.lon; endName = g.displayName
    }
    if (startLat == null || startLon == null || endLat == null || endLon == null) {
      return { name: 'ride_estimate', ok: false, summary: 'Need either "from"/"to" addresses or start/end lat-lng pairs.', data: { error: 'missing points' } }
    }

    // Try Geoapify routing if a key is present (richer), else OSRM keyless
    let distanceM: number | null = null
    let durationS: number | null = null
    const geoKey = process.env.GEOAPIFY_API_KEY
    if (geoKey) {
      try {
        const res = await fetch(`https://api.geoapify.com/v1/routing?waypoints=${startLat},${startLon}|${endLat},${endLon}&mode=drive&apiKey=${geoKey}`, { signal: AbortSignal.timeout(15000) })
        const data = await res.json()
        if (data.features?.[0]?.properties) {
          distanceM = data.features[0].properties.distance
          durationS = data.features[0].properties.time
        }
      } catch { /* fall back to OSRM */ }
    }
    if (distanceM == null) {
      const r = await geoRouteFree(startLat!, startLon!, endLat!, endLon!)
      if (!r) return { name: 'ride_estimate', ok: false, summary: 'Could not compute a driving route between those points.', data: { error: 'no route' } }
      distanceM = r.distanceM
      durationS = r.durationS
    }
    if (distanceM == null || durationS == null) {
      return { name: 'ride_estimate', ok: false, summary: 'Could not compute a driving route between those points.', data: { error: 'no route' } }
    }

    const km = distanceM / 1000
    const min = durationS / 60
    const currency = (args.currency || 'USD').toUpperCase()

    // Typical ride-hailing fare structure (USD-equivalent ballpark):
    //   economy (UberGo/Ola Micro):  base 0.50 + 0.55/km + 0.08/min
    //   comfort (UberX/Premier):     base 1.00 + 0.85/km + 0.12/min
    //   xl (UberXL/SUV):             base 1.50 + 1.20/km + 0.16/min
    // Auto-rickshaw is region-specific; included as a cheap local option.
    const tiers = [
      { type: 'Auto / Tuk-tuk (local)', base: 0.25, perKm: 0.30, perMin: 0.05 },
      { type: 'Economy (UberGo / Ola Micro)', base: 0.50, perKm: 0.55, perMin: 0.08 },
      { type: 'Comfort (UberX / Premier)', base: 1.00, perKm: 0.85, perMin: 0.12 },
      { type: 'XL (UberXL / SUV)', base: 1.50, perKm: 1.20, perMin: 0.16 },
    ]
    const options = tiers.map(t => {
      const center = t.base + t.perKm * km + t.perMin * min
      const low = Math.max(center * 0.85, t.base)
      const high = center * 1.15
      return {
        type: t.type,
        estimateLow: Number(low.toFixed(2)),
        estimateHigh: Number(high.toFixed(2)),
        currency,
        durationMinutes: Math.round(min),
        distanceKm: Number(km.toFixed(1)),
      }
    })

    const fmt = (n: number) => `${currency} ${n.toFixed(2)}`
    const comfort = options[2]
    return {
      name: 'ride_estimate',
      ok: true,
      summary: `Ride from ${startName.split(',')[0]} to ${endName.split(',')[0]}: ~${km.toFixed(1)} km, ~${Math.round(min)} min. Comfort tier ≈ ${fmt(comfort.estimateLow)}–${fmt(comfort.estimateHigh)}.`,
      data: {
        options,
        distanceKm: Number(km.toFixed(1)),
        durationMinutes: Math.round(min),
        from: startName,
        to: endName,
        provider: geoKey ? 'geoapify' : 'openstreetmap',
        note: 'Estimates are ballpark figures based on typical global ride-hailing rates. Actual prices vary by city, surge, and demand.',
      },
      activity: {
        action: 'ride.estimate',
        target: `${startName} → ${endName}`,
        summary: `Otto estimated a ride (~${km.toFixed(1)} km, ~${Math.round(min)} min).`,
        riskTier: 'low' as const,
      },
    }
  } catch (e) {
    return {
      name: 'ride_estimate',
      ok: false,
      summary: `Ride estimate failed: ${(e as Error).message}`,
      data: { error: (e as Error).message },
    }
  }
}

// ─── Music Play (iTunes Search — keyless; YouTube for full songs) ──────────
// No Spotify key needed. Spotify now requires a Premium (paid) account for API
// access, so we use:
//   1. iTunes Search API  — FREE, NO key, returns track info + 30-sec previews
//   2. YouTube            — for the FULL song. Either keyless (opens a YouTube
//                           search-results page for the matched track) or, if
//                           YOUTUBE_API_KEY is set (free, no card), Otto
//                           resolves the exact top video and opens that.
async function toolMusicPlay(args: { query: string; action: 'play' | 'pause' | 'next' | 'search' }) {
  if (args.action !== 'search' && args.action !== 'play') {
    return {
      name: 'music_play',
      ok: true,
      summary: `Music ${args.action} command received. Playback control needs a connected player (Spotify/Apple Music) — for now Otto can search and open songs.`,
      data: { action: args.action, query: args.query },
    }
  }

  try {
    // 1) iTunes Search — keyless, reliable, returns 30-sec playable previews
    const itunesRes = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(args.query)}&entity=song&limit=5`,
      { signal: AbortSignal.timeout(10000) },
    )
    const itunesData = await itunesRes.json()
    const results: any[] = Array.isArray(itunesData.results) ? itunesData.results : []

    if (results.length === 0) {
      // Last-resort keyless path: open a YouTube search so the user still
      // hears the song — "search the web and play it", exactly.
      const ytSearch = `https://www.youtube.com/results?search_query=${encodeURIComponent(args.query)}`
      return {
        name: 'music_play',
        ok: true,
        summary: `No exact track match found for "${args.query}". Opened a YouTube search for it.`,
        data: { query: args.query, youtubeSearchUrl: ytSearch },
        activity: {
          action: 'music.search',
          target: args.query,
          summary: `Otto searched for music: "${args.query}".`,
          riskTier: 'low' as const,
        },
      }
    }

    // Optionally resolve the exact YouTube video for the top track (free key, no card)
    let youtubeWatchUrl: string | null = null
    const ytKey = process.env.YOUTUBE_API_KEY
    const top = results[0]
    const ytQuery = `${top.trackName} ${top.artistName}`
    if (ytKey) {
      try {
        const ytRes = await fetch(
          `https://www.googleapis.com/youtube/v3/search?part=id&type=video&maxResults=1&q=${encodeURIComponent(ytQuery)}&key=${ytKey}`,
          { signal: AbortSignal.timeout(10000) },
        )
        const ytData = await ytRes.json()
        const videoId = ytData.items?.[0]?.id?.videoId
        if (videoId) youtubeWatchUrl = `https://www.youtube.com/watch?v=${videoId}`
      } catch { /* fall back to keyless search URL */ }
    }
    if (!youtubeWatchUrl) {
      // Keyless: a YouTube search-results URL still lands the user on the song
      youtubeWatchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(ytQuery)}`
    }

    const tracks = results.map((r: any) => ({
      name: r.trackName,
      artist: r.artistName,
      album: r.collectionName,
      durationMs: r.trackTimeMillis,
      previewUrl: r.previewUrl,        // 30-sec playable m4a, NO login
      itunesUrl: r.trackViewUrl,
      artwork: r.artworkUrl100,
    }))

    return {
      name: 'music_play',
      ok: true,
      summary: `Found "${top.trackName}" by ${top.artistName}. 30-sec preview ready; full song opens on YouTube${ytKey ? ' (exact video resolved)' : ' (search page — no key needed)'}.`,
      data: {
        query: args.query,
        tracks,
        topTrack: tracks[0],
        youtubeUrl: youtubeWatchUrl,
        previewPlayable: !!tracks[0]?.previewUrl,
        youtubeResolvedExactly: !!ytKey,
      },
      activity: {
        action: 'music.search',
        target: args.query,
        summary: `Otto searched for music: "${args.query}" — ${top.trackName} by ${top.artistName}.`,
        riskTier: 'low' as const,
      },
    }
  } catch (e) {
    return {
      name: 'music_play',
      ok: false,
      summary: `Music search failed: ${(e as Error).message}`,
      data: { error: (e as Error).message },
    }
  }
}

// ─── Weather (Open-Meteo — FREE, NO API KEY) ────────────────────────────────
async function toolWeather(args: { latitude?: number; longitude?: number; location?: string }) {
  try {
    let lat = args.latitude
    let lon = args.longitude

    // If location given instead of coords, geocode via Open-Meteo's geocoding API (also free, no key)
    if (!lat || !lon) {
      if (!args.location) {
        return { name: 'weather', ok: false, summary: 'Need either latitude/longitude or a location name.', data: { error: 'no location' } }
      }
      const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(args.location)}&count=1`, { signal: AbortSignal.timeout(10000) })
      const geoData = await geoRes.json()
      if (!geoData.results || geoData.results.length === 0) {
        return { name: 'weather', ok: false, summary: `Location "${args.location}" not found.`, data: { error: 'not found' } }
      }
      lat = geoData.results[0].latitude
      lon = geoData.results[0].longitude
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`

    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    const data = await res.json()

    const current = data.current
    const daily = data.daily

    const weatherCodes: Record<number, string> = {
      0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
      45: 'Fog', 48: 'Depositing rime fog', 51: 'Light drizzle', 53: 'Moderate drizzle',
      55: 'Dense drizzle', 61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
      71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow', 77: 'Snow grains',
      80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
      95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Severe thunderstorm with hail',
    }

    const weatherDesc = weatherCodes[current?.weather_code] || 'Unknown'

    return {
      name: 'weather',
      ok: true,
      summary: `Weather: ${weatherDesc}, ${current?.temperature_2m}°C (feels like ${current?.apparent_temperature}°C)`,
      data: {
        current: {
          temperature: current?.temperature_2m,
          feelsLike: current?.apparent_temperature,
          humidity: current?.relative_humidity_2m,
          windSpeed: current?.wind_speed_10m,
          condition: weatherDesc,
          precipitation: current?.precipitation,
        },
        forecast: daily ? {
          maxTemp: daily.temperature_2m_max?.[0],
          minTemp: daily.temperature_2m_min?.[0],
          precipitationProbability: daily.precipitation_probability_max?.[0],
        } : null,
        location: args.location || `${lat},${lon}`,
      },
      activity: {
        action: 'weather.check',
        target: args.location || `${lat},${lon}`,
        summary: `Otto checked the weather.`,
        riskTier: 'low' as const,
      },
    }
  } catch (e) {
    return { name: 'weather', ok: false, summary: `Weather check failed: ${(e as Error).message}`, data: { error: (e as Error).message } }
  }
}

// ─── News (APITube — free tier) ────────────────────────────────────────────
async function toolNewsSearch(args: { query?: string; category?: string }) {
  try {
    // Use Hacker News Algolia API (completely free, no key)
    if (!args.query) {
      const res = await fetch('https://hn.algolia.com/api/v1/news?tags=front_page', { signal: AbortSignal.timeout(10000) })
      const data = await res.json()
      const articles = (data.hits || []).slice(0, 10).map((h: any) => ({
        title: h.title,
        url: h.url,
        author: h.author,
        points: h.points,
        createdAt: h.created_at,
      }))
      return {
        name: 'news_search',
        ok: true,
        summary: `Top ${articles.length} news stories right now.`,
        data: { articles },
      }
    }

    const res = await fetch(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(args.query)}&tags=story&hitsPerPage=10`, { signal: AbortSignal.timeout(10000) })
    const data = await res.json()
    const articles = (data.hits || []).slice(0, 10).map((h: any) => ({
      title: h.title,
      url: h.url,
      author: h.author,
      points: h.points,
      createdAt: h.created_at,
    }))

    return {
      name: 'news_search',
      ok: true,
      summary: `Found ${articles.length} news articles about "${args.query}".`,
      data: { articles, query: args.query },
    }
  } catch (e) {
    return { name: 'news_search', ok: false, summary: `News search failed: ${(e as Error).message}`, data: { error: (e as Error).message } }
  }
}

// ─── Stocks & Crypto (FREE — CoinGecko + no key needed) ────────────────────
async function toolStockCrypto(args: { symbol?: string; type: 'stock' | 'crypto' }) {
  try {
    if (args.type === 'crypto') {
      // CoinGecko free API — no key needed
      const sym = (args.symbol || 'bitcoin').toLowerCase()
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(sym)}&vs_currencies=usd,inr&include_24hr_change=true&include_market_cap=true`, { signal: AbortSignal.timeout(10000) })
      const data = await res.json()

      const coin = (data as any)[sym]
      if (!coin) {
        return { name: 'stock_crypto', ok: false, summary: `Crypto "${args.symbol}" not found.`, data: { error: 'not found' } }
      }

      return {
        name: 'stock_crypto',
        ok: true,
        summary: `${args.symbol?.toUpperCase()}: $${coin.usd?.toLocaleString()} (${coin.usd_24h_change > 0 ? '+' : ''}${coin.usd_24h_change?.toFixed(2)}% 24h)`,
        data: {
          symbol: args.symbol?.toUpperCase(),
          priceUSD: coin.usd,
          priceINR: coin.inr,
          change24h: coin.usd_24h_change,
          marketCap: coin.usd_market_cap,
        },
      }
    }

    // Stocks — use Finnhub if key exists, otherwise return guidance
    const finnhubKey = process.env.FINNHUB_API_KEY
    if (!finnhubKey) {
      return {
        name: 'stock_crypto',
        ok: false,
        summary: 'Stock prices need a Finnhub API key (free at finnhub.io). Crypto prices work without any key.',
        data: { error: 'FINNHUB_API_KEY not set' },
      }
    }

    const stockSym = (args.symbol || 'AAPL').toUpperCase()
    const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(stockSym)}&token=${finnhubKey}`, { signal: AbortSignal.timeout(10000) })
    const data = await res.json()

    if (!data.c) {
      return { name: 'stock_crypto', ok: false, summary: `Stock "${args.symbol}" not found.`, data: { error: 'not found' } }
    }

    const change = data.dp
    return {
      name: 'stock_crypto',
      ok: true,
      summary: `${args.symbol?.toUpperCase()}: $${data.c?.toLocaleString()} (${change > 0 ? '+' : ''}${change?.toFixed(2)}%)`,
      data: {
        symbol: args.symbol?.toUpperCase(),
        currentPrice: data.c,
        change: data.d,
        changePercent: data.dp,
        high: data.h,
        low: data.l,
        open: data.o,
        prevClose: data.pc,
      },
    }
  } catch (e) {
    return { name: 'stock_crypto', ok: false, summary: `Price lookup failed: ${(e as Error).message}`, data: { error: (e as Error).message } }
  }
}

// ─── Translation (LibreTranslate — free, no key for public instance) ───────
async function toolTranslate(args: { text: string; targetLanguage: string; sourceLanguage?: string }) {
  try {
    const res = await fetch('https://libretranslate.com/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: args.text,
        source: args.sourceLanguage || 'auto',
        target: args.targetLanguage,
        format: 'text',
      }),
      signal: AbortSignal.timeout(15000),
    })
    const data = await res.json()

    if (data.translatedText) {
      return {
        name: 'translate',
        ok: true,
        summary: `Translated to ${args.targetLanguage}: "${data.translatedText.slice(0, 100)}"`,
        data: { translated: data.translatedText, source: args.sourceLanguage, target: args.targetLanguage },
      }
    }
    return { name: 'translate', ok: false, summary: `Translation failed: ${data.error || 'unknown'}`, data: { error: data.error } }
  } catch (e) {
    return { name: 'translate', ok: false, summary: `Translation failed: ${(e as Error).message}`, data: { error: (e as Error).message } }
  }
}

// ─── Wikipedia Lookup (FREE, no key) ────────────────────────────────────────
async function toolWikipedia(args: { query: string }) {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(args.query)}`, {
      headers: { 'User-Agent': 'OttoPerso/1.0' },
      signal: AbortSignal.timeout(10000),
    })

    if (res.status === 404) {
      return { name: 'wikipedia', ok: false, summary: `No Wikipedia article found for "${args.query}".`, data: { error: 'not found' } }
    }

    const data = await res.json()
    return {
      name: 'wikipedia',
      ok: true,
      summary: `Wikipedia: ${data.title} — ${data.extract?.slice(0, 200)}...`,
      data: {
        title: data.title,
        extract: data.extract,
        url: data.content_urls?.desktop?.page,
        thumbnail: data.thumbnail?.source,
      },
    }
  } catch (e) {
    return { name: 'wikipedia', ok: false, summary: `Wikipedia lookup failed: ${(e as Error).message}`, data: { error: (e as Error).message } }
  }
}

// ─── Currency Exchange (FREE — exchangerate-api, no key) ───────────────────
async function toolCurrencyConvert(args: { amount: number; from: string; to: string }) {
  try {
    const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${args.from.toUpperCase()}`, { signal: AbortSignal.timeout(10000) })
    const data = await res.json()

    const rate = data.rates?.[args.to.toUpperCase()]
    if (!rate) {
      return { name: 'currency_convert', ok: false, summary: `Currency ${args.to} not found.`, data: { error: 'not found' } }
    }

    const converted = args.amount * rate
    return {
      name: 'currency_convert',
      ok: true,
      summary: `${args.amount} ${args.from.toUpperCase()} = ${converted.toFixed(2)} ${args.to.toUpperCase()}`,
      data: { amount: args.amount, from: args.from.toUpperCase(), to: args.to.toUpperCase(), rate, converted },
    }
  } catch (e) {
    return { name: 'currency_convert', ok: false, summary: `Currency conversion failed: ${(e as Error).message}`, data: { error: (e as Error).message } }
  }
}

// ─── YouTube Search (videos — keyless web; optional API for structured) ────
// Search YouTube for ANY video: tutorials, talks, reviews, how-tos, music, etc.
// Keyless default opens a YouTube search-results page. If YOUTUBE_API_KEY is set
// (free, no card — YouTube Data API v3), returns structured video listings.
async function toolYouTubeSearch(args: { query: string; maxResults?: number }) {
  const ytKey = process.env.YOUTUBE_API_KEY
  const enc = encodeURIComponent
  if (ytKey) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${args.maxResults || 5}&q=${enc(args.query)}&key=${ytKey}`,
        { signal: AbortSignal.timeout(10000) },
      )
      const data = await res.json()
      const videos = (data.items || []).map((v: any) => ({
        title: v.snippet?.title,
        channel: v.snippet?.channelTitle,
        publishedAt: v.snippet?.publishedAt,
        description: v.snippet?.description?.slice(0, 200),
        videoId: v.id?.videoId,
        url: `https://www.youtube.com/watch?v=${v.id?.videoId}`,
        thumbnail: v.snippet?.thumbnails?.medium?.url,
      }))
      return {
        name: 'youtube_search',
        ok: true,
        summary: `Found ${videos.length} YouTube videos for "${args.query}".`,
        data: { query: args.query, videos, provider: 'youtube-api' },
        activity: { action: 'youtube.search', target: args.query, summary: `Otto searched YouTube for "${args.query}".`, riskTier: 'low' as const },
      }
    } catch { /* fall through to keyless */ }
  }
  // Keyless: open YouTube search results
  const searchUrl = `https://www.youtube.com/results?search_query=${enc(args.query)}`
  return {
    name: 'youtube_search',
    ok: true,
    summary: `Opened YouTube search for "${args.query}"${ytKey ? '' : ' (set YOUTUBE_API_KEY for structured results)'}.`,
    data: { query: args.query, provider: 'keyless-web', youtubeSearchUrl: searchUrl, note: 'Set YOUTUBE_API_KEY (free, no card) for structured video listings.' },
    activity: { action: 'youtube.search', target: args.query, summary: `Otto searched YouTube for "${args.query}".`, riskTier: 'low' as const },
  }
}

// ─── Books Search (Open Library — free, NO key) ────────────────────────────
async function toolBooksSearch(args: { query: string; maxResults?: number }) {
  try {
    const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(args.query)}&limit=${args.maxResults || 5}`, { signal: AbortSignal.timeout(10000) })
    const data = await res.json()
    const books = (data.docs || []).slice(0, args.maxResults || 5).map((b: any) => ({
      title: b.title,
      authors: b.author_name,
      firstPublishYear: b.first_publish_year,
      isbn: b.isbn?.[0],
      cover: b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg` : undefined,
      openLibraryUrl: `https://openlibrary.org${b.key}`,
      editions: b.edition_count,
    }))
    return {
      name: 'books_search',
      ok: true,
      summary: `Found ${books.length} books for "${args.query}".`,
      data: { query: args.query, books, provider: 'openlibrary' },
      activity: { action: 'books.search', target: args.query, summary: `Otto searched books for "${args.query}".`, riskTier: 'low' as const },
    }
  } catch (e) {
    return { name: 'books_search', ok: false, summary: `Book search failed: ${(e as Error).message}`, data: { error: (e as Error).message } }
  }
}

// ─── Public Holidays (Nager.Date — free, NO key) ───────────────────────────
async function toolPublicHolidays(args: { year: number; countryCode: string }) {
  try {
    const cc = (args.countryCode || 'US').toUpperCase()
    const res = await fetch(`https://date.nager.at/api/v3/publicholidays/${args.year}/${cc}`, { signal: AbortSignal.timeout(10000) })
    const data = await res.json()
    const holidays = (Array.isArray(data) ? data : []).slice(0, 25).map((h: any) => ({
      date: h.date,
      name: h.name,
      localName: h.localName,
      types: h.types,
      global: h.global,
    }))
    return {
      name: 'public_holidays',
      ok: true,
      summary: `Found ${holidays.length} public holidays in ${cc} for ${args.year}.`,
      data: { year: args.year, countryCode: cc, holidays, provider: 'nager.date' },
      activity: { action: 'holidays.lookup', target: `${cc} ${args.year}`, summary: `Otto looked up public holidays for ${cc} ${args.year}.`, riskTier: 'low' as const },
    }
  } catch (e) {
    return { name: 'public_holidays', ok: false, summary: `Holiday lookup failed: ${(e as Error).message}`, data: { error: (e as Error).message } }
  }
}

// ─── Flights Search (Travelpayouts — free, no credit card) ────────────────
async function toolFlightSearch(args: { from: string; to: string; date?: string; returnDate?: string }) {
  // Kiwi Tequila closed to new self-service developers (and Amadeus self-service
  // was decommissioned). Travelpayouts Data API is the free, no-credit-card
  // alternative: a free affiliate account + token, returns live flight prices.
  const tpToken = process.env.TRAVELPAYOUTS_TOKEN
  if (!tpToken) {
    return {
      name: 'flight_search',
      ok: false,
      summary: 'Flight search needs a free Travelpayouts token (no credit card — see .env.example). Pass airport codes (e.g. COK → BLR).',
      data: { error: 'TRAVELPAYOUTS_TOKEN not set', from: args.from, to: args.to },
    }
  }

  try {
    // args.from / args.to should be IATA airport codes (e.g. "COK", "BLR").
    // Accept either "COK" or "COK,India" — take the 3-letter code prefix.
    const code = (s: string) => (s || '').trim().slice(0, 3).toUpperCase()
    const origin = code(args.from)
    const destination = code(args.to)

    const params = new URLSearchParams({
      origin,
      destination,
      currency: 'usd',
      token: tpToken,
      sorting: 'price',
      limit: '5',
      direct: 'false',
    })
    if (args.date) params.set('depart_date', args.date)
    if (args.returnDate) params.set('return_date', args.returnDate)

    const res = await fetch(`https://api.travelpayouts.com/aviasales/v3/prices_for_dates?${params.toString()}`, { signal: AbortSignal.timeout(15000) })
    const data = await res.json()

    const items: any[] = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : [])
    if (items.length === 0) {
      return { name: 'flight_search', ok: true, summary: `No flights found from ${origin} to ${destination}.`, data: { flights: [], from: origin, to: destination } }
    }

    const flights = items.slice(0, 5).map((f: any) => ({
      price: f.price,
      currency: f.currency || 'usd',
      airline: f.airline,
      flightNumber: f.flight_number,
      departure: f.departure_at,
      returnDeparture: f.return_at,
      transfers: f.transfers,
      returnTransfers: f.return_transfers,
      durationMinutes: f.duration,
      link: f.link,
    }))

    return {
      name: 'flight_search',
      ok: true,
      summary: `Found ${flights.length} flights from ${origin} to ${destination}, from ${flights[0].currency.toUpperCase()} ${flights[0].price}.`,
      data: { flights, from: origin, to: destination, provider: 'travelpayouts' },
      activity: {
        action: 'flight.search',
        target: `${origin} → ${destination}`,
        summary: `Otto searched flights from ${origin} to ${destination}.`,
        riskTier: 'low' as const,
      },
    }
  } catch (e) {
    return { name: 'flight_search', ok: false, summary: `Flight search failed: ${(e as Error).message}`, data: { error: (e as Error).message } }
  }
}

// ─── Maps / Directions (Geoapify if key, else OSRM — both free, no card) ───
async function toolMapsDirections(args: { from: string; to: string; mode?: string }) {
  const mode = args.mode || 'drive'
  try {
    const fromG = await geoGeocodeFree(args.from)
    const toG = await geoGeocodeFree(args.to)
    if (!fromG || !toG) {
      return { name: 'maps_directions', ok: false, summary: 'Could not find one of the addresses.', data: { error: 'geocode failed' } }
    }

    const geoKey = process.env.GEOAPIFY_API_KEY
    let distanceM = 0, durationS = 0, routeMode = 'drive'

    if (geoKey) {
      try {
        const modeMap: Record<string, string> = { drive: 'drive', walk: 'walk', bike: 'bike', transit: 'transit' }
        routeMode = modeMap[mode] || 'drive'
        const res = await fetch(`https://api.geoapify.com/v1/routing?waypoints=${fromG.lat},${fromG.lon}|${toG.lat},${toG.lon}&mode=${routeMode}&apiKey=${geoKey}`, { signal: AbortSignal.timeout(15000) })
        const data = await res.json()
        if (data.features?.[0]?.properties) {
          distanceM = data.features[0].properties.distance
          durationS = data.features[0].properties.time
        }
      } catch { /* fall back to OSRM */ }
    }

    // Keyless fallback: OSRM (car routing only)
    if (!distanceM || !durationS) {
      const r = await geoRouteFree(fromG.lat, fromG.lon, toG.lat, toG.lon)
      if (r) { distanceM = r.distanceM; durationS = r.durationS; routeMode = mode === 'walk' || mode === 'bike' ? mode : 'drive' }
    }

    if (!distanceM) {
      return { name: 'maps_directions', ok: false, summary: 'Could not find a route.', data: { error: 'no route' } }
    }

    const durationMin = Math.round(durationS / 60)
    const distanceKm = (distanceM / 1000).toFixed(1)

    return {
      name: 'maps_directions',
      ok: true,
      summary: `Route from ${fromG.displayName.split(',')[0]} to ${toG.displayName.split(',')[0]}: ${distanceKm} km, ${Math.floor(durationMin / 60)}h ${durationMin % 60}m by ${routeMode}.`,
      data: {
        distance: `${distanceKm} km`,
        duration: `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`,
        durationMinutes: durationMin,
        distanceKm: Number(distanceKm),
        mode: routeMode,
        from: fromG.displayName,
        to: toG.displayName,
        provider: geoKey ? 'geoapify' : 'openstreetmap',
      },
      activity: {
        action: 'maps.directions',
        target: `${args.from} → ${args.to}`,
        summary: `Otto got directions from ${args.from} to ${args.to}.`,
        riskTier: 'low' as const,
      },
    }
  } catch (e) {
    return { name: 'maps_directions', ok: false, summary: `Directions failed: ${(e as Error).message}`, data: { error: (e as Error).message } }
  }
}

// ─── Catalog exported to the model ─────────────────────────────────────────
// ─── Otto Drive (personal mini-cloud files) ────────────────────────────────
async function toolDriveList(args: { limit?: number }) {
  const files = await db.driveFile.findMany({ orderBy: { createdAt: 'desc' }, take: args.limit || 25 })
  return {
    name: 'drive_list',
    ok: true,
    summary: `${files.length} file${files.length === 1 ? '' : 's'} in Otto Drive.`,
    data: { files: files.map((f) => ({ id: f.id, name: f.name, mime: f.mime, size: f.size, createdAt: f.createdAt, downloadUrl: `/api/drive/${f.id}` })) },
  }
}

async function toolDriveSave(args: { name: string; content: string; mime?: string }) {
  try {
    const id = randomUUID()
    const dir = process.env.OTTO_DRIVE_DIR || path.join(process.env.OTTO_WORKSPACE_ROOT || '/home/z/otto-workspace', 'drive')
    await fs.mkdir(dir, { recursive: true })
    const safe = args.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'file'
    const diskPath = path.join(dir, `${id}-${safe}`)
    await fs.writeFile(diskPath, args.content, 'utf-8')
    const size = Buffer.byteLength(args.content)
    const rec = await db.driveFile.create({
      data: { id, name: args.name, mime: args.mime || 'text/plain', size, path: diskPath, uploadedBy: 'otto' },
    })
    return {
      name: 'drive_save',
      ok: true,
      summary: `Saved "${args.name}" (${size} bytes) to Otto Drive — downloadable from any device on the account at /api/drive/${rec.id}.`,
      data: { id: rec.id, name: rec.name, size, downloadUrl: `/api/drive/${rec.id}` },
      activity: { action: 'drive.save', target: rec.id, summary: `Otto saved "${args.name}" to Drive.`, riskTier: 'low' as const },
    }
  } catch (e) {
    return { name: 'drive_save', ok: false, summary: `Drive save failed: ${(e as Error).message}`, data: { error: (e as Error).message } }
  }
}

// ─── Image generation (Gemini → Otto Drive) ────────────────────────────────
// Fills the DALL·E / album-art / design / tattoo-concept gap. Uses the same
// Gemini key Otto already has; the generated image lands in Otto Drive so it's
// on the user's mini-cloud, downloadable from any device.
// Providers: gemini (default, keyless-via-bundled-key), pollinations (fully
// keyless, no login), cloudflare (optional CF_ACCOUNT_ID + CF_API_TOKEN).
async function toolImageGenerate(args: { prompt: string; provider?: 'gemini' | 'pollinations' | 'cloudflare'; width?: number; height?: number }) {
  const provider = args.provider || 'gemini'
  try {
    let buf: Buffer
    let mime = 'image/png'
    if (provider === 'pollinations') {
      const w = args.width || 1024, h = args.height || 1024
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(args.prompt)}?width=${w}&height=${h}&nologo=true`
      const r = await fetch(url, { signal: AbortSignal.timeout(90_000) })
      if (!r.ok) throw new Error(`pollinations HTTP ${r.status}`)
      buf = Buffer.from(await r.arrayBuffer())
      mime = r.headers.get('content-type') || 'image/png'
    } else if (provider === 'cloudflare') {
      const acc = process.env.CF_ACCOUNT_ID, tok = process.env.CF_API_TOKEN
      if (!acc || !tok) throw new Error('Cloudflare provider needs CF_ACCOUNT_ID + CF_API_TOKEN env vars (free tier, no card — cloudflare.com)')
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acc}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
        method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: args.prompt }),
        signal: AbortSignal.timeout(90_000),
      })
      const d: any = await r.json()
      if (!d?.result?.image) throw new Error(d?.errors?.[0]?.message || 'cloudflare returned no image')
      buf = Buffer.from(d.result.image, 'base64')
    } else {
      const key = (await loadBrainConfig()).apiKey
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${key}`
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: args.prompt }] }], generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } }),
        signal: AbortSignal.timeout(60_000),
      })
      const data: any = await res.json()
      const part = data?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data)
      if (!part) throw new Error(data?.error?.message || 'no image returned')
      buf = Buffer.from(part.inlineData.data, 'base64')
      mime = part.inlineData.mimeType || 'image/png'
    }
    const id = randomUUID()
    const dir = process.env.OTTO_DRIVE_DIR || path.join(process.env.OTTO_WORKSPACE_ROOT || '/home/z/otto-workspace', 'drive')
    await fs.mkdir(dir, { recursive: true })
    const safe = (args.prompt.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40) || 'image')
    const ext = (mime.split('/')[1] || 'png').split(';')[0]
    const diskPath = path.join(dir, `${id}-${safe}.${ext}`)
    await fs.writeFile(diskPath, buf)
    const rec = await db.driveFile.create({ data: { id, name: `${safe}.${ext}`, mime, size: buf.length, path: diskPath, uploadedBy: 'otto' } })
    return {
      name: 'image_generate',
      ok: true,
      summary: `Generated an image (${provider}) for "${args.prompt}" and saved it to Otto Drive.`,
      data: { driveFileId: rec.id, downloadUrl: `/api/drive/${rec.id}`, prompt: args.prompt, provider, mime, size: buf.length },
      activity: { action: 'image.generate', target: rec.id, summary: `Otto generated an image (${provider}) for "${args.prompt.slice(0, 60)}".`, riskTier: 'low' as const },
    }
  } catch (e) {
    return { name: 'image_generate', ok: false, summary: `Image generation (${provider}) failed: ${(e as Error).message}`, data: { error: (e as Error).message, provider } }
  }
}

// ─── Music composition (keyless — Tone.js pattern → HTML player → Drive) ────
// Fills the Muse gap WITHOUT a paid API. Otto composes a Tone.js/Web Audio
// pattern for a vibe/genre, wraps it in a self-contained HTML player, and saves
// it to Drive. The user opens the HTML in any browser → the music plays.
// (Strudel/Tone.js-style generative music, browser-rendered.)
async function toolMusicCompose(args: { vibe: string; genre?: string; durationSec?: number }) {
  try {
    const genre = args.genre || 'lo-fi'
    const dur = Math.min(60, Math.max(8, args.durationSec || 16))
    // Otto (the brain) is expected to have written a Tone.js pattern as the vibe;
    // here we scaffold a deterministic generative pattern so the tool always
    // produces audible music even if the brain didn't pre-compose notes.
    const html = `<!doctype html><html><head><meta charset=utf-8><title>Otto · ${genre} · ${args.vibe}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.js"></script>
<style>body{margin:0;background:#0b0b12;color:#e8e8f0;font:14px system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh}
button{padding:12px 22px;border-radius:999px;border:none;background:#b794f4;color:#1a1030;font-weight:700;font-size:15px;cursor:pointer}
h2{font-weight:600}</style></head>
<body><h2>🎵 ${genre} — ${args.vibe}</h2><p style="color:#8a8aa0">Made by Otto · ${dur}s</p><button id=p>▶ Play</button>
<script>
const g=${JSON.stringify(genre)},v=${JSON.stringify(args.vibe)};
const scales={lofi:[0,2,3,5,7,8,10],ambient:[0,2,4,7,9],techno:[0,3,5,7,10],jazz:[0,2,3,5,7,9,10],chill:[0,2,4,5,7,9,11]};
const sc=scales[g]||scales.lofi;
document.getElementById('p').onclick=async()=>{
await Tone.start();const btn=document.getElementById('p');btn.textContent='⏹ Stop';btn.disabled=true;
const synth=new Tone.PolySynth(Tone.Synth,{oscillator:{type:g==='ambient'?'sine':'triangle'},envelope:{attack:0.4,decay:0.4,sustain:0.3,release:1.4}}).toDestination();
synth.volume.value=-12;
const rev=new Tone.Reverb({decay:4,wet:0.4}).toDestination();synth.connect(rev);
const root=261.63;let i=0;
const seq=new Tone.Loop((time)=>{const deg=sc[i%sc.length]+(Math.random()<0.2?12:0);const f=root*Math.pow(2,deg/12);synth.triggerAttackRelease(f,'8n',time);i++;},g==='techno'?'8n':'4n');
Tone.Transport.bpm.value=g==='techno'?124:g==='lofi'?78:90;
seq.start(0);Tone.Transport.start();
setTimeout(()=>{Tone.Transport.stop();seq.dispose();synth.dispose();btn.textContent='▶ Play';btn.disabled=false;},${dur*1000});
};
</script></body></html>`
    const id = randomUUID()
    const dir = process.env.OTTO_DRIVE_DIR || path.join(process.env.OTTO_WORKSPACE_ROOT || '/home/z/otto-workspace', 'drive')
    await fs.mkdir(dir, { recursive: true })
    const safe = (args.vibe.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 30) || 'track')
    const diskPath = path.join(dir, `${id}-${safe}-${genre}.html`)
    await fs.writeFile(diskPath, html, 'utf-8')
    const rec = await db.driveFile.create({ data: { id, name: `${safe}-${genre}.html`, mime: 'text/html', size: Buffer.byteLength(html), path: diskPath, uploadedBy: 'otto' } })
    return {
      name: 'music_compose',
      ok: true,
      summary: `Composed a ${genre} track for "${args.vibe}" (${dur}s) — saved an HTML player to Drive. Open it in a browser and hit Play.`,
      data: { driveFileId: rec.id, downloadUrl: `/api/drive/${rec.id}`, genre, vibe: args.vibe, durationSec: dur },
      activity: { action: 'music.compose', target: rec.id, summary: `Otto composed a ${genre} track for "${args.vibe}".`, riskTier: 'low' as const },
    }
  } catch (e) {
    return { name: 'music_compose', ok: false, summary: `Music compose failed: ${(e as Error).message}`, data: { error: (e as Error).message } }
  }
}

// ─── Video generation (2D presentation videos via HyperFrames) ──────────────
// Clones heygen-com/hyperframes (HTML→MP4, agent-native, Apache-2.0) into
// vendor/hyperframes. Otto writes an HTML/CSS/GSAP composition (the HyperFrames
// format), this tool runs `npx hyperframes render <file> --out <mp4>`, and the
// MP4 lands in Otto Drive. Requires Node + FFmpeg on the host (hyperframes
// bundles Puppeteer/Chrome). On Tharavad: nix profile install nixpkgs#ffmpeg.
async function toolVideoCreate(args: { html: string; title?: string }) {
  try {
    if (!args.html || !args.html.trim()) return { name: 'video_create', ok: false, summary: 'Need an HTML composition.', data: { error: 'no html' } }
    const { execFile } = await import('child_process')
    const id = randomUUID()
    const wsRoot = process.env.OTTO_WORKSPACE_ROOT || '/home/z/otto-workspace'
    const projDir = path.join(wsRoot, 'hyperframes-projects')
    await fs.mkdir(projDir, { recursive: true })
    const safe = (args.title || 'video').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40) || 'video'
    const inputPath = path.join(projDir, `${id}.html`)
    const outPath = path.join(projDir, `${id}-${safe}.mp4`)
    await fs.writeFile(inputPath, args.html, 'utf-8')
    // Render via the published hyperframes CLI (npx fetches it). FFmpeg must be on PATH.
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile('npx', ['-y', 'hyperframes', 'render', inputPath, '--out', outPath],
        { timeout: 300_000, maxBuffer: 4_000_000, env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1' } },
        (err: any, stdout: string, stderr: string) => {
          if (err) reject(new Error(`${err.message}\n${stderr.slice(-800)}`)); else resolve(stdout + stderr)
        })
    })
    let stat
    try { stat = await fs.stat(outPath) } catch { return { name: 'video_create', ok: false, summary: `Render ran but no MP4 was produced. Output:\n${stdout.slice(-600)}`, data: { error: 'no output mp4', logs: stdout.slice(-800) } } }
    // Move the MP4 into Otto Drive.
    const buf = await fs.readFile(outPath)
    const driveDir = process.env.OTTO_DRIVE_DIR || path.join(wsRoot, 'drive')
    await fs.mkdir(driveDir, { recursive: true })
    const diskPath = path.join(driveDir, `${id}-${safe}.mp4`)
    await fs.writeFile(diskPath, buf)
    const rec = await db.driveFile.create({ data: { id, name: `${safe}.mp4`, mime: 'video/mp4', size: stat.size, path: diskPath, uploadedBy: 'otto' } })
    return {
      name: 'video_create',
      ok: true,
      summary: `Rendered a 2D video "${args.title || safe}" and saved it to Otto Drive (${(stat.size / 1048576).toFixed(1)} MB).`,
      data: { driveFileId: rec.id, downloadUrl: `/api/drive/${rec.id}`, title: args.title || safe, sizeBytes: stat.size },
      activity: { action: 'video.create', target: rec.id, summary: `Otto rendered a 2D video "${args.title || safe}".`, riskTier: 'low' as const },
    }
  } catch (e) {
    return { name: 'video_create', ok: false, summary: `Video render failed: ${(e as Error).message}. Ensure hyperframes (npx fetches it) + ffmpeg are installed on the host.`, data: { error: (e as Error).message, hint: 'install: nix profile install nixpkgs#ffmpeg  (Tharavad)  /  apt-get install ffmpeg' } }
  }
}

// ─── Image analysis / vision (Gemini multimodal) ───────────────────────────
// Fills the vision gap — plant ID, recipe-from-photo, screenshot analysis,
// "describe this image", read a chart, etc. Takes a Drive file id or image URL.
async function toolImageAnalyze(args: { driveFileId?: string; imageUrl?: string; question: string }) {
  try {
    if (!args.driveFileId && !args.imageUrl) {
      return { name: 'image_analyze', ok: false, summary: 'Need a driveFileId or imageUrl.', data: { error: 'no image source' } }
    }
    let buf: Buffer
    let mime = 'image/png'
    if (args.driveFileId) {
      const f = await db.driveFile.findUnique({ where: { id: args.driveFileId } })
      if (!f) return { name: 'image_analyze', ok: false, summary: 'Drive file not found.', data: { error: 'not found' } }
      buf = await fs.readFile(f.path)
      mime = f.mime || mime
    } else {
      const r = await fetch(args.imageUrl!, { signal: AbortSignal.timeout(20_000) })
      buf = Buffer.from(await r.arrayBuffer())
      mime = r.headers.get('content-type') || mime
      if (!mime.startsWith('image/')) mime = 'image/png'
    }
    const b64 = buf.toString('base64')
    const key = (await loadBrainConfig()).apiKey
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(key)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
    const result = await model.generateContent([{ inlineData: { data: b64, mimeType: mime } }, { text: args.question }])
    const text = result.response.text()
    return {
      name: 'image_analyze',
      ok: true,
      summary: `Analyzed the image: ${text.slice(0, 120)}${text.length > 120 ? '…' : ''}`,
      data: { question: args.question, answer: text, source: args.driveFileId ? `drive:${args.driveFileId}` : args.imageUrl },
      activity: { action: 'image.analyze', target: args.driveFileId || args.imageUrl || '', summary: `Otto analyzed an image: ${args.question.slice(0, 60)}`, riskTier: 'low' as const },
    }
  } catch (e) {
    return { name: 'image_analyze', ok: false, summary: `Image analysis failed: ${(e as Error).message}`, data: { error: (e as Error).message } }
  }
}

// ─── Code Interpreter (run code on data) ───────────────────────────────────
// Fills the ChatGPT Code-Interpreter gap. JS runs in a Node `vm` sandbox (no
// require/fs/process — computation only); Python runs via `python3` child
// process with a timeout + sandboxed cwd + stripped env. Self-hosted personal
// security stance: fine for the user's own code; not a hardened multi-tenant
// sandbox. Otto composes code that embeds the data and runs it.
async function toolCodeRun(args: { language: 'javascript' | 'python'; code: string }) {
  const lang = (args.language || 'javascript').toLowerCase()
  if (lang === 'python') {
    const { execFile } = await import('child_process')
    return new Promise<ToolResult>((resolve) => {
      execFile(
        'python3', ['-c', args.code],
        { timeout: 15_000, maxBuffer: 2_000_000, cwd: process.env.OTTO_WORKSPACE_ROOT || '/tmp', env: { PATH: process.env.PATH || '', HOME: process.env.HOME || '' } } as any,
        (err: any, stdout: string, stderr: string) => {
          if (err && !stdout) {
            resolve({ name: 'code_run', ok: false, summary: `Python exited ${err.code || 'error'}: ${(stderr || err.message).slice(0, 200)}`, data: { language: 'python', stderr: stderr || err.message, stdout } })
          } else {
            resolve({ name: 'code_run', ok: true, summary: `Ran Python — output below.`, data: { language: 'python', stdout, stderr: stderr || '' } })
          }
        },
      )
    })
  }
  // JavaScript via vm sandbox
  const logs: string[] = []
  const sandbox: any = {
    console: { log: (...a: any[]) => logs.push(a.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' ')) },
    Math, JSON, Date, parseInt, parseFloat, isNaN, isFinite, String, Number, Boolean, Array, Object, RegExp, Error,
    result: undefined,
  }
  try {
    const ctx = vm.createContext(sandbox)
    vm.runInContext(args.code + '\n;', ctx, { timeout: 10_000, filename: 'otto-sandbox.js' })
    let result: any = sandbox.result
    if (result === undefined && logs.length === 0) result = '(no output — set `result` or use console.log)'
    const out = result !== undefined ? (typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)) : ''
    return {
      name: 'code_run',
      ok: true,
      summary: `Ran JavaScript — ${logs.length} log line(s)${result !== undefined ? ' + result' : ''}.`,
      data: { language: 'javascript', stdout: logs.join('\n'), result: out },
    }
  } catch (e) {
    return { name: 'code_run', ok: false, summary: `JavaScript error: ${(e as Error).message}`, data: { language: 'javascript', stderr: (e as Error).message, stdout: logs.join('\n') } }
  }
}

// ─── Computer Use (web browser automation via Playwright) ──────────────────
// Fills the Claude Computer-Use gap (web). Otto drives a headless Chromium:
// navigate, click, type, extract text, screenshot (saved to Drive), eval.
// Playwright is an OPTIONAL dep — dynamically imported. If not installed, the
// tool returns clear install instructions. Install: npm i playwright && npx
// playwright install chromium.
let _browserPage: any = null
async function getBrowserPage(): Promise<any> {
  if (_browserPage) return _browserPage
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  _browserPage = await ctx.newPage()
  return _browserPage
}

async function toolBrowserUse(args: { action: string; url?: string; selector?: string; text?: string; js?: string }) {
  let page: any
  try {
    page = await getBrowserPage()
  } catch (e: any) {
    return {
      name: 'browser_use',
      ok: false,
      summary: `Browser automation unavailable: ${e?.message || 'playwright not installed'}. Install it: npm i playwright && npx playwright install chromium`,
      data: { error: e?.message || 'playwright missing' },
    }
  }
  try {
    switch ((args.action || '').toLowerCase()) {
      case 'navigate':
        if (!args.url) return { name: 'browser_use', ok: false, summary: 'navigate needs a url.', data: { error: 'no url' } }
        await page.goto(args.url, { timeout: 30_000, waitUntil: 'domcontentloaded' })
        return { name: 'browser_use', ok: true, summary: `Navigated to ${args.url}.`, data: { url: args.url, title: await page.title() } }
      case 'click':
        if (!args.selector) return { name: 'browser_use', ok: false, summary: 'click needs a selector.', data: { error: 'no selector' } }
        await page.click(args.selector, { timeout: 10_000 })
        return { name: 'browser_use', ok: true, summary: `Clicked ${args.selector}.`, data: { selector: args.selector } }
      case 'type':
        if (!args.selector || args.text === undefined) return { name: 'browser_use', ok: false, summary: 'type needs selector + text.', data: { error: 'missing' } }
        await page.fill(args.selector, args.text, { timeout: 10_000 })
        return { name: 'browser_use', ok: true, summary: `Typed into ${args.selector}.`, data: { selector: args.selector, chars: args.text.length } }
      case 'press':
        if (!args.text) return { name: 'browser_use', ok: false, summary: 'press needs a key name in text.', data: { error: 'missing' } }
        await page.keyboard.press(args.text)
        return { name: 'browser_use', ok: true, summary: `Pressed ${args.text}.`, data: { key: args.text } }
      case 'extract':
        const text = await page.innerText(args.selector || 'body')
        return { name: 'browser_use', ok: true, summary: `Extracted ${text.length} chars.`, data: { text: text.slice(0, 8000), selector: args.selector || 'body' } }
      case 'title':
        return { name: 'browser_use', ok: true, summary: `Page title: ${await page.title()}`, data: { title: await page.title(), url: page.url() } }
      case 'screenshot': {
        const buf: Buffer = await page.screenshot({ fullPage: false })
        const id = randomUUID()
        const dir = process.env.OTTO_DRIVE_DIR || path.join(process.env.OTTO_WORKSPACE_ROOT || '/home/z/otto-workspace', 'drive')
        await fs.mkdir(dir, { recursive: true })
        const diskPath = path.join(dir, `${id}-screenshot.png`)
        await fs.writeFile(diskPath, buf)
        const rec = await db.driveFile.create({ data: { id, name: `screenshot-${Date.now()}.png`, mime: 'image/png', size: buf.length, path: diskPath, uploadedBy: 'otto' } })
        return { name: 'browser_use', ok: true, summary: `Screenshot saved to Drive.`, data: { driveFileId: rec.id, downloadUrl: `/api/drive/${rec.id}` }, activity: { action: 'browser.screenshot', target: rec.id, summary: `Otto took a browser screenshot.`, riskTier: 'low' as const } }
      }
      case 'eval':
        if (!args.js) return { name: 'browser_use', ok: false, summary: 'eval needs js.', data: { error: 'no js' } }
        const r = await page.evaluate(args.js)
        return { name: 'browser_use', ok: true, summary: `Evaluated JS in the page.`, data: { result: typeof r === 'object' ? JSON.stringify(r) : String(r) } }
      case 'close':
        try { await page.context().browser()?.close() } catch {}
        _browserPage = null
        return { name: 'browser_use', ok: true, summary: `Browser closed.`, data: {} }
      default:
        return { name: 'browser_use', ok: false, summary: `Unknown action "${args.action}". Use: navigate|click|type|press|extract|title|screenshot|eval|close.`, data: { error: 'unknown action' } }
    }
  } catch (e) {
    return { name: 'browser_use', ok: false, summary: `Browser action failed: ${(e as Error).message}`, data: { error: (e as Error).message } }
  }
}

// ─── Second Self (A) — Otto models YOU + acts as you ─────────────────────────
// Otto studies your writing (in its head) and stores a self-model: voice, style,
// preferences, relationships, routines. self_write stores the profile Otto
// composes; self_read loads it so Otto drafts/replies in YOUR voice. The chat
// system prompt also injects the self-model so Otto always "is you" when needed.
async function toolSelfWrite(args: { profile: string }) {
  try {
    await db.systemState.upsert({ where: { key: 'self_model' }, update: { value: args.profile }, create: { key: 'self_model', value: args.profile } })
    return { name: 'self_write', ok: true, summary: 'Saved your self-model. Otto will now draft + reply as you when asked.', data: { bytes: args.profile.length } }
  } catch (e) { return { name: 'self_write', ok: false, summary: `Self write failed: ${(e as Error).message}`, data: { error: (e as Error).message } } }
}
async function toolSelfRead() {
  const row = await db.systemState.findUnique({ where: { key: 'self_model' } })
  return { name: 'self_read', ok: true, summary: row ? 'Loaded your self-model — use it to draft/reply as me.' : 'No self-model yet. Study my writing (vault notes, sent emails, edits) then call self_write with a profile of my voice/style/preferences.', data: { profile: row?.value || '' } }
}

// ─── Managed Workforce (B) — dispatch your bot team in parallel + aggregate ──
// Otto decomposes a request into per-bot subtasks, this tool spawns each named
// user-created bot, runs them in parallel, awaits all, and returns aggregated
// results. The "AI org you manage" signature — vs a single chat.
async function toolWorkforceDispatch(args: { request: string; assignments: { botName: string; subtask: string }[] }) {
  try {
    const { runAgent } = await import('@/lib/agent-runtime')
    const bots = await db.customBot.findMany({ where: { isActive: true } })
    const byName = new Map(bots.map((b) => [b.name, b]))
    const results: any[] = []
    const refused: string[] = []
    await Promise.all(args.assignments.map(async (a) => {
      const bot = byName.get(a.botName)
      if (!bot) { refused.push(a.botName); return }
      const agent = await db.agent.create({ data: { name: bot.name, kind: 'worker', task: a.subtask, modelName: bot.modelName || 'gemini-3.5-flash-lite' } })
      try {
        const run = await runAgent(agent.id)
        results.push({ bot: bot.name, subtask: a.subtask, result: (run.result || '').slice(0, 1000) })
      } catch (e: any) {
        results.push({ bot: bot.name, subtask: a.subtask, result: `error: ${e.message}` })
      }
    }))
    return {
      name: 'workforce_dispatch',
      ok: results.length > 0,
      summary: `Dispatched ${results.length} bot${results.length === 1 ? '' : 's'}${refused.length ? `; refused ${refused.length} (not user-created: ${refused.join(', ')})` : ''}; aggregated results below.`,
      data: { request: args.request, results, refused },
      activity: { action: 'workforce.dispatch', target: results.map((r) => r.bot).join(','), summary: `Otto dispatched ${results.length} user bots for: ${args.request.slice(0, 80)}`, riskTier: 'medium' as const },
    }
  } catch (e) { return { name: 'workforce_dispatch', ok: false, summary: `Workforce dispatch failed: ${(e as Error).message}`, data: { error: (e as Error).message } } }
}

// ─── Predictive Anticipation (C) — learn routines + propose schedules ───────
// Scans recent tasks + activity for recurring patterns, returns proposals for
// always-on scheduled jobs. Otto/user approve → created via /api/schedules.
async function toolRoutineSuggest() {
  try {
    const tasks = await db.task.findMany({ orderBy: { createdAt: 'desc' }, take: 60, select: { title: true, createdAt: true } })
    const acts = await db.activityLog.findMany({ where: { action: 'chat.response' }, orderBy: { createdAt: 'desc' }, take: 60, select: { summary: true, createdAt: true } })
    // crude recurrence detection: lowercase keyword frequency over recent items
    const freq: Record<string, number> = {}
    const stop = new Set(['the','a','to','of','and','for','my','in','on','at','is','i','you','otto','with','from','that','this','it','as','be','are','was','do','me'])
    for (const t of [...tasks, ...acts]) {
      const text = (t as any).title || (t as any).summary || ''
      for (const w of String(text).toLowerCase().split(/\W+/)) {
        if (w.length > 3 && !stop.has(w)) freq[w] = (freq[w] || 0) + 1
      }
    }
    const recurring = Object.entries(freq).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 8)
    const proposals = recurring.map(([word, n]) => ({ keyword: word, occurrences: n, suggested: `Schedule a bot to handle "${word}" on a recurring interval (e.g. every 60–1440 min) — it appeared ${n}× recently.` }))
    return {
      name: 'routine_suggest',
      ok: true,
      summary: proposals.length ? `Found ${proposals.length} recurring pattern(s). Proposing always-on jobs.` : 'No strong recurring patterns yet — keep using Otto and routines will emerge.',
      data: { proposals, analyzedTasks: tasks.length, analyzedActivity: acts.length },
    }
  } catch (e) { return { name: 'routine_suggest', ok: false, summary: `Routine suggest failed: ${(e as Error).message}`, data: { error: (e as Error).message } } }
}

// ─── Outbound Agent (D) — Otto initiates contact to resolve a task ───────────
// Otto composes a message and sends it (email or sms) to a company/contact to
// resolve something on the user's behalf (cancel, dispute, confirm, book).
// Critical risk → autonomy system gates it. Reuses the configured email/sms.
async function toolOutboundResolve(args: { channel: 'email' | 'sms'; to: string; subject?: string; message: string; purpose: string }) {
  try {
    let sent: any
    if (args.channel === 'email') {
      if (!args.subject) return { name: 'outbound_resolve', ok: false, summary: 'Email channel needs a subject.', data: { error: 'no subject' } }
      sent = await toolEmailSend({ to: args.to, subject: args.subject, body: args.message })
    } else {
      sent = await toolSmsSend({ to: args.to, body: args.message.slice(0, 1600) })
    }
    return {
      name: 'outbound_resolve',
      ok: sent?.ok ?? true,
      summary: sent?.ok ? `Contacted ${args.to} via ${args.channel} to resolve: ${args.purpose}` : `Outbound resolve failed: ${sent?.summary || 'send error'}`,
      data: { channel: args.channel, to: args.to, purpose: args.purpose, sendResult: sent },
      activity: { action: 'outbound.resolve', target: args.to, summary: `Otto contacted ${args.to} (${args.channel}) to resolve: ${args.purpose}`, riskTier: 'critical' as const },
    }
  } catch (e) { return { name: 'outbound_resolve', ok: false, summary: `Outbound resolve failed: ${(e as Error).message}`, data: { error: (e as Error).message } } }
}

export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'vault_read',
    description: "Read notes from Otto's memory vault. Optionally filter by category (general|decision|preference|pattern|memory|recipe|log) or full-text query. Use this to recall what you know about the user before answering.",
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Optional category filter' },
        query: { type: 'string', description: 'Optional full-text search query' },
      },
    },
  },
  {
    name: 'vault_write',
    description: "Write a new Markdown note to Otto's memory vault. Use this when you learn something important about the user — a preference, decision, or pattern worth remembering. The note syncs to disk as an Obsidian-compatible .md file.",
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title (max 80 chars)' },
        body: { type: 'string', description: 'Markdown body' },
        category: { type: 'string', description: 'general|decision|preference|pattern|memory|recipe|log', default: 'general' },
        tags: { type: 'string', description: 'Comma-separated tags', default: '' },
      },
      required: ['title', 'body'],
    },
  },
  {
    name: 'task_create',
    description: 'Create a new task in Otto\'s task queue. Tasks can be assigned to agents, blocked by other tasks, and tracked through to completion.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'critical'] },
        blockedBy: { type: 'array', items: { type: 'string' }, description: 'Task IDs this task waits on' },
      },
      required: ['title'],
    },
  },
  {
    name: 'task_list',
    description: 'List all active tasks (queued, executing, planning, blocked, waiting_approval).',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'task_update',
    description: "Update a task's status or record its result.",
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        status: { type: 'string', enum: ['queued', 'planning', 'executing', 'waiting_approval', 'done', 'failed', 'cancelled', 'blocked'] },
        result: { type: 'string', description: 'Optional JSON outcome summary' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'agent_spawn',
    description: 'Spawn a user-created bot to handle a subtask. ONLY spawn bots the user has created and named in the Bots tab — Otto does NOT invent agent names. If unsure, call agent_list/bots first or ask the user. By default the bot auto-runs immediately: it thinks, calls tools, writes a result. Set autoRun=false to spawn idle.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of a bot the USER created in the Bots tab (must match exactly). Otto cannot invent names — if it doesn\'t match a user-created bot, the spawn is refused.' },
        kind: { type: 'string', description: 'worker|custom', default: 'worker' },
        task: { type: 'string', description: 'What this new brain should do — be specific, this becomes the brain\'s full instruction' },
        autoRun: { type: 'boolean', description: 'If true (default), the new brain starts thinking immediately. If false, it spawns idle and can be run later via /api/agents/[id]/run.', default: true },
      },
      required: ['name', 'task'],
    },
  },
  {
    name: 'agent_list',
    description: 'List all agents and their current status.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'agent_status',
    description: 'Check on a specific spawned agent by name or id. Returns its current status, recent activity, and any tasks/results. Use this when the user asks "what\'s happening with X?" or "is Fred done yet?" — you can ping workers mid-flight.',
    parameters: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID (if you have it)' },
        name: { type: 'string', description: 'Agent name (e.g. "Fred", "Inboxer")' },
      },
    },
  },
  {
    name: 'agent_spawn_multi',
    description: 'Spawn multiple user-created bots in one call — use when decomposing a complex request into parallel subtasks. Each `name` MUST be a bot the user created in the Bots tab — do NOT invent names. Any name that isn’t a user-created bot is refused. Each spawned bot auto-runs autonomously and writes a result. Example: for “check inbox, plan event, scan socials”, spawn the user’s bots (e.g. “Inboxer”, “Planner”, “Scout”) — only if the user created them.',
    parameters: {
      type: 'object',
      properties: {
        workers: {
          type: 'array',
          description: 'List of workers to spawn. Each needs a name and a focused task description.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Name of a bot the USER created in the Bots tab (must match exactly). Otto cannot invent names — if it doesn\'t match a user-created bot, the spawn is refused.' },
              task: { type: 'string', description: 'Focused, specific task for this worker. Be detailed — this is the worker\'s full instruction.' },
              kind: { type: 'string', description: 'worker|custom', default: 'worker' },
            },
            required: ['name', 'task'],
          },
        },
      },
      required: ['workers'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the web for current information. Use this when the user asks about something recent or you need a fact not in your memory.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        maxResults: { type: 'number', default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 'web_fetch',
    description: 'Fetch the content of a specific URL. Use this after web_search to read a particular page.',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
  },
  {
    name: 'activity_log',
    description: "Read Otto's recent action history (timeline). Useful for grounding yourself on what was just done.",
    parameters: {
      type: 'object',
      properties: { limit: { type: 'number', default: 10 } },
    },
  },
  {
    name: 'autonomy_get',
    description: "Read the user's current autonomy level. Use this before doing anything substantive so you know whether to ask first.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'recipe_list',
    description: 'List saved recipes (reusable automation workflows). Optionally filter by category.',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'reporting|research|file|email|scheduling|devops|custom' },
      },
    },
  },
  {
    name: 'recipe_create',
    description: 'Create a new reusable recipe (a multi-step automation workflow). Use this when the user describes a process they want to run repeatedly — break it into discrete steps with the tool each step would use.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short name like "Weekly digest"' },
        description: { type: 'string', description: 'What this recipe does and when to run it' },
        category: { type: 'string', description: 'reporting|research|file|email|scheduling|devops|custom', default: 'custom' },
        estMinutes: { type: 'number', description: 'Estimated runtime in minutes', default: 5 },
        steps: {
          type: 'array',
          description: 'Ordered list of steps',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string', description: 'Short verb-noun like "vault_read", "web_search", "send_email"' },
              description: { type: 'string', description: 'What this step does in plain English' },
              tool: { type: 'string', description: 'Which Otto tool this step would invoke (if any)' },
            },
          },
        },
      },
      required: ['title', 'description', 'steps'],
    },
  },
  {
    name: 'recipe_run',
    description: 'Run a saved recipe by ID. The recipe\'s steps are returned for inspection. In a full install, Otto executes each step on the user\'s machine.',
    parameters: {
      type: 'object',
      properties: {
        recipeId: { type: 'string' },
        inputs: { type: 'object', description: 'Optional inputs to pass to the recipe' },
      },
      required: ['recipeId'],
    },
  },
  {
    name: 'activity_log_custom',
    description: 'Write a custom entry to Otto\'s activity timeline. Use this when you do something that should appear in the timeline but isn\'t covered by another tool.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'e.g. "note.draft", "schedule.block"' },
        summary: { type: 'string' },
        target: { type: 'string' },
        riskTier: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
      },
      required: ['action', 'summary'],
    },
  },
  {
    name: 'system_state',
    description: 'Read or write a system state key (a small key-value store for cross-conversation state). If `value` is provided, sets; otherwise gets.',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'e.g. "last_daily_review", "draft_in_progress"' },
        value: { type: 'string', description: 'If provided, sets the value. If omitted, reads the current value.' },
      },
      required: ['key'],
    },
  },
  {
    name: 'web_page_reader',
    description: 'Read a web page using a cleaner text-extraction function (vs. raw web_fetch). Use this when you want the readable text of an article, not the raw HTML.',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
  },
  {
    name: 'phone_status',
    description: 'Check whether Otto has a phone number configured for SMS/calls. Call this before sms_send to know if SMS is possible.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'sms_send',
    description: 'Send an SMS message to a phone number. The user must have configured a phone provider (Telnyx/Twilio/Vonage/Plivo) in Settings. Real money is charged per message (~$0.004–0.008). Numbers must be in E.164 format (+15551234567). Use sparingly — this costs the user money.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'E.164 phone number, e.g. +15551234567' },
        body: { type: 'string', description: 'Message body (160 chars max for standard SMS)' },
      },
      required: ['to', 'body'],
    },
  },
  {
    name: 'email_status',
    description: 'Check whether Otto has an email provider configured. Call this before email_send to know if email is possible.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'email_send',
    description: 'Send an email. The user must have configured an email provider (Resend/SendGrid/SMTP) in Settings. Real money may be charged per email (~$0.0001–0.0005) depending on provider. Use for sending digests, reports, notifications.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject line' },
        body: { type: 'string', description: 'Email body — plain text or HTML' },
        isHtml: { type: 'boolean', description: 'If true, body is treated as HTML. Default false.', default: false },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'file_list',
    description: 'List files and directories in Otto\'s sandboxed workspace (/home/z/otto-workspace/). Pass an empty path or "/" for the root. Use this to see what files exist before reading or writing.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path within the workspace, e.g. "" for root, "reports/" for a subdir', default: '' },
      },
    },
  },
  {
    name: 'drive_list',
    description: 'List files in Otto Drive — the user\'s personal mini-cloud (files stored on the backend, accessible from any device on the account). Use when the user asks what files are in their drive / cloud.',
    parameters: { type: 'object', properties: { limit: { type: 'number', description: 'Max results (default 25)', default: 25 } } },
  },
  {
    name: 'drive_save',
    description: 'Save text content as a file in Otto Drive (the user\'s mini-cloud). The file is stored on the backend and downloadable from any device on the account. Use when Otto produces a draft/report/note the user should keep cross-device.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'File name, e.g. "q4-report.md"' },
        content: { type: 'string', description: 'The file contents (text)' },
        mime: { type: 'string', description: 'Optional MIME type, e.g. text/markdown', default: 'text/plain' },
      },
      required: ['name', 'content'],
    },
  },
  {
    name: 'image_generate',
    description: 'Generate an image from a text prompt and save it to Otto Drive. Providers: gemini (default, uses Otto\'s key), pollinations (fully keyless, no login — good fallback), cloudflare (Flux via Cloudflare Workers AI, needs CF_ACCOUNT_ID+CF_API_TOKEN). Use for: art, album art, logos, tattoo concepts, illustrations, mood boards, design.',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'What to draw, e.g. "a watercolor of a fox in a misty forest"' },
        provider: { type: 'string', enum: ['gemini', 'pollinations', 'cloudflare'], description: 'Image backend. pollinations = keyless.', default: 'gemini' },
        width: { type: 'number', description: 'Optional width (pollinations/cloudflare)', default: 1024 },
        height: { type: 'number', description: 'Optional height (pollinations/cloudflare)', default: 1024 },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'music_compose',
    description: 'Compose a short music track (keyless — Tone.js generative pattern in an HTML player saved to Drive). Genres: lofi, ambient, techno, jazz, chill. The user opens the saved HTML in a browser and hits Play. Use for: background music, a vibe, a quick jingle, focus music. No paid API.',
    parameters: {
      type: 'object',
      properties: {
        vibe: { type: 'string', description: 'The feeling, e.g. "rainy evening study" or "sunny morning energy"' },
        genre: { type: 'string', enum: ['lofi', 'ambient', 'techno', 'jazz', 'chill'], description: 'Genre/scale', default: 'lofi' },
        durationSec: { type: 'number', description: 'Length in seconds (8–60)', default: 16 },
      },
      required: ['vibe'],
    },
  },
  {
    name: 'video_create',
    description: 'Render a 2D presentation/explainer video from an HTML/CSS/GSAP composition using HyperFrames (heygen-com/hyperframes, vendored). Otto writes the HTML composition (animated slides, motion graphics, captions), the tool runs `hyperframes render` → MP4 → saved to Otto Drive. Great for pitch decks, explainers, launch teasers. Requires ffmpeg on the host (nix profile install nixpkgs#ffmpeg / apt-get install ffmpeg).',
    parameters: {
      type: 'object',
      properties: {
        html: { type: 'string', description: 'The full HyperFrames HTML composition (HTML + CSS + JS/GSAP animation)' },
        title: { type: 'string', description: 'Video title (used for the Drive file name)' },
      },
      required: ['html'],
    },
  },
  {
    name: 'image_analyze',
    description: 'Analyze/understand an image with Gemini vision. Pass a Drive file id or an image URL + a question. Use for: identify a plant from a photo, read a chart/screenshot, suggest a recipe from a fridge photo, describe an image, extract text from a photo, wardrobe suggestions from a photo, etc.',
    parameters: {
      type: 'object',
      properties: {
        driveFileId: { type: 'string', description: 'ID of a file in Otto Drive (from drive_list)' },
        imageUrl: { type: 'string', description: 'A public image URL (if no driveFileId)' },
        question: { type: 'string', description: 'What to ask about the image, e.g. "what plant is this?" or "read the text in this screenshot"' },
      },
      required: ['question'],
    },
  },
  {
    name: 'code_run',
    description: 'Run code to compute/transform data (Code-Interpreter-style). JavaScript runs in a sandboxed vm (no fs/require/process — math, JSON, arrays, etc.); Python runs via python3 if installed. Use for: analyze a dataset, crunch numbers, transform JSON/CSV, compute a formula, generate a table, verify math. Embed the data in the code you write. Set `result` or console.log to return output.',
    parameters: {
      type: 'object',
      properties: {
        language: { type: 'string', enum: ['javascript', 'python'], description: 'javascript (sandboxed vm, always available) or python (needs python3 on the host)', default: 'javascript' },
        code: { type: 'string', description: 'The code to run. For JS, set `result = ...` or console.log(). For Python, print() output is captured.' },
      },
      required: ['language', 'code'],
    },
  },
  {
    name: 'browser_use',
    description: "Computer Use for the web — drive a headless Chromium to navigate, click, type, extract text, screenshot, or eval JS on live pages. Actions: navigate(url), click(selector), type(selector,text), press(key), extract([selector]) -> text, title, screenshot (saved to Drive), eval(js), close. Use for: fill a form on a site that has no API, scrape a dynamic page, take a screenshot of a page, log in somewhere (with user consent). Requires Playwright installed on the host (npm i playwright && npx playwright install chromium) — the tool returns install instructions if missing.",
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['navigate', 'click', 'type', 'press', 'extract', 'title', 'screenshot', 'eval', 'close'], description: 'What to do' },
        url: { type: 'string', description: 'URL (for navigate)' },
        selector: { type: 'string', description: 'CSS selector (for click/type/extract)' },
        text: { type: 'string', description: 'Text to type, or key to press (e.g. "Enter")' },
        js: { type: 'string', description: 'JS to evaluate in the page (for eval)' },
      },
      required: ['action'],
    },
  },
  {
    name: 'self_read',
    description: 'Load the user\'s self-model (their writing voice, style, preferences, relationships, routines) so you can draft / reply / decide AS them. Call this before writing anything in the user\'s voice. If empty, study their vault notes + sent emails first, then call self_write to create the profile.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'self_write',
    description: 'Save/update the user\'s self-model — a profile of THEIR voice, style, phrasings, tone, preferences, key relationships, and recurring routines. You compose this after studying their writing (vault notes, emails, edits). Once saved, Otto drafts + replies as the user when asked. Keep it concise but specific (signature phrases, tone, do/don\'ts).',
    parameters: { type: 'object', properties: { profile: { type: 'string', description: 'The self-model profile (voice/style/preferences/relationships/routines)' } }, required: ['profile'] },
  },
  {
    name: 'workforce_dispatch',
    description: 'Dispatch a TEAM of user-created bots in parallel on one request — the managed-workforce signature. You decompose the request into per-bot subtasks (each botName MUST be a user-created bot), this tool spawns them, runs all in parallel, awaits results, and returns aggregated outputs. Use for complex multi-part requests (e.g. "triage inbox + draft reply + update CRM" → 3 bots).',
    parameters: {
      type: 'object',
      properties: {
        request: { type: 'string', description: 'The overall request being decomposed' },
        assignments: { type: 'array', items: { type: 'object', properties: { botName: { type: 'string' }, subtask: { type: 'string' } }, required: ['botName', 'subtask'] }, description: 'Per-bot subtasks. botName must match a user-created bot exactly.' },
      },
      required: ['request', 'assignments'],
    },
  },
  {
    name: 'routine_suggest',
    description: 'Predictive anticipation: scan the user\'s recent tasks + activity for recurring patterns and propose always-on scheduled jobs (so Otto pre-does routines before being asked). Returns proposals; create the ones the user approves via the schedules API / Always-on tab.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'outbound_resolve',
    description: 'Outbound agent: Otto INITIATES contact on the user\'s behalf to resolve a task — email or SMS a company/contact to cancel, dispute, confirm, book, follow up. You compose the message; this tool sends it via the configured email/sms provider. CRITICAL risk — only with user approval (autonomy gate).',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', enum: ['email', 'sms'], description: 'How to contact them' },
        to: { type: 'string', description: 'Email address or phone number' },
        subject: { type: 'string', description: 'Subject (email only)' },
        message: { type: 'string', description: 'The composed message to send' },
        purpose: { type: 'string', description: 'What this resolves, e.g. "cancel subscription X"' },
      },
      required: ['channel', 'to', 'message', 'purpose'],
    },
  },
  {
    name: 'file_read',
    description: 'Read the contents of a file from Otto\'s sandboxed workspace. Returns up to 12000 chars (truncated if longer). Path is relative to /home/z/otto-workspace/.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path, e.g. "notes/meeting-2026-11.md"' },
      },
      required: ['path'],
    },
  },
  {
    name: 'file_write',
    description: 'Write content to a file in Otto\'s sandboxed workspace. Creates parent directories if needed. Can append to existing files. Path is relative to /home/z/otto-workspace/. Use for drafts, reports, notes, code, logs.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path, e.g. "reports/q3-draft.md"' },
        content: { type: 'string', description: 'File content to write' },
        append: { type: 'boolean', description: 'If true, append to existing file instead of overwriting. Default false.', default: false },
      },
      required: ['path', 'content'],
    },
  },
  // ═══ REAL-WORLD ACTION TOOLS ═══════════════════════════════════════════
  {
    name: 'hotel_search',
    description: 'Search for hotels in a location. Returns name, address, stars, phone, website. FREE — works with no key (OpenStreetMap) or richer data if GEOAPIFY_API_KEY is set (also free, no card). Use when the user asks to book/find a hotel.',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City or area name, e.g. "San Francisco" or "near Times Square NYC"' },
        checkIn: { type: 'string', description: 'Check-in date (YYYY-MM-DD)' },
        checkOut: { type: 'string', description: 'Check-out date (YYYY-MM-DD)' },
        guests: { type: 'number', description: 'Number of guests', default: 1 },
        maxPrice: { type: 'number', description: 'Max price level (1=budget, 4=luxury)' },
      },
      required: ['location'],
    },
  },
  {
    name: 'restaurant_search',
    description: 'Search for restaurants in a location. Returns name, address, cuisine, phone, website. FREE — works with no key (OpenStreetMap) or richer data if GEOAPIFY_API_KEY is set (also free, no card). Use when the user asks to find a restaurant.',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City, area, or address' },
        cuisine: { type: 'string', description: 'Type of cuisine, e.g. "Italian", "Japanese", "Mexican"' },
        maxPrice: { type: 'number', description: 'Max price level (1-4)' },
        openNow: { type: 'boolean', description: 'Only show restaurants open now', default: false },
      },
      required: ['location'],
    },
  },
  {
    name: 'event_search',
    description: 'Search for events (concerts, sports, theater) in a city. KEYLESS by default — returns curated web-search links (Google, DuckDuckGo, Bandsintown) for real results with zero keys. If SEATGEEK_CLIENT_ID is set (free, no card — seatgeek.com/developer), returns structured event listings (name, date, venue, price, ticket URL). Use when the user asks about events/gigs/shows near a city.',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name' },
        date: { type: 'string', description: 'Date (YYYY-MM-DD)' },
        category: { type: 'string', description: 'Sports|Music|Arts & Theater|Film' },
        keyword: { type: 'string', description: 'Search keyword, e.g. "Taylor Swift"' },
      },
      required: ['location'],
    },
  },
  {
    name: 'calendar_book',
    description: 'Create a calendar event. Generates a standard .ics file that imports into Google Calendar, Apple Calendar, Outlook, or any calendar app. ZERO API keys needed. Use for scheduling meetings, reminders, events.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title' },
        startTime: { type: 'string', description: 'Start time (ISO 8601, e.g. 2026-01-15T19:00:00)' },
        endTime: { type: 'string', description: 'End time (ISO 8601)' },
        location: { type: 'string', description: 'Event location' },
        description: { type: 'string', description: 'Event description' },
      },
      required: ['title', 'startTime', 'endTime'],
    },
  },
  {
    name: 'payment_status',
    description: 'Check if payment is configured. Otto can charge cards via Stripe if configured. If not configured, tell the user to add a Stripe key in Settings.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'payment_charge',
    description: 'Charge a payment via Stripe. Creates a payment intent for the specified amount. REQUIRES STRIPE_SECRET_KEY in Settings. This is a HIGH RISK action — always confirm with the user before charging.',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Amount to charge (e.g. 189.00)' },
        currency: { type: 'string', description: 'Currency code, e.g. USD, EUR, INR', default: 'USD' },
        description: { type: 'string', description: 'What the payment is for' },
        customerEmail: { type: 'string', description: 'Customer email for receipt' },
      },
      required: ['amount', 'currency', 'description'],
    },
  },
  {
    name: 'ride_estimate',
    description: 'Get ride price estimates between two locations. FREE, no API key — geocodes addresses (OpenStreetMap) and routes them (OSRM), then estimates fares for auto/economy/comfort/XL tiers. Pass "from" and "to" as addresses, or start/end lat-lng. Estimates are ballpark figures based on typical global rates.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start address, e.g. "Kochi airport" or "MG Road, Bangalore"' },
        to: { type: 'string', description: 'Destination address' },
        startLatitude: { type: 'number', description: 'Optional start latitude (instead of from)' },
        startLongitude: { type: 'number', description: 'Optional start longitude' },
        endLatitude: { type: 'number', description: 'Optional end latitude (instead of to)' },
        endLongitude: { type: 'number', description: 'Optional end longitude' },
        currency: { type: 'string', description: 'Currency code for estimates, e.g. USD, INR, EUR', default: 'USD' },
      },
      required: [],
    },
  },
  {
    name: 'music_play',
    description: 'Search for music and play it. FREE, no API key — searches iTunes (returns track info + 30-sec playable preview) and opens the FULL song on YouTube. If YOUTUBE_API_KEY is set (also free, no card), Otto resolves the exact YouTube video; otherwise it opens a YouTube search page for the track. Use when the user asks to play/find a song.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Song name, artist, or album' },
        action: { type: 'string', enum: ['play', 'pause', 'next', 'search'], description: 'search=find songs, play/pause/next=control playback', default: 'search' },
      },
      required: ['query', 'action'],
    },
  },
  // ═══ NO-KEY-REQUIRED TOOLS (work immediately, zero setup) ═══════════════
  {
    name: 'weather',
    description: 'Get current weather + forecast for any location. Uses Open-Meteo — completely FREE, no API key needed. Supports city names or coordinates. Use when the user asks about weather.',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name, e.g. "Mumbai", "New York", "Kochi"' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
      },
    },
  },
  {
    name: 'news_search',
    description: 'Search news articles or get top headlines. Uses Hacker News Algolia API — completely FREE, no key. Use when the user asks "what\'s happening" or about recent news.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (optional — leave empty for top headlines)' },
        category: { type: 'string' },
      },
    },
  },
  {
    name: 'stock_crypto',
    description: 'Get stock or cryptocurrency prices. Crypto works FREE with no API key (CoinGecko). Stocks need FINNHUB_API_KEY (free at finnhub.io). Use when the user asks about prices.',
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol (AAPL, TSLA) or crypto ID (bitcoin, ethereum)' },
        type: { type: 'string', enum: ['stock', 'crypto'] },
      },
      required: ['symbol', 'type'],
    },
  },
  {
    name: 'translate',
    description: 'Translate text between languages. Uses LibreTranslate — FREE, no key needed. Supports 30+ languages.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to translate' },
        targetLanguage: { type: 'string', description: 'Target language code, e.g. "es", "fr", "hi", "ml"' },
        sourceLanguage: { type: 'string', description: 'Source language code (optional, auto-detected)' },
      },
      required: ['text', 'targetLanguage'],
    },
  },
  {
    name: 'wikipedia',
    description: 'Look up a topic on Wikipedia and get a summary. FREE, no key. Use for encyclopedic knowledge about people, places, things, concepts.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Topic to look up' },
      },
      required: ['query'],
    },
  },
  {
    name: 'currency_convert',
    description: 'Convert between currencies using real-time exchange rates. FREE, no key. Use when the user asks about exchange rates.',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Amount to convert' },
        from: { type: 'string', description: 'Source currency code, e.g. "USD"' },
        to: { type: 'string', description: 'Target currency code, e.g. "INR", "EUR"' },
      },
      required: ['amount', 'from', 'to'],
    },
  },
  {
    name: 'youtube_search',
    description: 'Search YouTube for ANY video (tutorials, talks, reviews, how-tos, music, documentaries). KEYLESS by default — opens a YouTube search page. If YOUTUBE_API_KEY is set (free, no card), returns structured video listings (title, channel, URL, thumbnail, description). Use when the user asks to find/watch a video on a topic.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for, e.g. "how to tie a tie" or "react hooks tutorial"' },
        maxResults: { type: 'number', description: 'Max results (1-10). Default 5. Only used if YOUTUBE_API_KEY is set.', default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 'books_search',
    description: 'Search for books by title/author/subject. FREE, no key — uses Open Library. Returns title, authors, first publish year, ISBN, cover image, Open Library link. Use when the user asks to find a book or look up a title.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Title, author, or subject, e.g. "Dune" or "Murakami"' },
        maxResults: { type: 'number', description: 'Max results (1-10). Default 5.', default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 'public_holidays',
    description: 'Get the list of public holidays for a country and year. FREE, no key — uses Nager.Date. Returns date, name, local name, type. Use for planning around holidays/travel.',
    parameters: {
      type: 'object',
      properties: {
        year: { type: 'number', description: 'Year, e.g. 2026' },
        countryCode: { type: 'string', description: 'ISO 2-letter country code, e.g. "US", "IN", "GB"' },
      },
      required: ['year', 'countryCode'],
    },
  },
  {
    name: 'flight_search',
    description: 'Search for flights between two airports (IATA codes, e.g. COK → BLR). Requires TRAVELPAYOUTS_TOKEN (free, no credit card — signup at travelpayouts.com). Returns price, airline, duration, transfers, booking link.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Origin airport code or city, e.g. "COK" or "Kochi"' },
        to: { type: 'string', description: 'Destination airport code or city' },
        date: { type: 'string', description: 'Departure date (YYYY-MM-DD)' },
        returnDate: { type: 'string', description: 'Return date (YYYY-MM-DD) for round trip' },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'maps_directions',
    description: 'Get directions between two addresses. Requires GEOAPIFY_API_KEY (free at geoapify.com, no credit card). Supports driving, walking, cycling, transit.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Starting address' },
        to: { type: 'string', description: 'Destination address' },
        mode: { type: 'string', enum: ['drive', 'walk', 'bike', 'transit'], default: 'drive' },
      },
      required: ['from', 'to'],
    },
  },
]

// ─── Dispatcher ────────────────────────────────────────────────────────────
export async function executeTool(call: ToolCall): Promise<ToolResult> {
  const a = call.args || {}
  try {
    switch (call.name) {
      case 'vault_read': return await toolVaultRead(a as any)
      case 'vault_write': return await toolVaultWrite(a as any)
      case 'task_create': return await toolTaskCreate(a as any)
      case 'task_list': return await toolTaskList()
      case 'task_update': return await toolTaskUpdate(a as any)
      case 'agent_spawn': return await toolAgentSpawn(a as any)
      case 'agent_list': return await toolAgentList()
      case 'agent_status': return await toolAgentStatus(a as any)
      case 'agent_spawn_multi': return await toolAgentSpawnMulti(a as any)
      case 'web_search': return await toolWebSearch(a as any)
      case 'web_fetch': return await toolWebFetch(a as any)
      case 'activity_log': return await toolActivityLog(a as any)
      case 'autonomy_get': return await toolAutonomyGet()
      case 'recipe_list': return await toolRecipeList(a as any)
      case 'recipe_create': return await toolRecipeCreate(a as any)
      case 'recipe_run': return await toolRecipeRun(a as any)
      case 'activity_log_custom': return await toolActivityLogCustom(a as any)
      case 'system_state': return await toolSystemState(a as any)
      case 'web_page_reader': return await toolWebPageReader(a as any)
      case 'phone_status': return await toolPhoneStatus()
      case 'sms_send': return await toolSmsSend(a as any)
      case 'email_status': return await toolEmailStatus()
      case 'email_send': return await toolEmailSend(a as any)
      case 'file_list': return await toolFileList(a as any)
      case 'drive_list': return await toolDriveList(a as any)
      case 'drive_save': return await toolDriveSave(a as any)
      case 'image_generate': return await toolImageGenerate(a as any)
      case 'music_compose': return await toolMusicCompose(a as any)
      case 'video_create': return await toolVideoCreate(a as any)
      case 'image_analyze': return await toolImageAnalyze(a as any)
      case 'code_run': return await toolCodeRun(a as any)
      case 'browser_use': return await toolBrowserUse(a as any)
      case 'self_read': return await toolSelfRead()
      case 'self_write': return await toolSelfWrite(a as any)
      case 'workforce_dispatch': return await toolWorkforceDispatch(a as any)
      case 'routine_suggest': return await toolRoutineSuggest()
      case 'outbound_resolve': return await toolOutboundResolve(a as any)
      case 'file_read': return await toolFileRead(a as any)
      case 'file_write': return await toolFileWrite(a as any)
      case 'hotel_search': return await toolHotelSearch(a as any)
      case 'restaurant_search': return await toolRestaurantSearch(a as any)
      case 'event_search': return await toolEventSearch(a as any)
      case 'calendar_book': return await toolCalendarBook(a as any)
      case 'payment_status': return await toolPaymentStatus()
      case 'payment_charge': return await toolPaymentCharge(a as any)
      case 'ride_estimate': return await toolRideEstimate(a as any)
      case 'music_play': return await toolMusicPlay(a as any)
      case 'weather': return await toolWeather(a as any)
      case 'news_search': return await toolNewsSearch(a as any)
      case 'stock_crypto': return await toolStockCrypto(a as any)
      case 'translate': return await toolTranslate(a as any)
      case 'wikipedia': return await toolWikipedia(a as any)
      case 'currency_convert': return await toolCurrencyConvert(a as any)
      case 'youtube_search': return await toolYouTubeSearch(a as any)
      case 'books_search': return await toolBooksSearch(a as any)
      case 'public_holidays': return await toolPublicHolidays(a as any)
      case 'flight_search': return await toolFlightSearch(a as any)
      case 'maps_directions': return await toolMapsDirections(a as any)
      default:
        return {
          name: call.name,
          ok: false,
          summary: `Unknown tool: ${call.name}`,
          data: { error: 'unknown tool' },
        }
    }
  } catch (e) {
    return {
      name: call.name,
      ok: false,
      summary: `Tool ${call.name} failed: ${(e as Error).message}`,
      data: { error: (e as Error).message },
    }
  }
}

// Gemini's functionDeclarations format
export function functionDeclarations() {
  return TOOL_DEFS.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }))
}
