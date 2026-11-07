// Otto's chat endpoint — streams Gemini responses with thoughts + tool calls via SSE.
// POST /api/chat with { conversationId }
// Streams events: { type: 'thought'|'token'|'tool_call'|'tool_result'|'usage'|'done'|'error', ... }

import { db } from '@/lib/db'
import { checkRateLimit, streamChat } from '@/lib/otto-brain'
import type { ToolCall, ToolResult } from '@/lib/otto-tools'
import { getSession } from '@/lib/session'

const AUTONOMY_BEHAVIOR: Record<number, string> = {
  1: 'You are at Level 1 (Ask Before Editing). You may suggest changes but MUST NOT execute anything without asking. Use tools to *read* state (vault_read, task_list, agent_list, activity_log, autonomy_get) freely, but for any *write* tool (vault_write, task_create, task_update, agent_spawn), you MUST first describe what you plan to do and ask for confirmation. Frame responses as proposals.',
  2: 'You are at Level 2 (Mild Edits Only). You may make small, safe corrections without asking. Substantive changes still require approval. Read tools are free; for write tools, ask first unless the user explicitly asked you to do that exact thing.',
  3: "You are at Level 3 (Chosen Edits). Execute the user's explicitly chosen edits precisely using the available tools. No more, no less.",
  4: 'You are at Level 4 (Bypass All Approvals). Move fast. Make any edit you deem necessary using the available tools. The user will review the timeline later. Be decisive and use tools liberally.',
  5: "You are at Level 5 (Vacation Mode). You are running the user's digital life with minimal input. Be proactive. Take initiative on routine work using the available tools. Still ask for: money movement, legal docs, irreversible deletes.",
}

function buildSystemPrompt(opts: {
  autonomyLevel: number
  vaultNotes: { title: string; category: string; body: string }[]
  activeAgents: { name: string; kind: string; status: string; task: string | null }[]
  pendingTasks: { title: string; status: string; priority: string }[]
  userName?: string
}): string {
  const { autonomyLevel, vaultNotes, activeAgents, pendingTasks, userName } = opts

  const vaultSummary = vaultNotes.length > 0
    ? vaultNotes.map((n) => `- [${n.category}] ${n.title}: ${n.body.slice(0, 120)}${n.body.length > 120 ? '…' : ''}`).join('\n')
    : '(vault is empty)'

  const agentsSummary = activeAgents.length > 0
    ? activeAgents.map((a) => `- ${a.name} (${a.kind}, ${a.status})${a.task ? ` — ${a.task}` : ''}`).join('\n')
    : '(no agents online)'

  const tasksSummary = pendingTasks.length > 0
    ? pendingTasks.map((t) => `- [${t.priority}] ${t.title} (${t.status})`).join('\n')
    : '(no pending tasks)'

  return `You are Otto Perso — a digital employee that lives on the user's computer. You are NOT a chatbot. You are an autonomous orchestrator with a full brain — you can read files, browse the web, draft and send emails, manage schedules, spawn new Otto brains for parallel work, and operate the user's computer like a human would.

Your personality: direct, concise, evidence-led. No hedging. Numbers > adjectives. Sign messages with "— Otto" only when ending a substantive reply.

## Your role: ORCHESTRATOR

You are the main Otto. When the user gives you a complex request with multiple parts, your job is to DECOMPOSE it into focused subtasks and spawn new Otto brains to handle each one in parallel. Each spawned brain is a complete Otto instance — its own brain, its own tools, focused on one job. You monitor their progress and report back.

**Decomposition rules:**
- If the request has 2+ distinct areas (inbox + socials + event + restaurant), spawn a new Otto brain for each.
- Pick creative memorable names for the new brains — "Inboxer", "Fred", "Scout", "Scribe", "Atlas", "Vex". Don't use boring names like "worker-1".
- Give each new brain a FOCUSED, DETAILED task. The new brain doesn't see this conversation — its task description is its entire world. Include all context it needs.
- Use agent_spawn_multi to spawn them all at once.
- After spawning, tell the user who's on what. e.g. "I've got Fred on your inbox, Scout scanning socials, and Atlas working the restaurant."
- If the user asks "what's up?" or "how's it going?" mid-flight, use agent_status to check on each brain and report.
- When brains finish, summarize what each found/did. Don't just say "done" — give the user the actual results.

**When NOT to spawn:**
- Simple single-task requests → just do it yourself with a tool call.
- Sequential tasks where step 2 depends on step 1 → do them in order yourself.
- Anything that finishes in a few seconds → no need for a new brain.

**Example decomposition:**
User: "Look at my inbox and take care of background tasks in it, check my socials, I have an event tonight — book a seat and find a restaurant near it for the event timing."
You: spawn 4 new Otto brains via agent_spawn_multi:
  - "Inboxer" — task: "Read the user's inbox. For each email, identify any background tasks (confirmations, scheduling, follow-ups). Create tasks for each. Report what you found."
  - "Scout" — task: "Scan the user's socials for mentions, DMs, and notifications. Summarize what needs attention."
  - "Vex" — task: "The user has an event tonight. Find the event details, book a seat. Report the booking confirmation."
  - "Atlas" — task: "Find restaurants near the user's event venue tonight. Pick one that fits the event timing. Book a table. Report the reservation."
Then: "On it. Inboxer's on your inbox, Scout's scanning socials, Vex is booking the event seat, Atlas's finding a restaurant. I'll report back as they finish."

## Tools available. USE THEM.

- Single quick action → call the tool directly (vault_read, web_search, file_write, etc.)
- Complex multi-part request → decompose, then agent_spawn_multi
- User asks about a brain → agent_status by name
- "What are you working on?" → agent_list + agent_status for each active brain

After calling tools, summarize what you did and what you found in your reply.

## Current state

${AUTONOMY_BEHAVIOR[autonomyLevel] || AUTONOMY_BEHAVIOR[2]}

User: ${userName || '(unknown)'} (logged in)

Active Otto brains (yours + spawned):
${agentsSummary}

Pending tasks:
${tasksSummary}

## Vault (your memory — what you know about the user)

${vaultSummary}

## How to respond

- If the user asks you to DO something: do it via a tool call, then describe the result. If at L1-L3, ask before doing anything substantive (writes/creates/spawns).
- If the user asks a question: answer it directly. Use vault_read to ground your answer in what you know.
- If you'd need more info: ask one focused question, not a list.
- If something is risky (money, legal, irreversible): ALWAYS confirm, regardless of autonomy level.
- Be concrete. Don't say "I can help with that" — say what you'll actually do, then do it.
- Use Markdown formatting: **bold** for key points, bullet lists for enumerations, \`code\` for file paths and commands.`
}

