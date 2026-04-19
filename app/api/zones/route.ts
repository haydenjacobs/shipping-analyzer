import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { zoneMaps } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { parseZoneChart } from '@/lib/parsers/zone-chart-parser'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { originZip3, csvText, replace } = body

  if (!originZip3 || !csvText) {
    return NextResponse.json({ error: 'originZip3 and csvText required' }, { status: 400 })
  }

  const { rows, errors } = parseZoneChart(csvText)
  if (errors.length > 0 && rows.length === 0) {
    return NextResponse.json({ error: 'Parse failed', errors }, { status: 400 })
  }

  if (replace) {
    await db.delete(zoneMaps).where(eq(zoneMaps.originZip3, originZip3))
  }

  if (rows.length > 0) {
    // Insert in batches of 500
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500)
      await db.insert(zoneMaps).values(
        batch.map(r => ({ originZip3, destZip3: r.destZip3, zone: r.zone }))
      ).onConflictDoUpdate({
        target: [zoneMaps.originZip3, zoneMaps.destZip3],
        set: { zone: zoneMaps.zone },
      })
    }
  }

  return NextResponse.json({ imported: rows.length, errors })
}

export async function GET(req: NextRequest) {
  const originZip3 = req.nextUrl.searchParams.get('originZip3')
  if (!originZip3) return NextResponse.json({ error: 'originZip3 required' }, { status: 400 })
  const rows = await db.select().from(zoneMaps).where(eq(zoneMaps.originZip3, originZip3))
  return NextResponse.json(rows)
}
