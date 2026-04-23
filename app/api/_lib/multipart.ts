/**
 * Helpers for reading multipart/form-data uploads on API routes.
 *
 * Routes accept an uploaded CSV/Excel file under the "file" field plus any
 * additional JSON-encoded metadata under other named fields. We normalize the
 * upload into a ParsedFile (via the shared file-parser) before handing it off
 * to parser-layer code. Parsing errors bubble up as FileParseError so routes
 * can turn them into PARSE_ERROR 400 responses.
 */
import {
  detectFileType,
  FileParseError,
  ParsedFile,
  parseFilePayload,
  UnsupportedFileTypeError,
} from '@/lib/parsers/file-parser'

export interface UploadedFile {
  parsed: ParsedFile
  filename: string
}

/**
 * Read the "file" field from a multipart FormData, detect CSV vs Excel, and
 * parse it into a ParsedFile. Throws UnsupportedFileTypeError / FileParseError
 * on bad input.
 */
export async function readUploadedFile(
  form: FormData,
  fieldName = 'file',
  options: { skipHeaderValidation?: boolean } = {},
): Promise<UploadedFile> {
  const raw = form.get(fieldName)
  if (!raw || typeof raw === 'string') {
    throw new FileParseError(`Missing "${fieldName}" in form-data upload`)
  }
  const file = raw as File
  const filename = file.name || `upload.${fieldName}`
  const fileType = detectFileType({ filename, mimeType: file.type })

  let data: string
  if (fileType === 'csv') {
    data = await file.text()
  } else {
    const buf = Buffer.from(await file.arrayBuffer())
    data = buf.toString('base64')
  }

  const parsed = parseFilePayload({ fileType, data, filename }, options)
  return { parsed, filename }
}

export { FileParseError, UnsupportedFileTypeError }
