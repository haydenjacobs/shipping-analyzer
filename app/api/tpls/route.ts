import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tpls, locations } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const analysisId = req.nextUrl.searchParams.get('analysisId')
  if (!analysisId) return NextResponse.json({ error: 'analysisId required' }, { status: 400 })

  const allTpls = await db.select().from(tpls).where(eq(tpls.analysisId, parseInt(analysisId)))

  const result = await Promise.all(
    allTpls.map(async tpl => {
      const tplLocations = await db.select().from(locations).where(eq(locations.tplId, tpl.id))
      return { ...tpl, locations: tplLocations }
    })
  )

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { analysisId, name, notes } = body

  if (!analysisId || !name?.trim()) {
    return NextResponse.json({ error: 'analysisId and name required' }, { status: 400 })
  }

  const [tpl] = await db.insert(tpls).values({
    analysisId,
    name: name.trim(),
    notes: notes ?? null,
  }).returning()

  return NextResponse.json({ ...tpl, locations: [] }, { status: 201 })
}
