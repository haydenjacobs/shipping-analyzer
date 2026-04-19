import Papa from 'papaparse'
import { normalizeZip } from '@/lib/utils/zip'

export interface ParsedZoneRow {
  destZip3: string
  zone: number
}

export interface ZoneChartParseResult {
  rows: ParsedZoneRow[]
  errors: string[]
}

export function parseZoneChart(csvText: string): ZoneChartParseResult {
  const errors: string[] = []
  const rows: ParsedZoneRow[] = []

  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim().toLowerCase(),
  })

  if (result.errors.length > 0) {
    errors.push(...result.errors.map((e: { message: string }) => e.message))
  }

  for (const [i, row] of result.data.entries()) {
    const rawZip = row['dest_zip3'] ?? row['dest_zip'] ?? row['zip3'] ?? row['zip']
    const rawZone = row['zone']

    if (!rawZip || !rawZone) {
      errors.push(`Row ${i + 2}: missing dest_zip3 or zone`)
      continue
    }

    const normalized = normalizeZip(rawZip)
    const zip3 = normalized.length >= 3 ? normalized.substring(0, 3) : normalized
    const zone = parseInt(rawZone, 10)

    if (isNaN(zone) || zone < 1 || zone > 8) {
      errors.push(`Row ${i + 2}: invalid zone value "${rawZone}"`)
      continue
    }

    rows.push({ destZip3: zip3, zone })
  }

  return { rows, errors }
}
