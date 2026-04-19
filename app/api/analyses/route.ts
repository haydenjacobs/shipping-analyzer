import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { analyses } from '@/lib/db/schema'
import { desc } from 'drizzle-orm'

export async function GET() {
  const rows = await db.select().from(analyses).orderBy(desc(analyses.createdAt))
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name } = body
  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }
  const [row] = await db.insert(analyses).values({ name: name.trim() }).returning()
  return NextResponse.json(row, { status: 201 })
}
