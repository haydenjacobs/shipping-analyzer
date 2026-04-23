import { NextRequest, NextResponse } from 'next/server'
import { db, sqlite } from '@/lib/db'
import { rateCardEntries, rateCards, warehouses } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { apiError, notFound, zodErrorResponse } from '../../../_lib/errors'
import { rateCardCreateSchema } from '../../../_lib/schemas'
import { readUploadedFile, FileParseError, UnsupportedFileTypeError } from '../../../_lib/multipart'
import {
  parseRateCard2D,
  type ParsedSection,
  dollarsToCents,
} from '@/lib/parsers/rate-card-parser'
import type { WeightUnit, WeightUnitMode } from '@/types'

function parseId(raw: string) {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

/**
 * Assign a weight_unit to each parsed section based on the user's declared
 * weight_unit_mode. The parser detects units when possible; this step fills in
 * the remaining unknowns deterministically from the mode. Returns either a
 * resolved array of (section, unit) pairs, or an error string explaining why
 * the sections don't match the declared mode.
 */
function resolveSectionUnits(
  sections: ParsedSection[],
  mode: WeightUnitMode,
): { ok: true; assigned: Array<{ section: ParsedSection; unit: WeightUnit }> } | { ok: false; error: string } {
  if (sections.length === 0) return { ok: false, error: 'Rate card contained no data sections' }

  if (mode === 'oz_only') {
    return {
      ok: true,
      assigned: sections.map((s) => ({ section: s, unit: 'oz' as const })),
    }
  }
  if (mode === 'lbs_only') {
    return {
      ok: true,
      assigned: sections.map((s) => ({ section: s, unit: 'lbs' as const })),
    }
  }

  // oz_then_lbs: expect exactly two sections, with an oz section first and
  // lbs second. Prefer the parser's detected units; fall back to order when
  // the parser could only produce 'unknown'.
  if (sections.length !== 2) {
    return {
      ok: false,
      error: `Mode "oz_then_lbs" expects two sections (oz then lbs); parser found ${sections.length}`,
    }
  }
  const [a, b] = sections
  const unitA: WeightUnit = a.detectedUnit === 'lbs' ? 'lbs' : 'oz'
  const unitB: WeightUnit = b.detectedUnit === 'oz' ? 'oz' : 'lbs'
  if (unitA !== 'oz' || unitB !== 'lbs') {
    return {
      ok: false,
      error: `Mode "oz_then_lbs" expects an oz section followed by a lbs section (got ${unitA} then ${unitB})`,
    }
  }
  return {
    ok: true,
    assigned: [
      { section: a, unit: 'oz' },
      { section: b, unit: 'lbs' },
    ],
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params
  const warehouseId = parseId(rawId)
  if (warehouseId === null) return apiError('BAD_REQUEST', 'invalid id', 400)

  const wh = db.select({ id: warehouses.id }).from(warehouses).where(eq(warehouses.id, warehouseId)).get()
  if (!wh) return notFound('Warehouse')

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return apiError('BAD_REQUEST', 'Expected multipart/form-data body', 400)
  }

  const metaObj: Record<string, unknown> = {}
  for (const key of ['name', 'weight_unit_mode', 'input_mode']) {
    const val = form.get(key)
    if (typeof val === 'string') metaObj[key] = val
  }
  const parsedMeta = rateCardCreateSchema.safeParse(metaObj)
  if (!parsedMeta.success) return zodErrorResponse(parsedMeta.error)

  let file
  try {
    file = await readUploadedFile(form, 'file', { skipHeaderValidation: true })
  } catch (e) {
    if (e instanceof UnsupportedFileTypeError) return apiError('BAD_REQUEST', e.message, 400)
    if (e instanceof FileParseError) return apiError('PARSE_ERROR', e.message, 400)
    throw e
  }

  const parsed = parseRateCard2D({
    data: file.parsed.grid,
    inputMode: parsedMeta.data.input_mode === 'paste' ? 'paste' : 'file',
  })
  if (parsed.errors.length > 0) {
    return apiError('PARSE_ERROR', 'Rate card failed validation', 400, {
      errors: parsed.errors,
      warnings: parsed.warnings,
    })
  }

  const resolved = resolveSectionUnits(parsed.sections, parsedMeta.data.weight_unit_mode)
  if (!resolved.ok) {
    return apiError('VALIDATION_ERROR', resolved.error, 400, { warnings: parsed.warnings })
  }

  // Flatten into rate_card_entries rows.
  const entryValues: Array<{
    weightValue: number
    weightUnit: WeightUnit
    zone: number
    priceCents: number
  }> = []
  for (const { section, unit } of resolved.assigned) {
    for (let rowIdx = 0; rowIdx < section.weights.length; rowIdx++) {
      const weight = section.weights[rowIdx]
      for (let zIdx = 0; zIdx < section.zoneColumns.length; zIdx++) {
        const zone = section.zoneColumns[zIdx]
        const priceDollars = section.prices[rowIdx]?.[zIdx]
        const cents = dollarsToCents(priceDollars ?? null)
        if (cents == null) {
          return apiError(
            'PARSE_ERROR',
            `Missing or invalid price at weight ${weight}${unit}, zone ${zone}`,
            400,
            { warnings: parsed.warnings },
          )
        }
        entryValues.push({ weightValue: weight, weightUnit: unit, zone, priceCents: cents })
      }
    }
  }

  // Persist rate card + entries atomically.
  const rateCardRow = sqlite.transaction(() => {
    const [rc] = db
      .insert(rateCards)
      .values({
        warehouseId,
        name: parsedMeta.data.name,
        weightUnitMode: parsedMeta.data.weight_unit_mode,
      })
      .returning()
      .all()

    db.insert(rateCardEntries)
      .values(entryValues.map((e) => ({ rateCardId: rc.id, ...e })))
      .run()

    return rc
  })()

  return NextResponse.json(
    {
      rateCard: rateCardRow,
      entryCount: entryValues.length,
      warnings: parsed.warnings,
    },
    { status: 201 },
  )
}
