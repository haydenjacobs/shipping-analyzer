import { NextRequest, NextResponse } from 'next/server'
import { parseRateCard2D } from '@/lib/parsers/rate-card-parser'
import { parseFilePayload, FileParseError } from '@/lib/parsers/file-parser'

// POST /api/rate-cards/parse
// Parse a rate card (CSV text, Excel base64, or pasted text) and return a structured preview.
// Does NOT save anything to the database.
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { inputType, fileType, data, filename } = body as {
    inputType: 'file' | 'paste'
    fileType?: 'csv' | 'excel'
    data: string
    filename?: string
  }

  if (!inputType || !data) {
    return NextResponse.json({ error: 'inputType and data required' }, { status: 400 })
  }

  let grid: string[][]

  if (inputType === 'file') {
    if (!fileType) {
      return NextResponse.json(
        { error: 'fileType required for file uploads (csv or excel)' },
        { status: 400 },
      )
    }
    try {
      const parsed = parseFilePayload({ fileType, data, filename })
      grid = parsed.grid
    } catch (e) {
      const msg = e instanceof FileParseError ? e.message : 'Failed to read file'
      return NextResponse.json({ sections: [], warnings: [], errors: [msg] }, { status: 400 })
    }
  } else {
    // Paste — split by newlines and tabs
    grid = data.split(/\r?\n/).map(line => line.split('\t'))
  }

  const output = parseRateCard2D({ data: grid, inputMode: inputType })

  return NextResponse.json(output)
}
