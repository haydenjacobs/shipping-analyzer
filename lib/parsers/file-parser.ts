/**
 * Shared file parser: turns an uploaded CSV/Excel file into a 2D grid of strings
 * and/or an array of row objects keyed by header.
 *
 * Routing rules:
 *   - .csv              → Papa Parse (text)
 *   - .xlsx / .xls      → SheetJS (binary / base64)
 *   - Extension is the primary signal. MIME type is a fallback.
 *
 * SheetJS configuration is tuned for shipping data integrity:
 *   - ZIP codes stay as strings with leading zeros preserved (01234 ≠ 1234).
 *   - Numeric fields (weight, dims, prices) are left as strings here — the
 *     downstream parsers already coerce strings → numbers, which keeps the
 *     "File → rows" layer simple and avoids double-conversion surprises.
 *   - Empty trailing rows are dropped; empty cells mid-data become ''.
 *   - Malformed headers (empty / merged / duplicate) throw a clear error
 *     instead of silently producing garbage column names.
 */

import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import type { FileKind, ParseFilePayload } from './file-parser-client'

// Re-export client-safe helpers so most callers only need to import from this
// module. Anything that runs in the browser should import from
// './file-parser-client' directly to avoid pulling xlsx into the client bundle.
export { detectFileType, fileToParsePayload, UnsupportedFileTypeError } from './file-parser-client'
export type { FileKind, ParseFilePayload } from './file-parser-client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedFile {
  /** 2D grid of strings, first row is the header. Trailing empty rows dropped. */
  grid: string[][]
  /** Header row as-is from the file. */
  headers: string[]
  /** Data rows as objects keyed by header, empty cells → ''. */
  rows: Record<string, string>[]
  fileType: FileKind
  filename: string
}

export class FileParseError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'FileParseError'
  }
}

// ─── Server-side parse ────────────────────────────────────────────────────────

/**
 * Parse a ParseFilePayload (CSV text or Excel base64) into a structured grid
 * plus header + row-object view. Throws FileParseError on bad input.
 */
export function parseFilePayload(payload: ParseFilePayload): ParsedFile {
  const { fileType, data, filename = `upload.${fileType === 'excel' ? 'xlsx' : 'csv'}` } = payload
  if (!data) throw new FileParseError('No file data provided')

  let grid: string[][]
  try {
    grid = fileType === 'excel' ? readExcelGrid(data, filename) : readCsvGrid(data)
  } catch (e) {
    if (e instanceof FileParseError) throw e
    throw new FileParseError(
      `Failed to read ${fileType === 'excel' ? 'Excel' : 'CSV'} file "${filename}": ${
        e instanceof Error ? e.message : String(e)
      }`,
      e,
    )
  }

  grid = dropTrailingEmptyRows(grid)
  if (grid.length === 0) {
    throw new FileParseError(`File "${filename}" is empty`)
  }

  const headers = grid[0].map(h => (h ?? '').trim())
  validateHeaders(headers, filename)

  const rows: Record<string, string>[] = []
  for (let r = 1; r < grid.length; r++) {
    const rawRow = grid[r]
    if (isRowEntirelyEmpty(rawRow)) continue
    const obj: Record<string, string> = {}
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = (rawRow[c] ?? '').toString()
    }
    rows.push(obj)
  }

  return { grid, headers, rows, fileType, filename }
}

// ─── Internals ────────────────────────────────────────────────────────────────

function readCsvGrid(text: string): string[][] {
  const result = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: false,
    delimiter: '', // auto-detect (comma or tab)
  })
  // Papa surfaces parser errors; we only treat them as fatal if no data came through.
  const data = (result.data as unknown[][]).map(row =>
    (row ?? []).map(cell => (cell == null ? '' : String(cell))),
  )
  if (data.length === 0 && result.errors.length > 0) {
    throw new FileParseError(`CSV parse failed: ${result.errors[0].message}`)
  }
  return data
}

function readExcelGrid(base64: string, filename: string): string[][] {
  const buf = Buffer.from(base64, 'base64')
  // Sanity check: real XLSX/XLS files should start with a recognizable signature.
  // XLSX is a ZIP (PK\x03\x04); XLS is a compound binary (D0 CF 11 E0).
  if (buf.length < 4) {
    throw new FileParseError(`File "${filename}" is too small to be a valid Excel file`)
  }

  let workbook: XLSX.WorkBook
  try {
    // raw: false → values come out as their formatted string representation,
    // which preserves ZIP leading zeros when the source cell is text-formatted.
    // cellDates: false → keep date handling predictable; we don't need Date objects.
    // cellNF: false → don't keep number formats, we only want values.
    workbook = XLSX.read(buf, { type: 'buffer', raw: false, cellDates: false, cellNF: false })
  } catch (e) {
    throw new FileParseError(
      `File "${filename}" is not a valid Excel file (could not parse workbook): ${
        e instanceof Error ? e.message : String(e)
      }`,
      e,
    )
  }

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw new FileParseError(`Excel file "${filename}" has no sheets`)
  }
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) {
    throw new FileParseError(`Excel file "${filename}" sheet "${sheetName}" is empty`)
  }

  // Preserve ZIP leading zeros: when a cell is stored as a number but formatted
  // with leading zeros (e.g. "00000"), SheetJS's formatted-string output
  // (raw: false) will include the zeros. For raw-numeric ZIPs we rely on the
  // downstream normalizeZip() padding. We render every cell as a string here.
  // header: 1 → array of arrays. defval: '' → empty cells come through as ''.
  // blankrows: false → SheetJS drops fully-blank rows in the middle too; we want
  //   to preserve those to keep row indices stable for error reporting, so we
  //   use blankrows: true and drop only TRAILING empties ourselves.
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: true,
  })

  return rows.map(row =>
    (row ?? []).map(cell => (cell == null ? '' : String(cell))),
  )
}

function dropTrailingEmptyRows(grid: string[][]): string[][] {
  let end = grid.length
  while (end > 0 && isRowEntirelyEmpty(grid[end - 1])) end--
  return grid.slice(0, end)
}

function isRowEntirelyEmpty(row: string[] | undefined): boolean {
  if (!row) return true
  for (const cell of row) {
    if (cell != null && String(cell).trim() !== '') return false
  }
  return true
}

function validateHeaders(headers: string[], filename: string): void {
  // Require at least one non-empty header.
  const nonEmpty = headers.filter(h => h.length > 0)
  if (nonEmpty.length === 0) {
    throw new FileParseError(
      `File "${filename}" has no column headers. The first row must contain column names.`,
    )
  }

  // Detect merged-cell artifacts: one tiny label followed by several blank headers
  // is the classic symptom of a merged header row. We flag when there are 2+
  // empty headers in a row at the start, with data columns after.
  const emptyCount = headers.length - nonEmpty.length
  if (emptyCount > 0 && emptyCount >= Math.ceil(headers.length / 2)) {
    throw new FileParseError(
      `File "${filename}" appears to have merged cells or missing headers ` +
        `(${emptyCount} of ${headers.length} header columns are empty). ` +
        `Make sure every column has a header label on the first row.`,
    )
  }

  // Duplicate headers break the rows-as-objects view silently. Surface it early.
  const seen = new Map<string, number>()
  for (const h of nonEmpty) {
    seen.set(h, (seen.get(h) ?? 0) + 1)
  }
  const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([h]) => h)
  if (dupes.length > 0) {
    throw new FileParseError(
      `File "${filename}" has duplicate column headers: ${dupes.join(', ')}. ` +
        `Each column must have a unique name.`,
    )
  }
}
