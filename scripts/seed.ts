// Otto Perso — seed script
// Run with: bun run scripts/seed.ts
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  console.log('→ Seeding Otto Perso…')

  // ── Autonomy levels ─────────────────────────────────────────────────
  const autonomy = [
    {
      level: 1,
      name: 'Ask Before Editing',
      tagline: 'Maximum control. Otto suggests, you decide.',
      canDo: ['Read files and screens', 'Draft proposals for review', 'Search the web', 'Browse the vault', 'Plan tasks'],
      cannotDo: ['Make any edit without approval', 'Send anything', 'Spawn worker agents', 'Touch credentials'],
      warnings: [],
    },
    {
      level: 2,
      name: 'Mild Edits Only',
      tagline: 'Safe, low-impact corrections on autopilot.',
      canDo: ['Everything in Level 1', 'Fix typos and formatting', 'Reorganize files into folders', 'Tag and re-categorize vault notes', 'Draft and queue (not send) emails'],
      cannotDo: ['Content rewrites', 'Send communications', 'Spend or book anything', 'Delete files', 'Spawn worker agents'],
      warnings: [],
    },
    {
      level: 3,
      name: 'Chosen Edits',
      tagline: 'You specify, Otto executes precisely.',
      canDo: ['Everything in Level 2', 'Execute your explicitly chosen edits', 'Run saved recipes', 'Spawn up to 2 worker agents for research'],
      cannotDo: ['Edits outside your spec', 'Send without final approval', 'Spend without 2FA', 'Modify system files'],
      warnings: [],
    },
    {
      level: 4,
      name: 'Bypass All Approvals',
      tagline: 'Otto moves fast. Review the timeline later.',
      canDo: ['Everything in Level 3', 'Edit any file you own', 'Send drafted emails', 'Spawn worker agents freely', 'Operate while screen is locked (background only)'],
      cannotDo: ['Touch banking or money movement', 'Permanently delete without snapshot', 'Disable its own audit log', 'Spend above daily budget'],
      warnings: [
        'Otto will act on its judgment. Review the activity timeline at least daily.',
        'A 24-hour rollback window applies to all actions.',
      ],
    },
    {
      level: 5,
      name: 'Vacation Mode',
      tagline: 'Otto takes full charge of your digital life. Beta.',
      canDo: ['Everything in Level 4', 'Manage inbox and replies', 'Schedule and reschedule', 'Run overnight and while sleeping', 'Proactively initiate routine work', 'Coordinate multiple worker agents'],
      cannotDo: ['Move money (above $0 budget)', 'Sign legal documents', 'Permanently delete anything', 'Disable the emergency stop', 'Hide its own activity'],
      warnings: [
        'BETA. Otto will run your digital life with minimal input.',
        'Not recommended for critical or irreversible tasks.',
        'Set action budgets before enabling. Review activity twice daily.',
        'Emergency Stop (Ctrl+Shift+Esc or mobile button) halts everything instantly.',
      ],
    },
  ]

  for (const a of autonomy) {
    await db.autonomySetting.upsert({
      where: { level: a.level },
      update: {
        name: a.name,
        tagline: a.tagline,
        canDo: JSON.stringify(a.canDo),
        cannotDo: JSON.stringify(a.cannotDo),
        warnings: JSON.stringify(a.warnings),
        isCurrent: a.level === 2,
      },
      create: {
        level: a.level,
        name: a.name,
        tagline: a.tagline,
        canDo: JSON.stringify(a.canDo),
        cannotDo: JSON.stringify(a.cannotDo),
        warnings: JSON.stringify(a.warnings),
        isCurrent: a.level === 2,
      },
    })
  }
  console.log(`  ✓ ${autonomy.length} autonomy levels`)

  // ── Agents ──────────────────────────────────────────────────────────
  await db.agent.deleteMany({})
  const mainAgent = await db.agent.create({
    data: {
      id: 'otto-main',
      name: 'Otto',
      kind: 'main',
      status: 'idle',
      modelName: 'qwen3-coder-32b (local)',
      task: 'Awaiting instructions',
      confidence: 0.92,
    },
  })
  const workers = [
    { name: 'Scout', task: 'Monitoring inbox', status: 'executing', confidence: 0.88 },
    { name: 'Archivist', task: 'Indexing vault notes', status: 'executing', confidence: 0.94 },
    { name: 'Scribe', task: 'Drafting weekly digest', status: 'thinking', confidence: 0.71 },
  ]
  for (const w of workers) {
    await db.agent.create({
      data: {
        name: w.name,
        kind: 'worker',
        status: w.status,
        parentId: mainAgent.id,
        modelName: 'qwen3-coder-32b (local)',
        task: w.task,
        confidence: w.confidence,
      },
    })
  }
  await db.agent.create({
    data: {
      name: 'Manus-cue',
      kind: 'custom',
      status: 'idle',
      modelName: 'custom endpoint',
      task: 'Available',
      confidence: 0,
    },
  })
  console.log(`  ✓ 5 agents`)

  // ── Tasks ───────────────────────────────────────────────────────────
  await db.task.deleteMany({})
  const tasks = [
    { title: 'Compile Q3 competitor analysis', status: 'executing', priority: 'high', runMode: 'parallel', autonomyLevel: 3 },
    { title: 'Reply to investor follow-up emails', status: 'waiting_approval', priority: 'high', runMode: 'foreground', autonomyLevel: 2 },
    { title: 'Reorganize ~/Downloads into project folders', status: 'executing', priority: 'normal', runMode: 'background', autonomyLevel: 3 },
    { title: 'Draft onboarding doc for new hire', status: 'queued', priority: 'normal', runMode: 'foreground', autonomyLevel: 2 },
    { title: 'Snapshot vault before weekly backup', status: 'done', priority: 'low', runMode: 'background', autonomyLevel: 4 },
    { title: 'Research three Notion alternatives', status: 'queued', priority: 'normal', runMode: 'parallel', autonomyLevel: 2 },
    { title: 'Cancel unused SaaS subscriptions', status: 'failed', priority: 'normal', runMode: 'foreground', autonomyLevel: 3 },
  ]
  for (const t of tasks) {
    await db.task.create({ data: t })
  }
  console.log(`  ✓ ${tasks.length} tasks`)

  // ── Vault notes ─────────────────────────────────────────────────────
  await db.vaultNote.deleteMany({})
  const notes = [
    {
      title: 'Working style — concise, evidence-led',
      category: 'preference',
      tags: 'writing,communication',
      body: 'Owner prefers concise, evidence-led communication. Avoid hedging language. Numbers > adjectives. Bullet points acceptable for lists of 3+ items. Sign emails with first name only.',
      frontmatter: { type: 'preference', confidence: 0.95, source: 'observed', occurrences: 47 },
      pinned: true,
    },
    {
      title: 'Decision — switched primary browser to Arc',
      category: 'decision',
      tags: 'tools,browser',
      body: '2026-10-12 — Moved primary browser from Chrome to Arc for workspace organization. Otto should target Arc profile "Otto-Session" for automation, not the user\'s main profile.',
      frontmatter: { type: 'decision', date: '2026-10-12', reversible: true },
      pinned: true,
    },
    {
      title: 'Pattern — Q3 reports start around the 15th',
      category: 'pattern',
      tags: 'finance,reporting,cadence',
      body: 'Observed over 6 quarters: owner begins gathering Q3 report materials around the 15th of the month. Proactively suggest pulling competitor financials and prior-year comparisons on the 13th.',
      frontmatter: { type: 'pattern', confidence: 0.83, next_trigger: '2026-11-13' },
    },
    {
      title: 'Memory — investor list with preferences',
      category: 'memory',
      tags: 'investors,communication',
      body: 'Active investors: \n- M. Chen (prefers monthly written updates, no calls)\n- K. Okafor (OK with quarterly, likes dashboards)\n- L. Rivera (wants rough drafts 48h before formal send)\n\nDo not cc all three on the same email.',
      frontmatter: { type: 'memory', sensitivity: 'high', last_verified: '2026-10-28' },
    },
    {
      title: 'Recipe log — weekly digest automation',
      category: 'log',
      tags: 'recipe,digest,automation',
      body: 'Ran weekly-digest recipe 14 times since 2026-08. Median runtime: 7m 22s. Failed twice (both on email-send step due to 2FA prompt). Confidence high.',
      frontmatter: { type: 'log', runs: 14, success_rate: 0.857 },
    },
    {
      title: 'Preference — do not auto-archive read emails',
      category: 'preference',
      tags: 'email,inbox',
      body: 'Owner explicitly dislikes auto-archiving. Leave read emails in inbox. Only archive when explicitly told or after 30 days untouched.',
      frontmatter: { type: 'preference', confidence: 1.0, source: 'explicit' },
    },
  ]
  for (const n of notes) {
    await db.vaultNote.create({
      data: {
        title: n.title,
        category: n.category,
        tags: n.tags,
        body: n.body,
        frontmatter: JSON.stringify(n.frontmatter),
        pinned: n.pinned ?? false,
      },
    })
  }
  console.log(`  ✓ ${notes.length} vault notes`)

  // ── Credentials ─────────────────────────────────────────────────────
  await db.credential.deleteMany({})
  const creds = [
    { label: 'Chase checking', category: 'banking', issuer: 'Chase', maskedValue: '•••• 4242' },
    { label: 'Gmail — work', category: 'email', issuer: 'Google', maskedValue: 'otto@••••.com' },
    { label: 'GitHub', category: 'work', issuer: 'GitHub', maskedValue: 'otto-perso' },
    { label: 'OpenAI API', category: 'api', issuer: 'OpenAI', maskedValue: 'sk-••••••••3a9f' },
    { label: 'Anthropic API', category: 'api', issuer: 'Anthropic', maskedValue: 'sk-ant-••••••7b2c' },
    { label: 'LinkedIn', category: 'social', issuer: 'LinkedIn', maskedValue: '••••@••••.com' },
  ]
  for (const c of creds) {
    await db.credential.create({
      data: {
        ...c,
        encryptedRef: `vault://creds/${Buffer.from(c.label).toString('base64')}`,
      },
    })
  }
  console.log(`  ✓ ${creds.length} credentials`)

  // ── Model providers ─────────────────────────────────────────────────
  await db.modelProvider.deleteMany({})
  const models = [
    { name: 'Ollama (local)', kind: 'ollama', endpoint: 'http://localhost:11434', models: JSON.stringify(['qwen3-coder-32b', 'llama3.1-8b', 'nomic-embed-text']), isDefault: true, latencyMs: 180 },
    { name: 'OpenAI', kind: 'openai', endpoint: 'https://api.openai.com/v1', models: JSON.stringify(['gpt-4o', 'gpt-4o-mini', 'o1-preview']), latencyMs: 420 },
    { name: 'Anthropic', kind: 'anthropic', endpoint: 'https://api.anthropic.com/v1', models: JSON.stringify(['claude-3.5-sonnet', 'claude-3-haiku']), latencyMs: 510 },
    { name: 'Otto-bundled (free tier)', kind: 'otto-bundled', endpoint: 'otto://bundled', models: JSON.stringify(['otto-fast', 'otto-reasoner']), latencyMs: 240 },
  ]
  for (const m of models) {
    await db.modelProvider.create({ data: m })
  }
  console.log(`  ✓ ${models.length} model providers`)

  // ── Recipes ─────────────────────────────────────────────────────────
  await db.recipe.deleteMany({})
  const recipes = [
    {
      title: 'Weekly digest',
      description: 'Summarize week\'s emails, meetings, and shipped work into a single Markdown note in the vault.',
      category: 'reporting',
      steps: JSON.stringify([
        { action: 'scan', target: 'inbox', range: '7d' },
        { action: 'scan', target: 'calendar', range: '7d' },
        { action: 'scan', target: 'git log', range: '7d' },
        { action: 'synthesize', model: 'qwen3-coder-32b' },
        { action: 'write', target: 'vault://notes/weekly/{date}.md' },
      ]),
      estMinutes: 8,
      isBuiltIn: true,
      isFavorite: true,
      runCount: 14,
    },
    {
      title: 'Competitor teardown',
      description: 'Pull competitor site, pricing, recent news, and team changes into a structured report.',
      category: 'research',
      steps: JSON.stringify([
        { action: 'browse', target: '{competitor_url}' },
        { action: 'extract', fields: ['pricing', 'team', 'features'] },
        { action: 'search_news', query: '{competitor_name}' },
        { action: 'synthesize' },
        { action: 'write', target: 'vault://research/{competitor_slug}.md' },
      ]),
      estMinutes: 15,
      isBuiltIn: true,
      runCount: 6,
    },
    {
      title: 'Inbox triage',
      description: 'Categorize unread emails, draft replies for routine ones, flag the rest.',
      category: 'email',
      steps: JSON.stringify([
        { action: 'list_unread' },
        { action: 'classify', labels: ['routine', 'decision-needed', 'urgent', 'fyi'] },
        { action: 'draft_replies', only: 'routine' },
        { action: 'flag', only: 'decision-needed+urgent' },
      ]),
      estMinutes: 5,
      isBuiltIn: true,
      runCount: 32,
    },
    {
      title: 'File organizer — Downloads',
      description: 'Sort Downloads into project folders by file type and inferred project.',
      category: 'file',
      steps: JSON.stringify([
        { action: 'scan', target: '~/Downloads' },
        { action: 'classify', by: 'extension+name' },
        { action: 'move', target: '~/Projects/{project}/{type}/' },
        { action: 'log', target: 'vault://logs/file-organizer/{date}.md' },
      ]),
      estMinutes: 3,
      isBuiltIn: true,
      runCount: 21,
    },
    {
      title: 'Sprint kickoff prep',
      description: 'Pull open PRs, stale issues, and last sprint\'s retro notes into a kickoff doc.',
      category: 'devops',
      steps: JSON.stringify([
        { action: 'gh', cmd: 'pr list --state open' },
        { action: 'gh', cmd: 'issue list --state open' },
        { action: 'read', target: 'vault://retro/{prev_sprint}.md' },
        { action: 'synthesize' },
        { action: 'write', target: 'vault://sprints/{sprint_id}-kickoff.md' },
      ]),
      estMinutes: 10,
      isBuiltIn: false,
      runCount: 4,
    },
    {
      title: 'Subscription audit',
      description: 'List recurring charges from last 30 days, flag duplicates and unused services.',
      category: 'reporting',
      steps: JSON.stringify([
        { action: 'scan', target: 'email', query: 'subject:receipt OR subject:invoice', range: '30d' },
        { action: 'extract', fields: ['amount', 'service', 'date'] },
        { action: 'dedupe' },
        { action: 'flag_unused', heuristic: 'no login in 30d' },
        { action: 'write', target: 'vault://reports/subscriptions-{month}.md' },
      ]),
      estMinutes: 6,
      isBuiltIn: true,
      runCount: 2,
    },
  ]
  for (const r of recipes) {
    await db.recipe.create({ data: r })
  }
  console.log(`  ✓ ${recipes.length} recipes`)

  // ── Activity log ────────────────────────────────────────────────────
  await db.activityLog.deleteMany({})
  const now = Date.now()
  const activity = [
    { agentName: 'Otto', action: 'vault.note.write', target: 'weekly/2026-11-06.md', summary: 'Wrote weekly digest note to vault', riskTier: 'low', undoable: true, minsAgo: 4 },
    { agentName: 'Scout', action: 'email.draft', target: 'inbox/draft/re-investor-update', summary: 'Drafted reply to M. Chen — pending approval', riskTier: 'medium', undoable: true, minsAgo: 11 },
    { agentName: 'Archivist', action: 'file.move', target: '~/Downloads/*', summary: 'Moved 23 files into project folders', riskTier: 'low', undoable: true, minsAgo: 18 },
    { agentName: 'Otto', action: 'ui.click', target: 'Arc > workspace "Otto-Session"', summary: 'Switched to dedicated automation profile', riskTier: 'low', undoable: false, minsAgo: 22 },
    { agentName: 'Scribe', action: 'web.search', target: 'competitor teardown — Acme Corp', summary: 'Searched 8 sources, extracted pricing + team', riskTier: 'low', undoable: false, minsAgo: 35 },
    { agentName: 'Otto', action: 'vault.snapshot', target: 'snapshots/pre-backup-2026-11-06', summary: 'Took pre-backup snapshot of vault (1,284 files)', riskTier: 'low', undoable: false, minsAgo: 52 },
    { agentName: 'Scout', action: 'email.send', target: 'outbox/weekly-digest-team', summary: 'Sent weekly digest to team list (5 recipients)', riskTier: 'medium', undoable: false, minsAgo: 78 },
    { agentName: 'Otto', action: 'task.spawn', target: 'worker:Archivist', summary: 'Spawned Archivist worker for vault indexing', riskTier: 'low', undoable: true, minsAgo: 95 },
    { agentName: 'Otto', action: 'recipe.run', target: 'weekly-digest', summary: 'Started weekly-digest recipe (run #15)', riskTier: 'low', undoable: true, minsAgo: 96 },
    { agentName: 'Otto', action: 'task.fail', target: 'cancel-unused-saas', summary: 'Failed: 2FA prompt not satisfied for banking access', riskTier: 'high', undoable: false, minsAgo: 130 },
  ]
  for (const a of activity) {
    await db.activityLog.create({
      data: {
        agentName: a.agentName,
        action: a.action,
        target: a.target,
        summary: a.summary,
        riskTier: a.riskTier,
        undoable: a.undoable,
        autonomyLevel: 3,
        createdAt: new Date(now - a.minsAgo * 60 * 1000),
      },
    })
  }
  console.log(`  ✓ ${activity.length} activity entries`)

  // ── Proactive prompts ───────────────────────────────────────────────
  await db.proactivePrompt.deleteMany({})
  const prompts = [
    {
      content: 'You usually start Q3 report prep around the 13th. Want me to pull competitor financials and prior-year comparisons now?',
      suggestedAction: 'Start Q3 report prep',
      trigger: 'pattern',
      confidence: 0.83,
    },
    {
      content: 'Three unread emails from M. Chen in the last 4 days. He prefers written updates — I can draft a status brief for your review.',
      suggestedAction: 'Draft status brief for M. Chen',
      trigger: 'observation',
      confidence: 0.71,
    },
    {
      content: 'Your ~/Downloads folder has 47 unsorted files. Last organized 9 days ago. I can sort them in ~3 minutes.',
      suggestedAction: 'Run file-organizer recipe',
      trigger: 'observation',
      confidence: 0.92,
    },
    {
      content: 'Vault has 14 notes without tags. Tagging them improves future recall by ~30%.',
      suggestedAction: 'Auto-tag untagged vault notes',
      trigger: 'observation',
      confidence: 0.65,
    },
  ]
  for (const p of prompts) {
    await db.proactivePrompt.create({ data: p })
  }
  console.log(`  ✓ ${prompts.length} proactive prompts`)

  // ── Custom bots ─────────────────────────────────────────────────────
  await db.customBot.deleteMany({})
  const bots = [
    {
      name: 'Manus-cue',
      description: 'Deep research specialist. Reads long, takes time, returns cited briefs.',
      systemPrompt: 'You are Manus-cue, a deep research specialist. You read primary sources exhaustively, cite every claim, and produce structured briefs. Never speculate. If a source is paywalled or unavailable, say so explicitly. Output format: Executive summary → Key findings (with citations) → Open questions → Sources.',
      modelName: 'qwen3-coder-32b',
      allowedActions: ['web.search', 'web.fetch', 'vault.read', 'vault.write'],
      autonomyCap: 3,
      color: 'ink',
    },
    {
      name: 'Grok-bot',
      description: 'Fast reactive responder for quick checks and terse answers.',
      systemPrompt: 'You are Grok-bot. You answer fast, terse, and wit-first. No hedging. If you don\'t know, say "no clue" — don\'t make stuff up. Max 3 sentences unless asked for more. Good for: quick fact checks, witty replies, snap decisions.',
      modelName: 'otto-fast',
      allowedActions: ['web.search', 'vault.read'],
      autonomyCap: 2,
      color: 'signal',
    },
    {
      name: 'Bookkeeper',
      description: 'Finance-aware assistant for receipts, expenses, and budget tracking.',
      systemPrompt: 'You are Bookkeeper. You handle financial data precisely. Always show your math. Never round. Flag duplicates. Never move money — only categorize and report. If something looks off (unusual amount, duplicate vendor, unknown charge), surface it as a warning rather than silently categorizing.',
      modelName: 'otto-reasoner',
      allowedActions: ['vault.read', 'vault.write', 'email.read'],
      autonomyCap: 2,
      color: 'good',
    },
  ]
  for (const b of bots) {
    await db.customBot.create({
      data: {
        ...b,
        allowedActions: JSON.stringify(b.allowedActions),
      },
    })
  }
  console.log(`  ✓ ${bots.length} custom bots`)

  // ── System state ────────────────────────────────────────────────────
  await db.systemState.upsert({
    where: { key: 'emergencyStop' },
    update: {},
    create: { key: 'emergencyStop', value: JSON.stringify({ active: false, lastTriggered: null }) },
  })
  await db.systemState.upsert({
    where: { key: 'riskThresholds' },
    update: {},
    create: {
      key: 'riskThresholds',
      value: JSON.stringify({
        autoApproveBelow: 0.95,
        askBetween: [0.7, 0.95],
        alwaysAskBelow: 0.7,
        spendBudget24h: 0,
        emailBudget1h: 5,
      }),
    },
  })
  console.log('  ✓ system state')

  console.log('→ Seed complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
