import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  analyses,
  orders,
  tpls,
  locations,
  rateCards,
  rateCardEntries,
  zoneMaps,
  orderResults,
  orderBestResults,
} from '@/lib/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { runCalculationEngine } from '@/lib/engine'
import type { TplInput, LocationInput, RateCardWithEntries, EngineInput } from '@/types'

const CHUNK_SIZE = 100

async function bulkInsert<T extends object>(table: Parameters<typeof db.insert>[0], rows: T[]) {
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE)
    if (chunk.length > 0) {
      await db.insert(table).values(chunk as Parameters<typeof db.insert>[0][])
    }
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { analysisId } = body

  if (!analysisId) {
    return NextResponse.json({ error: 'analysisId required' }, { status: 400 })
  }

  // ── Load analysis ───────────────────────────────────────────────────────────
  const [analysis] = await db.select().from(analyses).where(eq(analyses.id, analysisId))
  if (!analysis) {
    return NextResponse.json({ error: 'Analysis not found' }, { status: 404 })
  }

  // ── Load orders ─────────────────────────────────────────────────────────────
  const allOrders = await db.select().from(orders).where(eq(orders.analysisId, analysisId))
  if (allOrders.length === 0) {
    return NextResponse.json({ error: 'No orders found for this analysis. Upload orders first.' }, { status: 400 })
  }

  // ── Load TPLs ───────────────────────────────────────────────────────────────
  const allTpls = await db.select().from(tpls).where(eq(tpls.analysisId, analysisId))
  if (allTpls.length === 0) {
    return NextResponse.json({ error: 'No 3PLs configured for this analysis. Add at least one 3PL.' }, { status: 400 })
  }

  const tplIds = allTpls.map(t => t.id)

  // ── Load locations ──────────────────────────────────────────────────────────
  const allLocations = await db.select().from(locations).where(inArray(locations.tplId, tplIds))

  for (const tpl of allTpls) {
    const tplLocs = allLocations.filter(l => l.tplId === tpl.id)
    if (tplLocs.length === 0) {
      return NextResponse.json(
        { error: `3PL "${tpl.name}" has no locations. Add at least one location.` },
        { status: 400 }
      )
    }
  }

  // ── Load rate cards with entries ────────────────────────────────────────────
  const allRateCards = await db.select().from(rateCards).where(inArray(rateCards.tplId, tplIds))

  for (const tpl of allTpls) {
    const tplCards = allRateCards.filter(rc => rc.tplId === tpl.id)
    if (tplCards.length === 0) {
      return NextResponse.json(
        { error: `3PL "${tpl.name}" has no rate cards. Upload at least one rate card.` },
        { status: 400 }
      )
    }
  }

  const rateCardIds = allRateCards.map(rc => rc.id)
  const allEntries = rateCardIds.length > 0
    ? await db.select().from(rateCardEntries).where(inArray(rateCardEntries.rateCardId, rateCardIds))
    : []

  // ── Load zone maps ──────────────────────────────────────────────────────────
  // One zone map query per unique origin ZIP3 (covers all locations across all TPLs)
  const uniqueOriginZip3s = [...new Set(allLocations.map(l => l.originZip3))]
  const allZoneMaps = uniqueOriginZip3s.length > 0
    ? await db.select().from(zoneMaps).where(inArray(zoneMaps.originZip3, uniqueOriginZip3s))
    : []

  // Build per-origin-zip3 Map<destZip3, zone>
  const zoneMapsByOrigin = new Map<string, Map<string, number>>()
  for (const row of allZoneMaps) {
    if (!zoneMapsByOrigin.has(row.originZip3)) {
      zoneMapsByOrigin.set(row.originZip3, new Map())
    }
    zoneMapsByOrigin.get(row.originZip3)!.set(row.destZip3, row.zone)
  }

  // ── Build EngineInput ───────────────────────────────────────────────────────
  const tplInputs: TplInput[] = allTpls.map(tpl => {
    const tplLocations = allLocations.filter(l => l.tplId === tpl.id)
    const tplRateCards = allRateCards.filter(rc => rc.tplId === tpl.id)

    const locationInputs: LocationInput[] = tplLocations.map(loc => ({
      location: {
        id: loc.id,
        tplId: loc.tplId,
        name: loc.name,
        originZip: loc.originZip,
        originZip3: loc.originZip3,
        createdAt: loc.createdAt,
      },
      zoneMaps: zoneMapsByOrigin.get(loc.originZip3) ?? new Map(),
    }))

    const rateCardInputs: RateCardWithEntries[] = tplRateCards.map(rc => ({
      rateCard: {
        id: rc.id,
        tplId: rc.tplId,
        name: rc.name,
        weightUnitMode: rc.weightUnitMode,
      },
      entries: allEntries
        .filter(e => e.rateCardId === rc.id)
        .map(e => ({
          id: e.id,
          rateCardId: e.rateCardId,
          weightValue: e.weightValue,
          weightUnit: e.weightUnit,
          zone: e.zone,
          priceCents: e.priceCents,
        })),
    }))

    return {
      tpl: {
        id: tpl.id,
        analysisId: tpl.analysisId,
        name: tpl.name,
        multiNodeEnabled: tpl.multiNodeEnabled,
        dimWeightEnabled: tpl.dimWeightEnabled,
        dimFactor: tpl.dimFactor,
        surchargeFlatCents: tpl.surchargeFlatCents,
        notes: tpl.notes,
        createdAt: tpl.createdAt,
      },
      locations: locationInputs,
      rateCards: rateCardInputs,
    }
  })

  const engineInput: EngineInput = {
    orders: allOrders.map(o => ({
      id: o.id,
      analysisId: o.analysisId,
      orderNumber: o.orderNumber,
      destZip: o.destZip,
      destZip3: o.destZip3,
      actualWeightLbs: o.actualWeightLbs,
      height: o.height,
      width: o.width,
      length: o.length,
      state: o.state,
    })),
    tpls: tplInputs,
  }

  // ── Run engine ──────────────────────────────────────────────────────────────
  const output = runCalculationEngine(engineInput)

  // ── Clear previous results for this analysis ────────────────────────────────
  const orderIds = allOrders.map(o => o.id)
  await db.delete(orderBestResults).where(inArray(orderBestResults.orderId, orderIds))
  await db.delete(orderResults).where(inArray(orderResults.orderId, orderIds))

  // ── Persist new results ─────────────────────────────────────────────────────
  if (output.orderResults.length > 0) {
    await bulkInsert(orderResults, output.orderResults)
  }
  if (output.orderBestResults.length > 0) {
    await bulkInsert(orderBestResults, output.orderBestResults)
  }

  // ── Mark analysis complete ──────────────────────────────────────────────────
  await db
    .update(analyses)
    .set({ status: 'complete', updatedAt: new Date().toISOString() })
    .where(eq(analyses.id, analysisId))

  return NextResponse.json({
    tplSummaries: output.tplSummaries,
    includedOrders: output.includedOrderIds.length,
    excludedOrders: output.excludedOrders.length,
    excluded: output.excludedOrders,
    warnings: output.warnings,
  })
}
