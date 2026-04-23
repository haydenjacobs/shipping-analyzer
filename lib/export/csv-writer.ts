/**
 * CSV rendering and download for the Summary and Per-Order exports.
 *
 * Cell escaping handles commas, double-quotes, and newlines. ZIP codes and
 * other leading-zero-sensitive strings are always quoted so Excel doesn't
 * strip the zeros on re-open.
 */
import type { PerOrderExport } from './per-order-export'
import type { SummaryExport } from './summary-export'

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (s === '') return ''
  // Always quote when the cell contains a character that would break parsing,
  // or looks like it might be mis-interpreted (leading-zero digit string).
  const needsQuote = /[",\n\r]/.test(s) || /^0\d+$/.test(s)
  if (needsQuote) return `"${s.replace(/"/g, '""')}"`
  return s
}

function toCsvRow(cells: unknown[]): string {
  return cells.map(escapeCsvCell).join(',')
}

export function buildSummaryCsv(summary: SummaryExport): string {
  const lines: string[] = []
  for (const h of summary.headerLines) {
    lines.push(escapeCsvCell(h.text))
  }
  lines.push('') // blank row separator
  lines.push(toCsvRow(summary.columnHeaders))
  for (const r of summary.rows) {
    const cells: unknown[] = [
      r.provider,
      r.locations,
      r.networkConfig,
      r.avgZone.toFixed(1),
      formatCurrencyString(r.avgCostCents),
    ]
    if (summary.hasProjectedColumn) {
      cells.push(
        r.projectedPeriodCostCents !== null
          ? formatCurrencyString(r.projectedPeriodCostCents)
          : '',
      )
    }
    lines.push(toCsvRow(cells))
  }
  return lines.join('\n')
}

export function buildPerOrderCsv(per: PerOrderExport): string {
  const lines: string[] = []
  lines.push(toCsvRow(per.columnHeaders))
  for (let i = 0; i < per.rows.length; i++) {
    const row = per.rows[i]
    const cells = row.map((cell, idx) => {
      const col = per.columnMeta[idx]
      if (cell === null) return ''
      if (col.kind === 'warehouse-cost' || col.kind === 'opt-cost') {
        return typeof cell === 'number' ? formatCurrencyString(cell) : cell
      }
      return cell
    })
    lines.push(toCsvRow(cells))
  }
  return lines.join('\n')
}

export function formatCurrencyString(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function triggerCsvDownload(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
}
