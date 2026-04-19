import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { locations, orderResults } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { normalizeZip, getZip3, isValidZip5 } from '@/lib/utils/zip'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params
  const id = parseInt(idStr)
  const body = await req.json()

  const updates: Record<string, unknown> = {}

  if (body.name) updates.name = String(body.name).trim()

  if (body.originZip) {
    const normalized = normalizeZip(body.originZip)
    if (!isValidZip5(normalized)) {
      return NextResponse.json({ error: `Invalid origin ZIP: "${body.originZip}"` }, { status: 400 })
    }
    updates.originZip = normalized
    updates.originZip3 = getZip3(normalized)
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const [updated] = await db.update(locations).set(updates).where(eq(locations.id, id)).returning()
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params
  const id = parseInt(idStr)

  await db.delete(orderResults).where(eq(orderResults.locationId, id))
  await db.delete(locations).where(eq(locations.id, id))

  return NextResponse.json({ ok: true })
}
