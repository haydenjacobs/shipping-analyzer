import { NextRequest, NextResponse } from 'next/server'
import { db, sqlite } from '@/lib/db'
import { analyses, warehouses, rateCards, rateCardEntries } from '@/lib/db/schema'
import { and, desc, eq, inArray, ne } from 'drizzle-orm'
import { warehouseCreateSchema } from '../../../_lib/schemas'
import { apiError, notFound, zodErrorResponse } from '../../../_lib/errors'
import { normalizeZip, getZip3, isValidZip5 } from '@/lib/utils/zip'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params
  const analysisId = Number(rawId)
  if (!Number.isInteger(analysisId) || analysisId <= 0)
    return apiError('BAD_REQUEST', 'invalid id', 400)

  const analysisExists = db.select({ id: analyses.id }).from(analyses).where(eq(analyses.id, analysisId)).get()
  if (!analysisExists) return notFound('Analysis')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('BAD_REQUEST', 'Invalid JSON body', 400)
  }
  const parsed = warehouseCreateSchema.safeParse(body)
  if (!parsed.success) return zodErrorResponse(parsed.error)

  const normalizedZip = normalizeZip(parsed.data.origin_zip)
  if (!isValidZip5(normalizedZip)) {
    return apiError('VALIDATION_ERROR', `Invalid origin_zip: "${parsed.data.origin_zip}"`, 400)
  }

  const row = sqlite.transaction(() => {
    const [newWh] = db
      .insert(warehouses)
      .values({
        analysisId,
        providerName: parsed.data.provider_name,
        locationLabel: parsed.data.location_label,
        originZip: normalizedZip,
        originZip3: getZip3(normalizedZip),
        dimWeightEnabled: parsed.data.dim_weight_enabled ?? false,
        dimFactor: parsed.data.dim_factor ?? null,
        surchargeFlatCents: parsed.data.surcharge_flat_cents ?? 0,
        notes: parsed.data.notes ?? null,
      })
      .returning()
      .all()

    // Copy rate card from sibling warehouse if this provider already has one.
    // This ensures a new location added to an existing provider inherits its rate card.
    const siblings = db
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(
        and(
          eq(warehouses.analysisId, analysisId),
          eq(warehouses.providerName, parsed.data.provider_name),
          ne(warehouses.id, newWh.id),
        ),
      )
      .all()

    if (siblings.length > 0) {
      const sourceCard = db
        .select()
        .from(rateCards)
        .where(inArray(rateCards.warehouseId, siblings.map((s) => s.id)))
        .orderBy(desc(rateCards.id))
        .limit(1)
        .get()

      if (sourceCard) {
        const sourceEntries = db
          .select()
          .from(rateCardEntries)
          .where(eq(rateCardEntries.rateCardId, sourceCard.id))
          .all()

        const [newCard] = db
          .insert(rateCards)
          .values({
            warehouseId: newWh.id,
            name: sourceCard.name,
            weightUnitMode: sourceCard.weightUnitMode,
          })
          .returning()
          .all()

        if (sourceEntries.length > 0) {
          db.insert(rateCardEntries)
            .values(
              sourceEntries.map((e) => ({
                rateCardId: newCard.id,
                weightValue: e.weightValue,
                weightUnit: e.weightUnit,
                zone: e.zone,
                priceCents: e.priceCents,
              })),
            )
            .run()
        }
      }
    }

    return newWh
  })()

  return NextResponse.json(row, { status: 201 })
}
