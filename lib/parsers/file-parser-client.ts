/**
 * Client-side helpers for preparing uploaded files for the shared
 * server-side file parser. Has no SheetJS or Node dependencies, so it is
 * safe to import from browser components without pulling xlsx into the
 * client bundle.
 */

export type FileKind = 'csv' | 'excel'

export interface ParseFilePayload {
  fileType: FileKind
  /** For CSV: file text. For Excel: base64-encoded binary. */
  data: string
  /** Original filename. Optional on the wire; used for error messages. */
  filename?: string
}

const EXCEL_EXTS = new Set(['xlsx', 'xls', 'xlsm', 'xlsb'])
const CSV_EXTS = new Set(['csv', 'tsv', 'txt'])

const EXCEL_MIME_PATTERNS = [
  'spreadsheetml',
  'ms-excel',
  'excel',
  'vnd.openxmlformats-officedocument.spreadsheetml',
]
const CSV_MIME_PATTERNS = ['text/csv', 'text/tab-separated-values', 'text/plain']

export class UnsupportedFileTypeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedFileTypeError'
  }
}

/**
 * Detect the file kind from filename and/or MIME type. Extension is primary,
 * MIME is fallback. Throws UnsupportedFileTypeError if neither matches.
 */
export function detectFileType(input: { filename?: string; mimeType?: string }): FileKind {
  const { filename, mimeType } = input
  if (filename) {
    const dot = filename.lastIndexOf('.')
    if (dot >= 0) {
      const ext = filename.slice(dot + 1).toLowerCase()
      if (EXCEL_EXTS.has(ext)) return 'excel'
      if (CSV_EXTS.has(ext)) return 'csv'
    }
  }
  if (mimeType) {
    const m = mimeType.toLowerCase()
    if (EXCEL_MIME_PATTERNS.some(p => m.includes(p))) return 'excel'
    if (CSV_MIME_PATTERNS.some(p => m.startsWith(p))) return 'csv'
  }
  throw new UnsupportedFileTypeError(
    `Unsupported file type${filename ? ` for "${filename}"` : ''}. Accepted: .csv, .xlsx, .xls.`,
  )
}

/**
 * Convert an uploaded browser File into the payload shape expected by the
 * server-side parse endpoints.
 *   - .csv → { fileType: 'csv', data: <text>, filename }
 *   - .xlsx/.xls → { fileType: 'excel', data: <base64>, filename }
 */
export async function fileToParsePayload(
  file: File,
): Promise<ParseFilePayload & { filename: string }> {
  const fileType = detectFileType({ filename: file.name, mimeType: file.type })
  if (fileType === 'csv') {
    return { fileType: 'csv', data: await file.text(), filename: file.name }
  }
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  const chunkSize = 8192
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return { fileType: 'excel', data: btoa(binary), filename: file.name }
}
