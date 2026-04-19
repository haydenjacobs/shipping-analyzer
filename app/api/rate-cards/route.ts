import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rateCards, rateCardEntries } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { WeightUnitMode, WeightUnit } from '@/types'

interface ConfirmedSection {
  unit: 'oz' | 'lbs'
  weights: number[]
  zoneColumns: number[]
  prices: (number | null)[][]
}

export async function GET(req: NextRequest) {
  const tplId = req.nextUrl.searchParams.get('tplId')
  if (!tplId) return NextResponse.json({ error: 'tplId required' }, { status: 400 })

  const cards = await db.select().from(rateCards).where(eq(rateCards.tplId, parseInt(tplId)))

  const result = await Promise.all(
    cards.map(async card => {
      const entries = await db.select().from(rateCardEntries).where(eq(rateCardEntries.rateCardId, card.id))
      return { ...card, entries }
    })
  )

  return NextResponse.json(result)
}

// POST /api/rate-cards
// Save a confirmed (user-reviewed) rate card.
// Body: { tplId, name, sections: ConfirmedSection[] }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { tplId, name, sections } = body as {
    tplId: number
    name: string
    sections: ConfirmedSection[]
  }

  if (!tplId || !name?.trim()) {
    return NextResponse.json({ error: 'tplId and name required' }, { status: 400 })
  }
  if (!Array.isArray(sections) || sections.length === 0) {
    return NextResponse.json({ error: 'sections array required' }, { status: 400 })
  }

  // Validate all sections have a confirmed unit
  for (const s of sections) {
    if (s.unit !== 'oz' && s.unit !== 'lbs') {
      return NextResponse.json({ error: `Invalid unit "${s.unit}" — must be "oz" or "lbs"` }, { status: 400 })
    }
  }

  // Determine weight_unit_mode from sections
  const units = sections.map(s => s.unit)
  let weightUnitMode: WeightUnitMode
  if (units.includes('oz') && units.includes('lbs')) {
    weightUnitMode = 'oz_then_lbs'
  } else if (units.includes('oz')) {
    weightUnitMode = 'oz_only'
  } else {
    weightUnitMode = 'lbs_only'
  }

  // Insert rate card
  const [card] = await db.insert(rateCards).values({
    tplId,
    name: name.trim(),
    weightUnitMode,
  }).returning()

  // Build entries
  const entriesToInsert: Array<{
    rateCardId: number
    weightValue: number
    weightUnit: WeightUnit
    zone: number
    priceCents: number
  }> = []

  for (const section of sections) {
    for (let rowIdx = 0; rowIdx < section.weights.length; rowIdx++) {
      const weight = section.weights[rowIdx]
      for (let zoneIdx = 0; zoneIdx < section.zoneColumns.length; zoneIdx++) {
        const zone = section.zoneColumns[zoneIdx]
        const price = section.prices[rowIdx]?.[zoneIdx]
        if (price == null) continue  // skip missing cells
        entriesToInsert.push({
          rateCardId: card.id,
          weightValue: weight,
          weightUnit: section.unit,
          zone,
          priceCents: Math.round(price * 100),
        })
      }
    }
  }

  if (entriesToInsert.length > 0) {
    await db.insert(rateCardEntries).values(entriesToInsert)
  }

  // Return card with entry count
  const ozRows = sections.filter(s => s.unit === 'oz').reduce((n, s) => n + s.weights.length, 0)
  const lbsRows = sections.filter(s => s.unit === 'lbs').reduce((n, s) => n + s.weights.length, 0)

  return NextResponse.json(
    { card: { ...card, entries: [] }, entriesImported: entriesToInsert.length, ozRows, lbsRows },
    { status: 201 }
  )
}
