import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { analyses } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params
  const id = parseInt(idStr)
  const [row] = await db.select().from(analyses).where(eq(analyses.id, id))
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(row)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params
  const id = parseInt(idStr)
  const body = await req.json()
  const [row] = await db.update(analyses)
    .set({ ...body, updatedAt: new Date().toISOString() })
    .where(eq(analyses.id, id))
    .returning()
  return NextResponse.json(row)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params
  const id = parseInt(idStr)
  await db.delete(analyses).where(eq(analyses.id, id))
  return NextResponse.json({ ok: true })
}
