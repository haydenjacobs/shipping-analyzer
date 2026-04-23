/**
 * GET /api/analyses/[id]/results
 *
 * Returns the full OrderResult matrix plus the analysis + warehouse metadata
 * needed to render the Results View. Step 7 (Optimized) is executed client-side
 * over this matrix — the engine runs once at calculate time; the UI re-derives
 * optimized aggregates on every checkbox toggle.
 *
 * Size tripwire: matrices larger than 500K cells (orders × warehouses) return
 * 413 so v1 isn't silently responsible for multi-MB JSON blobs. If this fires
 * for a real analysis we'll design pagination / streaming in v2.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  analyses,
  warehouses,
  orders,
  orderResults,
  excludedOrders as excludedOrdersTable,
} from '@/lib/db/schema'
import { eq, inArray, sql } from 'drizzle-orm'
import { apiError, notFound } from '../../../_lib/errors'
import { serializeAnalysis } from '../../../_lib/serializers'

const MAX_MATRIX_CELLS = 500_000

function parseId(raw: string) {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params
  const id = parseId(rawId)
  if (id === null) return apiError('BAD_REQUEST', 'invalid id', 400)

  const analysisRow = db.select().from(analyses).where(eq(analyses.id, id)).get()
  if (!analysisRow) return notFound('Analysis')

  if (analysisRow.status !== 'complete') {
    return NextResponse.json(
      { error: { code: 'NOT_CALCULATED', message: 'Run calculation first' } },
      { status: 409 },
    )
  }

  const whRows = db.select().from(warehouses).where(eq(warehouses.analysisId, id)).all()

  const orderCount = Number(
    db
      .select({ n: sql<number>`count(*)` })
      .from(orders)
      .where(eq(orders.analysisId, id))
      .get()?.n ?? 0,
  )

  // Size guard. Approximation before hitting the big result table — if orders *
  // warehouses already exceeds the cap, bail before doing a wide fetch.
  if (orderCount * whRows.length > MAX_MATRIX_CELLS) {
    return NextResponse.json(
      {
        error: {
          code: 'MATRIX_TOO_LARGE',
          message:
            'This analysis is too large for the current Results View. Contact the developer.',
        },
      },
      { status: 413 },
    )
  }

  // Included order IDs = orders for this analysis NOT in excluded_orders.
  const orderRows = db
    .select()
    .from(orders)
    .where(eq(orders.analysisId, id))
    .all()
  const orderIds = orderRows.map((r) => r.id)

  const excludedRows =
    orderIds.length === 0
      ? []
      : db
          .select({ orderId: excludedOrdersTable.orderId })
          .from(excludedOrdersTable)
          .where(inArray(excludedOrdersTable.orderId, orderIds))
          .all()
  const excludedSet = new Set(excludedRows.map((r) => r.orderId))
  const includedIds = orderIds.filter((oid) => !excludedSet.has(oid))

  const resultRows =
    includedIds.length === 0
      ? []
      : db
          .select({
            orderId: orderResults.orderId,
            warehouseId: orderResults.warehouseId,
            zone: orderResults.zone,
            totalCostCents: orderResults.totalCostCents,
            billableWeightValue: orderResults.billableWeightValue,
            billableWeightUnit: orderResults.billableWeightUnit,
          })
          .from(orderResults)
          .where(inArray(orderResults.orderId, includedIds))
          .all()

  // Group into the matrix shape: per-order, list of (warehouseId, zone, cost, billable weight).
  const byOrder = new Map<number, {
    warehouse_id: number
    zone: number
    total_cost_cents: number
    billable_weight_value: number
    billable_weight_unit: string
  }[]>()
  for (const r of resultRows) {
    const list = byOrder.get(r.orderId) ?? []
    list.push({
      warehouse_id: r.warehouseId,
      zone: r.zone,
      total_cost_cents: r.totalCostCents,
      billable_weight_value: r.billableWeightValue,
      billable_weight_unit: r.billableWeightUnit,
    })
    byOrder.set(r.orderId, list)
  }

  const matrix = includedIds
    .filter((oid) => byOrder.has(oid))
    .map((oid) => ({ order_id: oid, results: byOrder.get(oid)! }))

  // Include order details for the Detailed Breakdown table.
  const includedSet = new Set(includedIds)
  const ordersDetail = orderRows
    .filter((o) => includedSet.has(o.id))
    .map((o) => ({
      id: o.id,
      order_number: o.orderNumber,
      actual_weight_lbs: o.actualWeightLbs,
      height: o.height,
      width: o.width,
      length: o.length,
      dest_zip: o.destZip,
      state: o.state,
    }))

  const analysis = serializeAnalysis(analysisRow)

  return NextResponse.json({
    analysis: {
      id: analysis.id,
      name: analysis.name,
      viewMode: analysis.viewMode,
      excludedLocations: analysis.excludedLocations,
      status: analysis.status,
      projectedOrderCount: analysis.projectedOrderCount,
      projectedPeriod: analysis.projectedPeriod,
      shareableToken: analysis.shareableToken,
    },
    warehouses: whRows.map((w) => ({
      id: w.id,
      provider_name: w.providerName,
      location_label: w.locationLabel,
      origin_zip: w.originZip,
      origin_zip3: w.originZip3,
    })),
    orders_included_count: matrix.length,
    orders_excluded_count: excludedSet.size,
    matrix,
    orders: ordersDetail,
  })
}
