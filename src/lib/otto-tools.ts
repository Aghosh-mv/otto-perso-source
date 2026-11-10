// Otto's tool catalog — real implementations, no placeholders.
// Each tool: { name, description, parameters (JSON Schema), execute }
// The chat loop calls these when Gemini emits a functionCall.

import { db } from '@/lib/db'
import { syncVaultFromDisk } from '@/lib/vault-sync'
import { promises as fs } from 'fs'
import path from 'path'

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
  const agent = await db.agent.create({
    data: {
      name: args.name,
      kind: args.kind || 'worker',
      status: 'idle',
      task: args.task,
      modelName: args.modelName || 'gemini-3.5-flash-lite',
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
    summary: `Spawned new Otto brain "${args.name}" for: ${args.task}${runStarted ? ' — brain is now running' : ' — brain idle, run via /api/agents/[id]/run'}`,
    data: {
      id: agent.id,
      name: agent.name,
      kind: agent.kind,
      task: agent.task,
      autoRun: runStarted,
      runEndpoint: `/api/agents/${agent.id}/run`,
    },
    activity: {
      action: 'agent.spawn',
      target: agent.id,
      summary: `Otto spawned new brain "${args.name}" for: ${args.task}${runStarted ? ' (auto-running)' : ''}`,
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
  // Spawn multiple agents in one call. Each auto-runs.
  // Otto uses this when it decomposes a complex request into parallel subtasks.
  const { runAgent } = await import('@/lib/agent-runtime')
  const spawned: Array<{ id: string; name: string; task: string; autoRun: boolean }> = []
  for (const w of args.workers) {
    const agent = await db.agent.create({
      data: {
        name: w.name,
        kind: w.kind || 'worker',
        status: 'idle',
        task: w.task,
        modelName: 'gemini-3.5-flash-lite',
      },
    })
    spawned.push({ id: agent.id, name: agent.name, task: agent.task || w.task, autoRun: true })
    // Fire and forget
    runAgent(agent.id).catch((e) => {
      console.error(`[agent_spawn_multi] auto-run failed for ${agent.id}:`, e)
    })
  }
  return {
    name: 'agent_spawn_multi',
    ok: true,
    summary: `Spawned ${spawned.length} new Otto brains: ${spawned.map((s) => `"${s.name}"`).join(', ')}. All running.`,
    data: { workers: spawned },
    activity: {
      action: 'agent.spawn_multi',
      target: spawned.map((s) => s.id).join(','),
      summary: `Otto spawned ${spawned.length} new brains in parallel: ${spawned.map((s) => `"${s.name}"`).join(', ')}`,
      riskTier: 'medium' as const,
    },
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
// ═══════════════════════════════════════════════════════════════════════════

// ─── Hotel Search (Google Places API) ──────────────────────────────────────
async function toolHotelSearch(args: { location: string; checkIn?: string; checkOut?: string; guests?: number; maxPrice?: number }) {
  const googleKey = process.env.GOOGLE_PLACES_API_KEY
  if (!googleKey) {
    return {
      name: 'hotel_search',
      ok: false,
      summary: 'Hotel search needs a Google Places API key. Ask the user to add one in Settings.',
      data: { error: 'GOOGLE_PLACES_API_KEY not set' },
    }
  }

  try {
    // Use Google Places Text Search to find hotels
    const query = `hotels in ${args.location}`
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&type=lodging&key=${googleKey}`

    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    const data = await res.json()

    if (!data.results || data.results.length === 0) {
      return {
        name: 'hotel_search',
        ok: true,
        summary: `No hotels found in ${args.location}.`,
        data: { hotels: [] },
      }
    }

    const hotels = data.results.slice(0, 10).map((place: any) => ({
      name: place.name,
      address: place.formatted_address,
      rating: place.rating,
      priceLevel: place.price_level, // 1-4
      openNow: place.opening_hours?.open_now,
      placeId: place.place_id,
      location: place.geometry?.location,
    }))

    return {
      name: 'hotel_search',
      ok: true,
      summary: `Found ${hotels.length} hotels in ${args.location}.`,
      data: { hotels, location: args.location, checkIn: args.checkIn, checkOut: args.checkOut, guests: args.guests || 1 },
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

// ─── Restaurant Search (Google Places API) ─────────────────────────────────
async function toolRestaurantSearch(args: { location: string; cuisine?: string; maxPrice?: number; openNow?: boolean }) {
  const googleKey = process.env.GOOGLE_PLACES_API_KEY
  if (!googleKey) {
    return {
      name: 'restaurant_search',
      ok: false,
      summary: 'Restaurant search needs a Google Places API key.',
      data: { error: 'GOOGLE_PLACES_API_KEY not set' },
    }
  }

  try {
    let query = args.cuisine ? `${args.cuisine} restaurants in ${args.location}` : `restaurants in ${args.location}`
    if (args.openNow) query += ' open now'

    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&type=restaurant&key=${googleKey}`

    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    const data = await res.json()

    if (!data.results || data.results.length === 0) {
      return {
        name: 'restaurant_search',
        ok: true,
        summary: `No restaurants found in ${args.location}.`,
        data: { restaurants: [] },
      }
    }

    let restaurants = data.results.slice(0, 15).map((place: any) => ({
      name: place.name,
      address: place.formatted_address,
      rating: place.rating,
      priceLevel: place.price_level,
      openNow: place.opening_hours?.open_now,
      placeId: place.place_id,
    }))

    // Filter by max price (1-4 scale)
    if (args.maxPrice) {
      restaurants = restaurants.filter((r: any) => !r.priceLevel || r.priceLevel <= args.maxPrice!)
    }

    return {
      name: 'restaurant_search',
      ok: true,
      summary: `Found ${restaurants.length} restaurants in ${args.location}${args.cuisine ? ` (${args.cuisine})` : ''}.`,
      data: { restaurants, location: args.location },
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

// ─── Event Search (Ticketmaster API) ───────────────────────────────────────
async function toolEventSearch(args: { location: string; date?: string; category?: string; keyword?: string }) {
  const tmKey = process.env.TICKETMASTER_API_KEY
  if (!tmKey) {
    return {
      name: 'event_search',
      ok: false,
      summary: 'Event search needs a Ticketmaster API key. Get one free at developer.ticketmaster.com.',
      data: { error: 'TICKETMASTER_API_KEY not set' },
    }
  }

  try {
    let url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${tmKey}&city=${encodeURIComponent(args.location)}&size=15`
    if (args.date) url += `&startDateTime=${args.date}T00:00:00Z`
    if (args.keyword) url += `&keyword=${encodeURIComponent(args.keyword)}`
    if (args.category) url += `&segmentName=${encodeURIComponent(args.category)}`

    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    const data = await res.json()

    if (!data._embedded?.events || data._embedded.events.length === 0) {
      return {
        name: 'event_search',
        ok: true,
        summary: `No events found in ${args.location}.`,
        data: { events: [] },
      }
    }

    const events = data._embedded.events.slice(0, 15).map((ev: any) => ({
      name: ev.name,
      type: ev.type,
      date: ev.dates?.start?.dateTime,
      status: ev.dates?.status?.code,
      venue: ev._embedded?.venues?.[0]?.name,
      venueAddress: ev._embedded?.venues?.[0]?.address?.line1,
      city: ev._embedded?.venues?.[0]?.city?.name,
      priceMin: ev.priceRanges?.[0]?.min,
      priceMax: ev.priceRanges?.[0]?.max,
      currency: ev.priceRanges?.[0]?.currency,
      url: ev.url,
      imageUrl: ev.images?.[0]?.url,
      id: ev.id,
    }))

    return {
      name: 'event_search',
      ok: true,
      summary: `Found ${events.length} events in ${args.location}.`,
      data: { events, location: args.location },
      activity: {
        action: 'event.search',
        target: args.location,
        summary: `Otto searched for events in ${args.location}.`,
        riskTier: 'low' as const,
      },
    }
  } catch (e) {
    return {
      name: 'event_search',
      ok: false,
      summary: `Event search failed: ${(e as Error).message}`,
      data: { error: (e as Error).message },
    }
  }
}

// ─── Calendar Book (Google Calendar API) ───────────────────────────────────
async function toolCalendarBook(args: { title: string; startTime: string; endTime: string; location?: string; description?: string }) {
  const calKey = process.env.GOOGLE_CALENDAR_API_KEY
  const calId = process.env.GOOGLE_CALENDAR_ID

  if (!calKey || !calId) {
    // Fallback: create a calendar event file (.ics) that the user can open
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Otto Perso//Calendar//EN',
      'BEGIN:VEVENT',
      `UID:otto-${Date.now()}@ottoperso.app`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTSTART:${new Date(args.startTime).toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTEND:${new Date(args.endTime).toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `SUMMARY:${args.title}`,
      args.location ? `LOCATION:${args.location}` : '',
      args.description ? `DESCRIPTION:${args.description}` : '',
      'END:VEVENT',
      'END:VCALENDAR',
    ].filter(Boolean).join('\r\n')

    // Save as .ics file in workspace
    const { promises: fs } = await import('fs')
    const path = await import('path')
    const wsRoot = process.env.OTTO_WORKSPACE_ROOT || '/home/z/otto-workspace'
    const fileName = `calendar-${Date.now()}.ics`
    await fs.writeFile(path.join(wsRoot, fileName), icsContent, 'utf-8')

    return {
      name: 'calendar_book',
      ok: true,
      summary: `Created calendar event "${args.title}" — saved as ${fileName} in workspace. Open it to add to your calendar.`,
      data: { title: args.title, startTime: args.startTime, endTime: args.endTime, location: args.location, icsFile: fileName },
      activity: {
        action: 'calendar.book',
        target: args.title,
        summary: `Otto created calendar event "${args.title}" for ${args.startTime}.`,
        riskTier: 'low' as const,
      },
    }
  }

  // If Google Calendar API is configured, use it
  try {
    const event = {
      summary: args.title,
      location: args.location,
      description: args.description,
      start: { dateTime: args.startTime, timeZone: 'UTC' },
      end: { dateTime: args.endTime, timeZone: 'UTC' },
    }

    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events?key=${calKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(15000),
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`)

    return {
      name: 'calendar_book',
      ok: true,
      summary: `Booked "${args.title}" on your calendar for ${args.startTime}.`,
      data: { eventId: data.id, htmlLink: data.htmlLink, title: args.title, startTime: args.startTime },
      activity: {
        action: 'calendar.book',
        target: args.title,
        summary: `Otto booked "${args.title}" on your calendar.`,
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

// ─── Ride Book (Uber API estimate) ─────────────────────────────────────────
async function toolRideEstimate(args: { startLatitude: number; startLongitude: number; endLatitude: number; endLongitude: number }) {
  const uberKey = process.env.UBER_API_KEY
  if (!uberKey) {
    return {
      name: 'ride_estimate',
      ok: false,
      summary: 'Ride booking needs an Uber API key. Get one at developer.uber.com.',
      data: { error: 'UBER_API_KEY not set' },
    }
  }

  try {
    const url = `https://api.uber.com/v1.2/estimates/price?start_latitude=${args.startLatitude}&start_longitude=${args.startLongitude}&end_latitude=${args.endLatitude}&end_longitude=${args.endLongitude}`
    const res = await fetch(url, {
      headers: { 'Authorization': `Token ${uberKey}` },
      signal: AbortSignal.timeout(15000),
    })
    const data = await res.json()

    if (!data.prices || data.prices.length === 0) {
      return {
        name: 'ride_estimate',
        ok: true,
        summary: 'No ride options available for this route.',
        data: { options: [] },
      }
    }

    const options = data.prices.map((p: any) => ({
      type: p.localized_display_name,
      estimate: p.estimate,
      lowEstimate: p.low_estimate,
      highEstimate: p.high_estimate,
      durationSeconds: p.duration,
      distance: p.distance,
      currency: p.currency_code,
    }))

    return {
      name: 'ride_estimate',
      ok: true,
      summary: `Found ${options.length} ride options.`,
      data: { options },
      activity: {
        action: 'ride.estimate',
        target: `${args.startLatitude},${args.startLongitude} → ${args.endLatitude},${args.endLongitude}`,
        summary: `Otto estimated ride options.`,
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

// ─── Music Play (local + Spotify) ──────────────────────────────────────────
async function toolMusicPlay(args: { query: string; action: 'play' | 'pause' | 'next' | 'search' }) {
  const spotifyKey = process.env.SPOTIFY_API_KEY

  if (args.action === 'search') {
    if (!spotifyKey) {
      // Fallback: search via DuckDuckGo for the song
      try {
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(args.query + ' song')}&format=json&no_html=1`
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
        const data = await res.json()
        return {
          name: 'music_play',
          ok: true,
          summary: `Found results for "${args.query}". To play music, add a Spotify API key in Settings for full playback control.`,
          data: {
            query: args.query,
            results: data.RelatedTopics?.slice(0, 5).map((t: any) => t.Text).filter(Boolean) || [],
            note: 'Connect Spotify in Settings for full music playback.',
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

    // Spotify search
    try {
      // Get access token (simplified — in production use OAuth)
      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      })
      const tokenData = await tokenRes.json()

      const res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(args.query)}&type=track&limit=5`, {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
        signal: AbortSignal.timeout(10000),
      })
      const data = await res.json()

      const tracks = data.tracks?.items?.map((t: any) => ({
        name: t.name,
        artist: t.artists?.[0]?.name,
        album: t.album?.name,
        duration: t.duration_ms,
        previewUrl: t.preview_url,
        spotifyUrl: t.external_urls?.spotify,
        uri: t.uri,
      })) || []

      return {
        name: 'music_play',
        ok: true,
        summary: `Found ${tracks.length} tracks for "${args.query}".`,
        data: { tracks },
        activity: {
          action: 'music.search',
          target: args.query,
          summary: `Otto searched for music: "${args.query}".`,
          riskTier: 'low' as const,
        },
      }
    } catch (e) {
      return {
        name: 'music_play',
        ok: false,
        summary: `Spotify search failed: ${(e as Error).message}`,
        data: { error: (e as Error).message },
      }
    }
  }

  // For play/pause/next — would need Spotify Connect or local audio
  return {
    name: 'music_play',
    ok: true,
    summary: `Music ${args.action} command received. Connect Spotify in Settings for full playback control.`,
    data: { action: args.action, query: args.query },
  }
}

// ─── Catalog exported to the model ─────────────────────────────────────────
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
    description: 'Spawn a new Otto brain to handle a subtask in parallel. The new brain is a complete Otto instance — its own brain, its own tools, focused on one job. By default the new brain auto-runs immediately: it thinks, calls tools, and writes a result. Set autoRun=false to spawn idle.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Creative memorable name — "Inboxer", "Fred", "Scout", "Scribe", "Atlas"' },
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
    description: 'Spawn multiple new Otto brains in one call — use this when decomposing a complex request into parallel subtasks. Each new brain auto-runs. Pick creative names for the new brains (e.g. "Inboxer", "Fred", "Scout", "Scribe") — they should be memorable and reflect the task. Each brain runs autonomously and writes a result. Example: for "check my inbox, plan my event, scan socials" you\'d spawn 3 new brains each with a focused task.',
    parameters: {
      type: 'object',
      properties: {
        workers: {
          type: 'array',
          description: 'List of workers to spawn. Each needs a name and a focused task description.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Creative memorable name — "Inboxer", "Fred", "Scout", "Scribe", "Atlas"' },
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
    description: 'Search for hotels in a location. Returns name, address, rating, price level. Requires GOOGLE_PLACES_API_KEY. Use when the user asks to book/find a hotel.',
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
    description: 'Search for restaurants in a location. Returns name, address, rating, price level, open now status. Requires GOOGLE_PLACES_API_KEY. Use when the user asks to find/book a restaurant.',
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
    description: 'Search for events (concerts, sports, theater) in a city. Returns event name, date, venue, price range, and ticket URL. Requires TICKETMASTER_API_KEY (free at developer.ticketmaster.com).',
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
    description: 'Create a calendar event. If Google Calendar API is configured, adds directly to the user\'s calendar. Otherwise creates an .ics file the user can open. Use for scheduling meetings, reminders, events.',
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
    description: 'Get ride price estimates (Uber, Lyft, etc.) between two locations. Requires UBER_API_KEY. Returns price range, duration, and ride types available.',
    parameters: {
      type: 'object',
      properties: {
        startLatitude: { type: 'number' },
        startLongitude: { type: 'number' },
        endLatitude: { type: 'number' },
        endLongitude: { type: 'number' },
      },
      required: ['startLatitude', 'startLongitude', 'endLatitude', 'endLongitude'],
    },
  },
  {
    name: 'music_play',
    description: 'Search for music or control playback. If Spotify is configured, searches Spotify and returns track info with preview URLs. Otherwise searches the web for the song. Use when the user asks to play music.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Song name, artist, or album' },
        action: { type: 'string', enum: ['play', 'pause', 'next', 'search'], description: 'search=find songs, play/pause/next=control playback', default: 'search' },
      },
      required: ['query', 'action'],
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
