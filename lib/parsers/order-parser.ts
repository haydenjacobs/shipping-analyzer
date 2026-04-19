import Papa from 'papaparse'
import { normalizeZip, getZip3, isValidZip5 } from '@/lib/utils/zip'

export interface RawOrderRow {
  orderNumber: string
  destZip: string
  destZip3: string
  actualWeightLbs: number
  height?: number | null
  width?: number | null
  length?: number | null
  state?: string | null
}

export interface OrderParseResult {
  rows: RawOrderRow[]
  errors: Array<{ rowIndex: number; reason: string }>
  warnings: string[]
}

export interface ColumnMapping {
  orderNumber: string
  destZip: string
  weightColumn: string
  weightUnit: 'lbs' | 'oz'
  height?: string
  width?: string
  length?: string
  state?: string
}

/**
 * Parse order rows that have already been split into header-keyed objects
 * (e.g. from the shared file-parser). This is the canonical entry point.
 * `parseOrders` (CSV text) is kept as a thin wrapper for the legacy CSV path.
 */
export function parseOrderRows(
  rowObjects: Record<string, string>[],
  mapping: ColumnMapping,
): OrderParseResult {
  const errors: Array<{ rowIndex: number; reason: string }> = []
  const warnings: string[] = []
  const rows: RawOrderRow[] = []

  for (const [i, row] of rowObjects.entries()) {
    const rowNum = i + 2 // 1-indexed, accounting for header

    const orderNumber = String(row[mapping.orderNumber] ?? '').trim()
    if (!orderNumber) {
      errors.push({ rowIndex: rowNum, reason: 'Missing order number' })
      continue
    }

    const rawZip = row[mapping.destZip]
    const normalizedZip = normalizeZip(rawZip ?? '')
    if (!isValidZip5(normalizedZip)) {
      errors.push({ rowIndex: rowNum, reason: `Invalid ZIP code: "${rawZip}"` })
      continue
    }

    const rawWeight = parseFloat(String(row[mapping.weightColumn] ?? '').replace(/[^\d.]/g, ''))
    if (isNaN(rawWeight) || rawWeight <= 0) {
      errors.push({ rowIndex: rowNum, reason: `Invalid weight: "${row[mapping.weightColumn]}"` })
      continue
    }

    const actualWeightLbs = mapping.weightUnit === 'oz' ? rawWeight / 16 : rawWeight

    const parseOptional = (col?: string) => {
      if (!col || !row[col]) return null
      const v = parseFloat(row[col])
      return isNaN(v) ? null : v
    }

    rows.push({
      orderNumber,
      destZip: normalizedZip,
      destZip3: getZip3(normalizedZip),
      actualWeightLbs,
      height: parseOptional(mapping.height),
      width: parseOptional(mapping.width),
      length: parseOptional(mapping.length),
      state: mapping.state ? String(row[mapping.state] ?? '').trim() || null : null,
    })
  }

  return { rows, errors, warnings }
}

/**
 * Legacy CSV-text entry point. Parses the CSV with Papa Parse and delegates
 * to parseOrderRows. Excel uploads go through parseOrderRows directly after
 * the shared file-parser has done the sheet-reading step.
 */
export function parseOrders(csvText: string, mapping: ColumnMapping): OrderParseResult {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  })

  const warnings: string[] = []
  if (result.errors.length > 0) {
    warnings.push(...result.errors.map((e: { message: string }) => e.message))
  }

  const delegated = parseOrderRows(result.data, mapping)
  return {
    rows: delegated.rows,
    errors: delegated.errors,
    warnings: [...warnings, ...delegated.warnings],
  }
}
