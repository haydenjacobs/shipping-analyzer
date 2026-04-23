/**
 * Advanced override: upload a per-warehouse zone chart that overrides the
 * shared USPS zone_maps rows for this warehouse's origin ZIP-3.
 *
 * Behavior:
 *   - If zone rows already exist for this origin_zip3 and ?replace=true is not
 *     set, returns 409 CONFLICT with { conflict: true, existing_count }.
 *   - With ?replace=true, deletes existing rows for this origin_zip3 and
 *     inserts the uploaded rows in a single transaction.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db, sqlite } from '@/lib/db'
import { warehouses, zoneMaps } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { apiError, notFound } from '../../../_lib/errors'
import { readUploadedFile, FileParseError, UnsupportedFileTypeError } from '../../../_lib/multipart'
import { parseZoneChart } from '@/lib/parsers/zone-chart-parser'

function parseId(raw: string) {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params
  const warehouseId = parseId(rawId)
  if (warehouseId === null) return apiError('BAD_REQUEST', 'invalid id', 400)

  const wh = db.select().from(warehouses).where(eq(warehouses.id, warehouseId)).get()
  if (!wh) return notFound('Warehouse')

  const { searchParams } = new URL(req.url)
  const replace = searchParams.get('replace') === 'true'

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return apiError('BAD_REQUEST', 'Expected multipart/form-data body', 400)
  }

  let file
  try {
    file = await readUploadedFile(form)
  } catch (e) {
    if (e instanceof UnsupportedFileTypeError) return apiError('BAD_REQUEST', e.message, 400)
    if (e instanceof FileParseError) return apiError('PARSE_ERROR', e.message, 400)
    throw e
  }

  // Re-serialize to CSV text for the zone-chart-parser (header-based).
  const csvText = file.parsed.grid
    .map((row) => row.map((cell) => (cell.includes(',') ? `"${cell}"` : cell)).join(','))
    .join('\n')
  const parsed = parseZoneChart(csvText)
  if (parsed.errors.length > 0 || parsed.rows.length === 0) {
    return apiError('PARSE_ERROR', 'Zone chart could not be parsed', 400, { errors: parsed.errors })
  }

  const existingCount = Number(
    db
      .select({ n: sql<number>`count(*)` })
      .from(zoneMaps)
      .where(eq(zoneMaps.originZip3, wh.originZip3))
      .get()?.n ?? 0,
  )

  if (existingCount > 0 && !replace) {
    return apiError(
      'CONFLICT',
      `Zone data already exists for origin ZIP3 ${wh.originZip3}. Re-POST with ?replace=true to overwrite.`,
      409,
      { conflict: true, existing_count: existingCount },
    )
  }

  const inserted = sqlite.transaction(() => {
    if (existingCount > 0) {
      db.delete(zoneMaps).where(eq(zoneMaps.originZip3, wh.originZip3)).run()
    }
    db.insert(zoneMaps)
      .values(
        parsed.rows.map((r) => ({
          originZip3: wh.originZip3,
          destZip3: r.destZip3,
          zone: r.zone,
        })),
      )
      .run()
    return parsed.rows.length
  })()

  return NextResponse.json({ inserted, replaced: existingCount > 0 })
}
