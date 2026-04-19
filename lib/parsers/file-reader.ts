/**
 * Thin compatibility shim over the shared file-parser module. These exports
 * return the same {data, fileName, fileType} shape the rate-card route
 * previously used, but all sheet/CSV reading logic now lives in file-parser.ts.
 */

import { parseFilePayload, FileParseError } from './file-parser'

export interface FileReadResult {
  data: string[][]
  fileName: string
  fileType: 'csv' | 'excel'
}

export { FileParseError }

/** Parse a CSV string into a 2D array of strings. */
export function readCsv(csvText: string, fileName = 'upload.csv'): FileReadResult {
  const parsed = parseFilePayload({ fileType: 'csv', data: csvText, filename: fileName })
  return { data: parsed.grid, fileName, fileType: 'csv' }
}

/** Parse a base64-encoded Excel file into a 2D array of strings (first sheet). */
export function readExcelBase64(base64: string, fileName = 'upload.xlsx'): FileReadResult {
  const parsed = parseFilePayload({ fileType: 'excel', data: base64, filename: fileName })
  return { data: parsed.grid, fileName, fileType: 'excel' }
}
