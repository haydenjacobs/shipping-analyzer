import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rateCardEntries, rateCards } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { apiError, notFound } from '../../_lib/errors'

function parseId(raw: string) {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params
  const id = parseId(rawId)
  if (id === null) return apiError('BAD_REQUEST', 'invalid id', 400)

  const card = db.select().from(rateCards).where(eq(rateCards.id, id)).get()
  if (!card) return notFound('RateCard')

  const entries = db
    .select()
    .from(rateCardEntries)
    .where(eq(rateCardEntries.rateCardId, id))
    .orderBy(rateCardEntries.weightUnit, rateCardEntries.weightValue, rateCardEntries.zone)
    .all()

  return NextResponse.json({ rateCard: card, entries })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params
  const id = parseId(rawId)
  if (id === null) return apiError('BAD_REQUEST', 'invalid id', 400)

  const result = db.delete(rateCards).where(eq(rateCards.id, id)).returning({ id: rateCards.id }).all()
  if (result.length === 0) return notFound('RateCard')
  // ON DELETE CASCADE handles rate_card_entries and order_results.
  return NextResponse.json({ deleted: true })
}