export async function POST(req: Request) {
  // ─── Auth ──────────────────────────────────────────────────────────────────
  const session = await getSession()
  if (!session?.user) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { conversationId } = await req.json()
  if (!conversationId) {
    return Response.json({ error: 'conversationId required' }, { status: 400 })
  }

  const convo = await db.conversation.findUnique({
    where: { id: conversationId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
  if (!convo) {
    return Response.json({ error: 'conversation not found' }, { status: 404 })
  }

  // ─── Rate limit check ────────────────────────────────────────────────────
  const rate = await checkRateLimit()
  if (!rate.allowed) {
    return Response.json(
      { error: rate.reason, rateLimited: true, rate },
      { status: 429, headers: { 'Retry-After': String(rate.minute.resetsInSec) } }
    )
  }

  // ─── Load context ────────────────────────────────────────────────────────
  const [vaultNotes, activeAgents, pendingTasks] = await Promise.all([
    db.vaultNote.findMany({ take: 20, orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }] }),
    db.agent.findMany(),
    db.task.findMany({
      where: { status: { in: ['queued', 'executing', 'planning', 'blocked', 'waiting_approval'] } },
      take: 10,
    }),
  ])

  const systemPrompt = buildSystemPrompt({
    autonomyLevel: convo.autonomyLevel,
    vaultNotes: vaultNotes.map((n) => ({ title: n.title, category: n.category, body: n.body })),
    activeAgents: activeAgents.map((a) => ({ name: a.name, kind: a.kind, status: a.status, task: a.task })),
    pendingTasks: pendingTasks.map((t) => ({ title: t.title, status: t.status, priority: t.priority })),
    userName: session.user.name || undefined,
  })

  // Build history (exclude the last user message — we pass it separately)
  const msgs = convo.messages
  const lastMsg = msgs[msgs.length - 1]
  const history = msgs.slice(0, -1).slice(-20)
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  // Placeholder assistant message (streaming state)
  const placeholder = await db.message.create({
    data: {
      conversationId,
      role: 'assistant',
      content: '',
      thoughts: '',
      actions: '[]',
      attachments: '[]',
      confidence: 0,
      autonomyLevel: convo.autonomyLevel,
      status: 'streaming',
    },
  })

  // ─── Stream the response as SSE ──────────────────────────────────────────
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
      }

      send({ type: 'start', messageId: placeholder.id })

      const toolCalls: ToolCall[] = []
      const toolResults: ToolResult[] = []

      try {
        const result = await streamChat({
          systemPrompt,
          history,
          userMessage: lastMsg?.content ?? '',
          onToken: (t) => send({ type: 'token', text: t }),
          onThought: (t) => send({ type: 'thought', text: t }),
          onToolCall: (c) => {
            toolCalls.push(c)
            send({ type: 'tool_call', name: c.name, args: c.args })
          },
          onToolResult: (r) => {
            toolResults.push(r)
            send({ type: 'tool_result', name: r.name, ok: r.ok, summary: r.summary, data: r.data })
          },
        })

        // Persist the final response, including actions for the timeline
        const actions = toolResults.map((r) => ({
          type: 'tool',
          action: r.name,
          target: r.summary,
          status: r.ok ? 'done' : 'error',
          summary: r.summary,
        }))

        await db.message.update({
          where: { id: placeholder.id },
          data: {
            content: result.content,
            thoughts: result.thoughts,
            actions: JSON.stringify(actions),
            status: 'done',
            confidence: 0.85,
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
            totalTokens: result.totalTokens,
            model: result.model,
          },
        })
        await db.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        })
        await db.activityLog.create({
          data: {
            agentName: 'Otto',
            action: 'chat.response',
            target: conversationId,
            summary: `Responded in conversation${toolCalls.length > 0 ? ` (used ${toolCalls.length} tool${toolCalls.length === 1 ? '' : 's'})` : ''}: ${result.content.slice(0, 80)}${result.content.length > 80 ? '…' : ''}`,
            riskTier: toolCalls.length > 0 ? 'medium' : 'low',
            undoable: false,
            autonomyLevel: convo.autonomyLevel,
          },
        })

        send({
          type: 'done',
          messageId: placeholder.id,
          totalTokens: result.totalTokens,
          model: result.model,
          hadThoughts: result.thoughts.length > 0,
          toolCount: toolCalls.length,
        })
      } catch (e) {
        await db.message.update({
          where: { id: placeholder.id },
          data: {
            content: `Sorry, I couldn't respond just now. ${(e as Error).message}`,
            status: 'error',
          },
        }).catch(() => {})
        send({ type: 'error', error: (e as Error).message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
