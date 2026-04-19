import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rateCards, rateCardEntries } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params
  const id = parseInt(idStr)

  await db.delete(rateCardEntries).where(eq(rateCardEntries.rateCardId, id))
  await db.delete(rateCards).where(eq(rateCards.id, id))

  return NextResponse.json({ ok: true })
}
