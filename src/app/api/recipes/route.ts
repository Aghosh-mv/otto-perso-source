import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/recipes
export async function GET() {
  const recipes = await db.recipe.findMany({ orderBy: [{ isFavorite: 'desc' }, { runCount: 'desc' }] })
  return NextResponse.json(
    recipes.map((r) => ({ ...r, steps: JSON.parse(r.steps) }))
  )
}

// POST /api/recipes
export async function POST(req: Request) {
  const body = await req.json()
  const created = await db.recipe.create({
    data: {
      title: body.title,
      description: body.description,
      category: body.category ?? 'custom',
      steps: JSON.stringify(body.steps ?? []),
      estMinutes: body.estMinutes ?? 5,
      isBuiltIn: false,
      isFavorite: body.isFavorite ?? false,
    },
  })
  return NextResponse.json({ ...created, steps: JSON.parse(created.steps) }, { status: 201 })
}
