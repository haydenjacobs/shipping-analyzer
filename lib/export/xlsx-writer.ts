/**
 * Excel workbook builder for the Summary + Per-Order export.
 *
 * Builds an in-memory xlsx with two sheets: "Summary" and "Per-Order Breakdown".
 * Currency cells get a currency format; ZIP cells get a text format so leading
 * zeros are preserved on open.
 */
import * as XLSX from 'xlsx'
import type { SummaryExport } from './summary-export'
import type { PerOrderExport } from './per-order-export'

const CURRENCY_FMT = '"$"#,##0.00'
const ZONE_FMT = '0.0'

export interface XlsxBuildInput {
  summary: SummaryExport
  perOrder: PerOrderExport
}

export function buildWorkbook(input: XlsxBuildInput): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, buildSummarySheet(input.summary), 'Summary')
  XLSX.utils.book_append_sheet(wb, buildPerOrderSheet(input.perOrder), 'Per-Order Breakdown')
  return wb
}

function buildSummarySheet(summary: SummaryExport): XLSX.WorkSheet {
  // AOA structure: header lines, blank row, column headers, data rows.
  const aoa: unknown[][] = []
  for (const h of summary.headerLines) aoa.push([h.text])
  aoa.push([])
  aoa.push(summary.columnHeaders)
  for (const r of summary.rows) {
    const row: unknown[] = [
      r.provider,
      r.locations,
      r.networkConfig,
      r.avgZone,
      r.avgCostCents / 100,
    ]
    if (summary.hasProjectedColumn) {
      row.push(
        r.projectedPeriodCostCents !== null ? r.projectedPeriodCostCents / 100 : '',
      )
    }
    aoa.push(row)
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Apply formats to the data area (below the header + blank + column-header rows).
  // AOA: headerLines rows, then blank row, then column-header row, then data rows.
  const columnHeaderRow = summary.headerLines.length + 1 // 0-indexed
  const firstDataRow = columnHeaderRow + 1
  const lastDataRow = firstDataRow + summary.rows.length - 1

  for (let r = firstDataRow; r <= lastDataRow; r++) {
    // Avg Zone column D (index 3)
    applyFormat(ws, r, 3, ZONE_FMT)
    // Avg Cost column E (index 4)
    applyFormat(ws, r, 4, CURRENCY_FMT)
    // Projected Period Cost column F (index 5) if present
    if (summary.hasProjectedColumn) applyFormat(ws, r, 5, CURRENCY_FMT)
  }

  return ws
}

function buildPerOrderSheet(per: PerOrderExport): XLSX.WorkSheet {
  const aoa: unknown[][] = []
  aoa.push(per.columnHeaders)
  for (const row of per.rows) {
    aoa.push(row.map((c) => (c === null ? '' : c)))
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Apply per-column formats on the data rows.
  const firstDataRow = 1
  const lastDataRow = firstDataRow + per.rows.length - 1
  for (let c = 0; c < per.columnMeta.length; c++) {
    const meta = per.columnMeta[c]
    let fmt: string | null = null
    let asText = false
    if (meta.kind === 'warehouse-cost' || meta.kind === 'opt-cost') fmt = CURRENCY_FMT
    else if (meta.kind === 'dest-zip') asText = true

    if (fmt || asText) {
      for (let r = firstDataRow; r <= lastDataRow; r++) {
        if (fmt) applyFormat(ws, r, c, fmt)
        if (asText) applyTextFormat(ws, r, c)
      }
    }
  }

  return ws
}

function applyFormat(ws: XLSX.WorkSheet, r: number, c: number, fmt: string) {
  const addr = XLSX.utils.encode_cell({ r, c })
  const cell = ws[addr] as XLSX.CellObject | undefined
  if (!cell) return
  cell.z = fmt
}

function applyTextFormat(ws: XLSX.WorkSheet, r: number, c: number) {
  const addr = XLSX.utils.encode_cell({ r, c })
  const cell = ws[addr] as XLSX.CellObject | undefined
  if (!cell) return
  cell.t = 's'
  cell.z = '@'
  if (cell.v !== undefined && cell.v !== null) cell.v = String(cell.v)
}

export function workbookToBlob(wb: XLSX.WorkBook): Blob {
  const arrayBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new Blob([arrayBuf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export function triggerXlsxDownload(filename: string, wb: XLSX.WorkBook): void {
  const blob = workbookToBlob(wb)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
}
