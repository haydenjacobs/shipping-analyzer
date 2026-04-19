import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tpls, locations, rateCards, rateCardEntries, orderResults, orderBestResults } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params
  const id = parseInt(idStr)

  const [tpl] = await db.select().from(tpls).where(eq(tpls.id, id))
  if (!tpl) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [tplLocations, cards] = await Promise.all([
    db.select().from(locations).where(eq(locations.tplId, id)),
    db.select().from(rateCards).where(eq(rateCards.tplId, id)),
  ])

  const cardsWithEntries = await Promise.all(
    cards.map(async card => {
      const entries = await db.select().from(rateCardEntries).where(eq(rateCardEntries.rateCardId, card.id))
      return { ...card, entries }
    })
  )

  return NextResponse.json({ ...tpl, locations: tplLocations, rateCards: cardsWithEntries })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params
  const id = parseInt(idStr)
  const body = await req.json()

  const allowed = ['name', 'multiNodeEnabled', 'dimWeightEnabled', 'dimFactor', 'surchargeFlatCents', 'notes']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const [updated] = await db.update(tpls).set(updates).where(eq(tpls.id, id)).returning()
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params
  const id = parseInt(idStr)

  // Explicit cascade in dependency order (belt-and-suspenders alongside FK cascade)
  await db.delete(orderBestResults).where(eq(orderBestResults.tplId, id))
  await db.delete(orderResults).where(eq(orderResults.tplId, id))

  const cards = await db.select({ id: rateCards.id }).from(rateCards).where(eq(rateCards.tplId, id))
  for (const card of cards) {
    await db.delete(rateCardEntries).where(eq(rateCardEntries.rateCardId, card.id))
  }

  await db.delete(rateCards).where(eq(rateCards.tplId, id))
  await db.delete(locations).where(eq(locations.tplId, id))
  await db.delete(tpls).where(eq(tpls.id, id))

  return NextResponse.json({ ok: true })
}
