import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/recipes/[id]/run — queue a task from a recipe
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const recipe = await db.recipe.findUnique({ where: { id } })
  if (!recipe) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const task = await db.task.create({
    data: {
      title: `Recipe: ${recipe.title}`,
      description: recipe.description,
      status: 'queued',
      priority: 'normal',
      runMode: 'background',
      autonomyLevel: 3,
      recipeId: recipe.id,
    },
  })
  await db.recipe.update({
    where: { id: recipe.id },
    data: { runCount: { increment: 1 } },
  })
  await db.activityLog.create({
    data: {
      agentName: 'Owner',
      action: 'recipe.run',
      target: recipe.id,
      summary: `Queued recipe run: ${recipe.title}`,
      riskTier: 'low',
      undoable: true,
      autonomyLevel: 3,
    },
  })
  return NextResponse.json({ ok: true, taskId: task.id }, { status: 201 })
}
