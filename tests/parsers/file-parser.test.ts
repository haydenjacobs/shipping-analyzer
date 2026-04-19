import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  parseFilePayload,
  detectFileType,
  FileParseError,
  UnsupportedFileTypeError,
} from '@/lib/parsers/file-parser'
import { parseOrderRows } from '@/lib/parsers/order-parser'
import { parseRateCard2D } from '@/lib/parsers/rate-card-parser'

const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures')
const ORDERS_XLSX = path.join(FIXTURES_DIR, 'sample-orders.xlsx')
const RATE_CARD_XLSX = path.join(FIXTURES_DIR, 'sample-rate-card.xlsx')

function ensureFixtureExists(p: string) {
  if (!fs.existsSync(p)) {
    throw new Error(
      `Fixture missing: ${p}. Run: npx tsx scripts/build-test-fixtures.ts`,
    )
  }
}

function readFixtureBase64(p: string): string {
  ensureFixtureExists(p)
  return fs.readFileSync(p).toString('base64')
}

// ─── detectFileType ───────────────────────────────────────────────────────────

describe('detectFileType', () => {
  it('routes .xlsx to excel (case-insensitive)', () => {
    expect(detectFileType({ filename: 'orders.xlsx' })).toBe('excel')
    expect(detectFileType({ filename: 'ORDERS.XLSX' })).toBe('excel')
  })

  it('routes .xls to excel', () => {
    expect(detectFileType({ filename: 'orders.xls' })).toBe('excel')
  })

  it('routes .csv to csv', () => {
    expect(detectFileType({ filename: 'orders.csv' })).toBe('csv')
    expect(detectFileType({ filename: 'orders.CSV' })).toBe('csv')
  })

  it('falls back to MIME type when extension missing', () => {
    expect(
      detectFileType({
        filename: 'no-extension',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    ).toBe('excel')
    expect(detectFileType({ filename: 'no-ext', mimeType: 'text/csv' })).toBe('csv')
  })

  it('throws UnsupportedFileTypeError for unknown types', () => {
    expect(() => detectFileType({ filename: 'orders.pdf' })).toThrow(UnsupportedFileTypeError)
    expect(() => detectFileType({})).toThrow(UnsupportedFileTypeError)
  })
})

// ─── parseFilePayload: Excel orders fixture ───────────────────────────────────

describe('parseFilePayload — sample-orders.xlsx', () => {
  let base64: string

  beforeAll(() => {
    base64 = readFixtureBase64(ORDERS_XLSX)
  })

  it('parses the xlsx into real headers (not PK / __parsed_extra)', () => {
    const parsed = parseFilePayload({
      fileType: 'excel',
      data: base64,
      filename: 'sample-orders.xlsx',
    })

    expect(parsed.headers).not.toContain('PK')
    expect(parsed.headers).not.toContain('__parsed_extra')
    expect(parsed.headers).toContain('Order ID')
    expect(parsed.headers).toContain('Destination ZIP')
    expect(parsed.headers).toContain('Weight (lbs)')
    expect(parsed.headers).toContain('State')
  })

  it('preserves ZIP leading zeros (01234 stays "01234", not "1234")', () => {
    const parsed = parseFilePayload({
      fileType: 'excel',
      data: base64,
      filename: 'sample-orders.xlsx',
    })

    const zips = parsed.rows.map(r => r['Destination ZIP'])
    expect(zips).toContain('01234')
    expect(zips).toContain('00501')
    // And NOT the stripped versions
    expect(zips).not.toContain('1234')
    expect(zips).not.toContain('501')
  })

  it('drops trailing empty rows', () => {
    const parsed = parseFilePayload({
      fileType: 'excel',
      data: base64,
      filename: 'sample-orders.xlsx',
    })
    // Fixture has 5 data rows
    expect(parsed.rows).toHaveLength(5)
  })

  it('feeds cleanly into parseOrderRows and produces numeric weights', () => {
    const parsed = parseFilePayload({
      fileType: 'excel',
      data: base64,
      filename: 'sample-orders.xlsx',
    })
    const result = parseOrderRows(parsed.rows, {
      orderNumber: 'Order ID',
      destZip: 'Destination ZIP',
      weightColumn: 'Weight (lbs)',
      weightUnit: 'lbs',
      height: 'Height',
      width: 'Width',
      length: 'Length',
      state: 'State',
    })

    expect(result.errors).toHaveLength(0)
    expect(result.rows).toHaveLength(5)

    // ZIP 01234 survived round-trip
    const firstRow = result.rows.find(r => r.orderNumber === 'ORD-1001')
    expect(firstRow).toBeDefined()
    expect(firstRow!.destZip).toBe('01234')
    expect(firstRow!.destZip3).toBe('012')

    // Weights are numbers (not strings)
    for (const r of result.rows) {
      expect(typeof r.actualWeightLbs).toBe('number')
      expect(r.actualWeightLbs).toBeGreaterThan(0)
    }

    // Specific weight for ORD-1001 (2.5 lbs in the fixture)
    expect(firstRow!.actualWeightLbs).toBeCloseTo(2.5, 5)

    // Dims are numbers
    expect(typeof firstRow!.height).toBe('number')
    expect(firstRow!.height).toBeCloseTo(4, 5)
  })
})

// ─── parseFilePayload: Excel rate card fixture ────────────────────────────────

describe('parseFilePayload — sample-rate-card.xlsx', () => {
  let base64: string

  beforeAll(() => {
    base64 = readFixtureBase64(RATE_CARD_XLSX)
  })

  it('returns real zone-style headers', () => {
    const parsed = parseFilePayload({
      fileType: 'excel',
      data: base64,
      filename: 'sample-rate-card.xlsx',
    })

    expect(parsed.headers).not.toContain('PK')
    expect(parsed.headers[0]).toMatch(/weight/i)
    expect(parsed.headers).toContain('Zone 1')
    expect(parsed.headers).toContain('Zone 8')
  })

  it('feeds cleanly into parseRateCard2D', () => {
    const parsed = parseFilePayload({
      fileType: 'excel',
      data: base64,
      filename: 'sample-rate-card.xlsx',
    })

    const output = parseRateCard2D({ data: parsed.grid, inputMode: 'file' })

    expect(output.errors).toHaveLength(0)
    expect(output.sections).toHaveLength(1)

    const [section] = output.sections
    expect(section.detectedUnit).toBe('lbs')
    expect(section.zoneColumns).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(section.weights).toEqual([1, 2, 3, 5, 10])

    // Zone 1, weight 1 should be $5.00 (from fixture)
    expect(section.prices[0][0]).toBeCloseTo(5.0, 2)
    // Zone 8, weight 10 should be $17.50
    expect(section.prices[4][7]).toBeCloseTo(17.5, 2)
  })
})

// ─── CSV path still works ─────────────────────────────────────────────────────

describe('parseFilePayload — CSV path', () => {
  it('parses a CSV string into headers and rows', () => {
    const csv = [
      'Order ID,Destination ZIP,Weight (lbs)',
      'ORD-1,01234,2.5',
      'ORD-2,90210,3.75',
    ].join('\n')

    const parsed = parseFilePayload({ fileType: 'csv', data: csv, filename: 'x.csv' })
    expect(parsed.headers).toEqual(['Order ID', 'Destination ZIP', 'Weight (lbs)'])
    expect(parsed.rows).toHaveLength(2)
    // CSV ZIPs come through as the raw string the user typed — leading zero preserved.
    expect(parsed.rows[0]['Destination ZIP']).toBe('01234')
  })
})

// ─── Error surfacing ──────────────────────────────────────────────────────────

describe('parseFilePayload — error surfacing', () => {
  it('throws FileParseError when feeding too-small bytes as Excel', () => {
    // Only 2 bytes — fails the sanity check before SheetJS even sees it.
    const tinyBase64 = Buffer.from([0x00, 0x01]).toString('base64')
    expect(() =>
      parseFilePayload({ fileType: 'excel', data: tinyBase64, filename: 'tiny.xlsx' }),
    ).toThrow(FileParseError)
  })

  it('throws FileParseError for duplicate headers', () => {
    const csv = ['A,B,A', '1,2,3'].join('\n')
    expect(() => parseFilePayload({ fileType: 'csv', data: csv, filename: 'dup.csv' })).toThrow(
      /duplicate column headers/i,
    )
  })

  it('throws FileParseError for an empty file', () => {
    expect(() => parseFilePayload({ fileType: 'csv', data: '', filename: 'empty.csv' })).toThrow(
      FileParseError,
    )
  })
})
