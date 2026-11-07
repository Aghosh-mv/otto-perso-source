// Otto Perso — Agent Runtime
// Executes a spawned agent's task using the same brain (otto-brain.ts) but
// with a task-scoped system prompt. The agent calls tools, produces a result,
// and writes it back to its Agent row + Activity log.
//
// This is what makes Otto a real agent platform: spawned workers actually
// do work, not just sit in the DB as rows.

import { db } from '@/lib/db'
import { streamChat, checkRateLimit } from '@/lib/otto-brain'

export interface AgentRunResult {
  ok: boolean
  agentId: string
  result: string
  toolCalls: number
  durationMs: number
  error?: string
}

// Build a system prompt scoped to the agent's specific task.
function buildAgentSystemPrompt(opts: {
  agentName: string
  kind: string
  task: string
  modelName: string | null
  ownerName: string
}): string {
  return `You are ${opts.agentName}, a new Otto Perso brain spawned by the main Otto to do a specific job for ${opts.ownerName}.

You are not a chatbot — you are a full Otto instance with your own brain, your own tools, and your own task. Think of yourself as a fresh copy of Otto focused on one job.

## Your task
${opts.task}

## Rules
- You are a complete Otto brain, not a sub-routine. Use your full capability.
- Stay focused on your task. Don't ask ${opts.ownerName} questions — make reasonable assumptions and proceed.
- You have the same tools as the main Otto: vault_read, vault_write, task_create, task_list, web_search, web_fetch, web_page_reader, system_state, activity_log_custom, file_read, file_write, file_list, etc.
- When you're done, write a clear summary of what you did, what you found, and any recommendations. This summary becomes your task result.
- Be concise. ${opts.ownerName} will read your result; they don't need a novel.
- If you genuinely cannot complete the task, say so clearly and explain what blocked you.

## Output format
End your response with a section titled "## Result" containing your final deliverable. This is what gets saved as your task result.`
}

// Run an agent's task. This is a long-running function — call it from a
// fire-and-forget context (the /run endpoint kicks it off and returns immediately).
export async function runAgent(agentId: string): Promise<AgentRunResult> {
  const start = Date.now()
  const agent = await db.agent.findUnique({ where: { id: agentId } })
  if (!agent) {
    return { ok: false, agentId, result: 'Agent not found', toolCalls: 0, durationMs: 0, error: 'not found' }
  }

  // Update status to thinking
  await db.agent.update({
    where: { id: agentId },
    data: { status: 'thinking', lastBeatAt: new Date() },
  })

  await db.activityLog.create({
    data: {
      agentId,
      agentName: agent.name,
      action: 'agent.run.start',
      target: agentId,
      summary: `Agent "${agent.name}" started: ${agent.task?.slice(0, 80) || 'no task'}`,
      riskTier: 'low',
      autonomyLevel: 2,
    },
  })

  try {
    // Check rate limit before starting
    const rate = await checkRateLimit()
    if (!rate.allowed) {
      throw new Error(`Rate limited: ${rate.reason}`)
    }

    // Get owner name
    const owner = await db.user.findFirst({ where: { role: 'owner' } })
    const ownerName = owner?.name || 'the owner'

    const systemPrompt = buildAgentSystemPrompt({
      agentName: agent.name,
      kind: agent.kind,
      task: agent.task || 'No specific task assigned.',
      modelName: agent.modelName,
      ownerName,
    })

    // Update to executing
    await db.agent.update({
      where: { id: agentId },
      data: { status: 'executing', lastBeatAt: new Date() },
    })

    // Run the brain with the agent's task as the user message
    const result = await streamChat({
      systemPrompt,
      history: [],
      userMessage: `Begin your task now: ${agent.task || '(no task specified)'}`,
      maxToolRounds: 6, // agents get fewer rounds to keep them focused
    })

    // Extract the "## Result" section if present, otherwise use the whole response
    let finalResult = result.content
    const resultMatch = result.content.match(/##\s*Result\s*\n([\s\S]*?)$/i)
    if (resultMatch) {
      finalResult = resultMatch[1].trim()
    }

    // Update agent to done
    await db.agent.update({
      where: { id: agentId },
      data: {
        status: 'idle',
        confidence: 0.85,
        lastBeatAt: new Date(),
      },
    })

    // Log completion
    await db.activityLog.create({
      data: {
        agentId,
        agentName: agent.name,
        action: 'agent.run.done',
        target: agentId,
        summary: `Agent "${agent.name}" finished${result.toolCalls.length > 0 ? ` (${result.toolCalls.length} tool calls)` : ''}: ${finalResult.slice(0, 100)}${finalResult.length > 100 ? '…' : ''}`,
        riskTier: 'low',
        autonomyLevel: 2,
      },
    })

    // If the agent has assigned tasks, mark them done with the result
    const assignedTasks = await db.task.findMany({
      where: { assigneeId: agentId, status: { in: ['executing', 'planning', 'queued'] } },
    })
    for (const t of assignedTasks) {
      await db.task.update({
        where: { id: t.id },
        data: {
          status: 'done',
          result: JSON.stringify({ agentResult: finalResult, toolCalls: result.toolCalls.length, durationMs: Date.now() - start }),
          completedAt: new Date(),
        },
      })
    }

    return {
      ok: true,
      agentId,
      result: finalResult,
      toolCalls: result.toolCalls.length,
      durationMs: Date.now() - start,
    }
  } catch (e) {
    const errorMsg = (e as Error).message

    // Update agent to failed
    await db.agent.update({
      where: { id: agentId },
      data: { status: 'idle', lastBeatAt: new Date() },
    })

    await db.activityLog.create({
      data: {
        agentId,
        agentName: agent.name,
        action: 'agent.run.failed',
        target: agentId,
        summary: `Agent "${agent.name}" failed: ${errorMsg.slice(0, 200)}`,
        riskTier: 'medium',
        autonomyLevel: 2,
      },
    })

    return {
      ok: false,
      agentId,
      result: `Failed: ${errorMsg}`,
      toolCalls: 0,
      durationMs: Date.now() - start,
      error: errorMsg,
    }
  }
}
