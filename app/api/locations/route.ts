import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { locations } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { normalizeZip, getZip3, isValidZip5 } from '@/lib/utils/zip'

export async function GET(req: NextRequest) {
  const tplId = req.nextUrl.searchParams.get('tplId')
  if (!tplId) return NextResponse.json({ error: 'tplId required' }, { status: 400 })

  const rows = await db.select().from(locations).where(eq(locations.tplId, parseInt(tplId)))
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { tplId, name, originZip } = body

  if (!tplId || !name?.trim() || !originZip) {
    return NextResponse.json({ error: 'tplId, name, and originZip required' }, { status: 400 })
  }

  const normalized = normalizeZip(originZip)
  if (!isValidZip5(normalized)) {
    return NextResponse.json({ error: `Invalid origin ZIP: "${originZip}"` }, { status: 400 })
  }

  const [location] = await db.insert(locations).values({
    tplId,
    name: name.trim(),
    originZip: normalized,
    originZip3: getZip3(normalized),
  }).returning()

  return NextResponse.json(location, { status: 201 })
}
