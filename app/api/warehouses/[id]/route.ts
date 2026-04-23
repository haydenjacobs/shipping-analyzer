import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { warehouses } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { warehousePatchSchema } from '../../_lib/schemas'
import { apiError, notFound, zodErrorResponse } from '../../_lib/errors'
import { normalizeZip, getZip3, isValidZip5 } from '@/lib/utils/zip'

function parseId(raw: string) {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params
  const id = parseId(rawId)
  if (id === null) return apiError('BAD_REQUEST', 'invalid id', 400)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('BAD_REQUEST', 'Invalid JSON body', 400)
  }
  const parsed = warehousePatchSchema.safeParse(body)
  if (!parsed.success) return zodErrorResponse(parsed.error)

  const patch: Record<string, unknown> = {}
  if (parsed.data.provider_name !== undefined) patch.providerName = parsed.data.provider_name
  if (parsed.data.location_label !== undefined) patch.locationLabel = parsed.data.location_label
  if (parsed.data.origin_zip !== undefined) {
    const normalized = normalizeZip(parsed.data.origin_zip)
    if (!isValidZip5(normalized)) {
      return apiError('VALIDATION_ERROR', `Invalid origin_zip: "${parsed.data.origin_zip}"`, 400)
    }
    patch.originZip = normalized
    patch.originZip3 = getZip3(normalized)
  }
  if (parsed.data.dim_weight_enabled !== undefined) patch.dimWeightEnabled = parsed.data.dim_weight_enabled
  if (parsed.data.dim_factor !== undefined) patch.dimFactor = parsed.data.dim_factor
  if (parsed.data.surcharge_flat_cents !== undefined)
    patch.surchargeFlatCents = parsed.data.surcharge_flat_cents
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes

  const result = db.update(warehouses).set(patch).where(eq(warehouses.id, id)).returning().all()
  if (result.length === 0) return notFound('Warehouse')
  return NextResponse.json(result[0])
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params
  const id = parseId(rawId)
  if (id === null) return apiError('BAD_REQUEST', 'invalid id', 400)

  const result = db.delete(warehouses).where(eq(warehouses.id, id)).returning({ id: warehouses.id }).all()
  if (result.length === 0) return notFound('Warehouse')
  return NextResponse.json({ deleted: true })
}
