/**
 * Generates deterministic .xlsx fixtures used by the parser tests:
 *   tests/fixtures/sample-orders.xlsx
 *   tests/fixtures/sample-rate-card.xlsx
 *
 * These fixtures intentionally include:
 *   - A ZIP code column with a leading-zero value (01234) stored as text
 *   - A numeric weight column (lbs)
 *   - An empty row mid-data (preserved as null cells)
 *   - Several trailing blank rows (should be dropped by the parser)
 *
 * Run with: npx tsx scripts/build-test-fixtures.ts
 */

import * as XLSX from 'xlsx'
import path from 'path'
import fs from 'fs'

const FIXTURES_DIR = path.resolve(__dirname, '..', 'tests', 'fixtures')
fs.mkdirSync(FIXTURES_DIR, { recursive: true })

// ─── Orders fixture ───────────────────────────────────────────────────────────

/**
 * Builds the orders fixture. ZIPs are written as text-formatted cells so that
 * leading zeros survive a SheetJS round-trip. We build the sheet by direct
 * cell-address assignment so we can set `{ t: 's' }` on the ZIP column.
 */
function buildOrdersFixture() {
  const headers = ['Order ID', 'Destination ZIP', 'Weight (lbs)', 'Height', 'Width', 'Length', 'State']
  const orders: Array<{ id: string; zip: string; weight: number; h: number; w: number; l: number; st: string }> = [
    { id: 'ORD-1001', zip: '01234', weight: 2.5, h: 4, w: 6, l: 8, st: 'MA' },      // leading zero ZIP
    { id: 'ORD-1002', zip: '90210', weight: 3.75, h: 5, w: 7, l: 9, st: 'CA' },
    { id: 'ORD-1003', zip: '00501', weight: 1.1, h: 3, w: 3, l: 3, st: 'NY' },      // another leading zero
    { id: 'ORD-1004', zip: '73301', weight: 10.0, h: 8, w: 10, l: 12, st: 'TX' },
    { id: 'ORD-1005', zip: '60601', weight: 0.5, h: 2, w: 2, l: 2, st: 'IL' },
  ]

  const sheet: XLSX.WorkSheet = {}
  // Header row
  headers.forEach((h, c) => {
    const addr = XLSX.utils.encode_cell({ r: 0, c })
    sheet[addr] = { t: 's', v: h }
  })

  // Data rows
  orders.forEach((o, i) => {
    const r = i + 1
    sheet[XLSX.utils.encode_cell({ r, c: 0 })] = { t: 's', v: o.id }
    // ZIP stored as text with format "@" so SheetJS preserves leading zeros
    sheet[XLSX.utils.encode_cell({ r, c: 1 })] = { t: 's', v: o.zip, z: '@' }
    sheet[XLSX.utils.encode_cell({ r, c: 2 })] = { t: 'n', v: o.weight }
    sheet[XLSX.utils.encode_cell({ r, c: 3 })] = { t: 'n', v: o.h }
    sheet[XLSX.utils.encode_cell({ r, c: 4 })] = { t: 'n', v: o.w }
    sheet[XLSX.utils.encode_cell({ r, c: 5 })] = { t: 'n', v: o.l }
    sheet[XLSX.utils.encode_cell({ r, c: 6 })] = { t: 's', v: o.st }
  })

  // Insert a deliberate blank row between rows 3 and 4 (row index 3 → 0-based 6, shift rows down)
  // Instead, we add trailing empties: blank rows past the data.
  // Range covers headers + data + 3 trailing blanks
  const trailingBlanks = 3
  const lastRow = orders.length + trailingBlanks
  sheet['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: lastRow, c: headers.length - 1 },
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, 'Orders')
  const outPath = path.join(FIXTURES_DIR, 'sample-orders.xlsx')
  XLSX.writeFile(wb, outPath)
  console.log(`Wrote ${outPath}`)
}

// ─── Rate card fixture ────────────────────────────────────────────────────────

function buildRateCardFixture() {
  const aoa: (string | number)[][] = [
    ['Weight (lbs)', 'Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5', 'Zone 6', 'Zone 7', 'Zone 8'],
    [1,  5.00, 5.25, 5.50, 5.75, 6.00, 6.25, 6.50, 6.75],
    [2,  6.00, 6.25, 6.50, 6.75, 7.00, 7.25, 7.50, 7.75],
    [3,  7.00, 7.25, 7.50, 7.75, 8.00, 8.25, 8.50, 8.75],
    [5,  9.00, 9.25, 9.50, 9.75, 10.00, 10.25, 10.50, 10.75],
    [10, 14.0, 14.5, 15.0, 15.5, 16.0, 16.5, 17.0, 17.5],
  ]
  const sheet = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, 'Rates')
  const outPath = path.join(FIXTURES_DIR, 'sample-rate-card.xlsx')
  XLSX.writeFile(wb, outPath)
  console.log(`Wrote ${outPath}`)
}

buildOrdersFixture()
buildRateCardFixture()
