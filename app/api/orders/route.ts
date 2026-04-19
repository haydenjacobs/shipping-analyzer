import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { orders } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { parseOrders, parseOrderRows, ColumnMapping } from '@/lib/parsers/order-parser'
import { parseFilePayload, FileParseError } from '@/lib/parsers/file-parser'

export async function GET(req: NextRequest) {
  const analysisId = req.nextUrl.searchParams.get('analysisId')
  if (!analysisId) return NextResponse.json({ error: 'analysisId required' }, { status: 400 })
  const rows = await db.select().from(orders).where(eq(orders.analysisId, parseInt(analysisId)))
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { analysisId, csvText, mapping, fileType, fileData, filename } = body as {
    analysisId: number
    mapping: ColumnMapping
    // One of these must be provided:
    csvText?: string             // legacy CSV-only path
    fileType?: 'csv' | 'excel'   // new path (CSV or Excel)
    fileData?: string            // CSV text or Excel base64
    filename?: string
  }

  if (!analysisId || !mapping) {
    return NextResponse.json({ error: 'analysisId and mapping required' }, { status: 400 })
  }

  let parseResult: ReturnType<typeof parseOrders>

  if (fileType && fileData) {
    // New path: server-side file parsing for both CSV and Excel
    try {
      const parsed = parseFilePayload({ fileType, data: fileData, filename })
      parseResult = parseOrderRows(parsed.rows, mapping)
    } catch (e) {
      const msg = e instanceof FileParseError ? e.message : 'Failed to read file'
      return NextResponse.json({ error: msg }, { status: 400 })
    }
  } else if (csvText) {
    // Legacy path: CSV text already read on the client
    parseResult = parseOrders(csvText, mapping)
  } else {
    return NextResponse.json(
      { error: 'Either fileType+fileData or csvText is required' },
      { status: 400 },
    )
  }

  const { rows, errors, warnings } = parseResult

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No valid rows parsed', errors }, { status: 400 })
  }

  // Clear existing orders for this analysis before inserting
  await db.delete(orders).where(eq(orders.analysisId, analysisId))

  // Insert in batches
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500)
    await db.insert(orders).values(batch.map(r => ({ ...r, analysisId })))
  }

  return NextResponse.json(
    {
      imported: rows.length,
      failed: errors.length,
      errors,
      warnings,
    },
    { status: 201 },
  )
}
