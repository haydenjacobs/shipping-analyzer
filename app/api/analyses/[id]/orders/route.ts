import { NextRequest, NextResponse } from 'next/server'
import { db, sqlite } from '@/lib/db'
import { analyses, orders as ordersTable } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { apiError, notFound, zodErrorResponse } from '../../../_lib/errors'
import { orderColumnMappingSchema, paginationSchema } from '../../../_lib/schemas'
import { readUploadedFile, FileParseError, UnsupportedFileTypeError } from '../../../_lib/multipart'
import { parseOrderRows, type ColumnMapping } from '@/lib/parsers/order-parser'

function parseId(raw: string) {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

function analysisExists(id: number) {
  return db.select({ id: analyses.id }).from(analyses).where(eq(analyses.id, id)).get()
}

/**
 * POST — multipart upload with a column-mapping JSON string.
 * Replaces any existing orders on the analysis (delete + insert) in one
 * transaction. Returns { imported, failed, failures, total }.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params
  const id = parseId(rawId)
  if (id === null) return apiError('BAD_REQUEST', 'invalid id', 400)
  if (!analysisExists(id)) return notFound('Analysis')

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return apiError('BAD_REQUEST', 'Expected multipart/form-data body', 400)
  }

  const rawMapping = form.get('mapping')
  if (!rawMapping || typeof rawMapping !== 'string') {
    return apiError('BAD_REQUEST', 'Missing "mapping" field', 400)
  }
  let mappingJson: unknown
  try {
    mappingJson = JSON.parse(rawMapping)
  } catch {
    return apiError('BAD_REQUEST', '"mapping" must be valid JSON', 400)
  }
  const parsedMapping = orderColumnMappingSchema.safeParse(mappingJson)
  if (!parsedMapping.success) return zodErrorResponse(parsedMapping.error, 'Invalid column mapping')

  let file
  try {
    file = await readUploadedFile(form)
  } catch (e) {
    if (e instanceof UnsupportedFileTypeError) return apiError('BAD_REQUEST', e.message, 400)
    if (e instanceof FileParseError) return apiError('PARSE_ERROR', e.message, 400)
    throw e
  }

  const mapping: ColumnMapping = {
    orderNumber: parsedMapping.data.order_number,
    destZip: parsedMapping.data.dest_zip,
    weightColumn: parsedMapping.data.weight,
    weightUnit: parsedMapping.data.weight_unit,
    height: parsedMapping.data.height,
    width: parsedMapping.data.width,
    length: parsedMapping.data.length,
    state: parsedMapping.data.state,
  }

  // Validate that mapped columns exist in the uploaded file's headers.
  const headerSet = new Set(file.parsed.headers)
  const required: [string, string][] = [
    ['order_number', mapping.orderNumber],
    ['dest_zip', mapping.destZip],
    ['weight', mapping.weightColumn],
  ]
  const missing = required.filter(([, col]) => !headerSet.has(col)).map(([k]) => k)
  if (missing.length > 0) {
    return apiError(
      'VALIDATION_ERROR',
      `Mapping references column(s) not found in file: ${missing.join(', ')}`,
      400,
      { missing },
    )
  }

  const parseResult = parseOrderRows(file.parsed.rows, mapping)

  // Replace existing orders (and their derived results via CASCADE) atomically.
  const inserted: number = sqlite.transaction(() => {
    db.delete(ordersTable).where(eq(ordersTable.analysisId, id)).run()
    if (parseResult.rows.length === 0) return 0
    const rows = parseResult.rows.map((r) => ({
      analysisId: id,
      orderNumber: r.orderNumber,
      destZip: r.destZip,
      destZip3: r.destZip3,
      actualWeightLbs: r.actualWeightLbs,
      height: r.height ?? null,
      width: r.width ?? null,
      length: r.length ?? null,
      state: r.state ?? null,
    }))
    // SQLite caps bound parameters at 32766. Each row binds 9 params,
    // so chunk inserts to stay under the limit for large order files.
    const CHUNK = 1000
    for (let i = 0; i < rows.length; i += CHUNK) {
      db.insert(ordersTable).values(rows.slice(i, i + CHUNK)).run()
    }
    return rows.length
  })()

  db.update(analyses)
    .set({ status: 'draft', updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(analyses.id, id))
    .run()

  return NextResponse.json({
    imported: inserted,
    failed: parseResult.errors.length,
    failures: parseResult.errors,
    total: inserted + parseResult.errors.length,
    warnings: parseResult.warnings,
  })
}

/** GET — paginated order list. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params
  const id = parseId(rawId)
  if (id === null) return apiError('BAD_REQUEST', 'invalid id', 400)
  if (!analysisExists(id)) return notFound('Analysis')

  const { searchParams } = new URL(req.url)
  const pagination = paginationSchema.safeParse({
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  })
  if (!pagination.success) return zodErrorResponse(pagination.error)
  const { page, pageSize } = pagination.data

  const total = Number(
    db
      .select({ n: sql<number>`count(*)` })
      .from(ordersTable)
      .where(eq(ordersTable.analysisId, id))
      .get()?.n ?? 0,
  )

  const rows = db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.analysisId, id))
    .orderBy(ordersTable.id)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all()

  return NextResponse.json({ page, pageSize, total, rows })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params
  const id = parseId(rawId)
  if (id === null) return apiError('BAD_REQUEST', 'invalid id', 400)
  if (!analysisExists(id)) return notFound('Analysis')

  const result = db
    .delete(ordersTable)
    .where(eq(ordersTable.analysisId, id))
    .run()
  return NextResponse.json({ deleted: result.changes ?? 0 })
}
