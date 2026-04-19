import { NextRequest, NextResponse } from 'next/server'
import { parseFilePayload, FileParseError } from '@/lib/parsers/file-parser'

// POST /api/orders/parse
// Given a file payload (CSV text or Excel base64), return headers + a small
// preview so the client can present the column-mapping UI. Does NOT insert
// anything into the database.
//
// Response shape: { headers: string[], rowCount: number, preview: Record<string, string>[] }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { fileType, data, filename } = body as {
    fileType: 'csv' | 'excel'
    data: string
    filename?: string
  }

  if (!fileType || !data) {
    return NextResponse.json({ error: 'fileType and data required' }, { status: 400 })
  }

  try {
    const parsed = parseFilePayload({ fileType, data, filename })
    return NextResponse.json({
      headers: parsed.headers,
      rowCount: parsed.rows.length,
      preview: parsed.rows.slice(0, 5),
      filename: parsed.filename,
    })
  } catch (e) {
    const msg = e instanceof FileParseError ? e.message : 'Failed to read file'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
