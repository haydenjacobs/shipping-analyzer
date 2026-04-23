/**
 * Pure data-shaping layer for the Per-Order Breakdown export.
 *
 * Adapter over derivePerOrderTable — the UI already produces the right columns
 * and rows. This module flattens them into cell values suited for CSV/XLSX.
 */
import type { PerOrderCol, PerOrderRow, PerOrderTableResult } from '@/lib/results/derive-per-order-table'

export type PerOrderCell = string | number | null

export interface PerOrderExport {
  columnHeaders: string[]
  /** Metadata for each column — consumed by xlsx-writer to apply cell formats. */
  columnMeta: PerOrderCol[]
  /** Row cells, one array per order, aligned with columnHeaders. */
  rows: PerOrderCell[][]
}

export function buildPerOrderExport(table: PerOrderTableResult): PerOrderExport {
  const columnHeaders = table.columns.map((c) => c.header)
  const rows = table.rows.map((row) => table.columns.map((col) => renderCell(col, row)))
  return { columnHeaders, columnMeta: table.columns, rows }
}

function renderCell(col: PerOrderCol, row: PerOrderRow): PerOrderCell {
  switch (col.kind) {
    case 'order-number':
      return row.orderNumber
    case 'actual-weight':
      return row.actualWeightLbs
    case 'dims':
      return row.dims ?? ''
    case 'dest-zip':
      return row.destZip
    case 'state':
      return row.state ?? ''
    case 'billable-weight':
      return row.billableWeightValue
    case 'billable-unit':
      return row.billableWeightUnit ?? ''
    case 'warehouse-zone': {
      const wid = col.warehouseId!
      const zone = row.warehouseZones[wid]
      return zone === undefined ? null : zone
    }
    case 'warehouse-cost': {
      const wid = col.warehouseId!
      const c = row.warehouseCosts[wid]
      return c === undefined ? null : c
    }
    case 'opt-zone': {
      const pn = col.providerName!
      const z = row.optZones[pn]
      return z === undefined ? null : z
    }
    case 'opt-cost': {
      const pn = col.providerName!
      const c = row.optCosts[pn]
      return c === undefined ? null : c
    }
    case 'opt-winner': {
      const pn = col.providerName!
      return row.optWinners[pn] ?? ''
    }
    default:
      return ''
  }
}
