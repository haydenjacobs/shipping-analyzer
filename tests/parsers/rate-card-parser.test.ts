import { describe, it, expect } from 'vitest'
import { parseRateCard2D } from '@/lib/parsers/rate-card-parser'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a row with the weight col + one price per zone (for brevity). */
function makeRows(
  weights: number[],
  zoneCount: number,
  startZone: number,
  priceOffset = 4.0,
): string[][] {
  return weights.map((w, i) =>
    [
      String(w),
      ...Array.from({ length: zoneCount }, (_, z) =>
        (priceOffset + i * 0.5 + z * 0.1).toFixed(2),
      ),
    ],
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('parseRateCard2D', () => {
  // ── Test 1: Clean oz+lbs card (explicit section labels, 15.99 weight) ────────
  it('parses a clean oz+lbs card with explicit oz/lbs labels', () => {
    const data: string[][] = [
      // Row 0: header — "Weight (oz)" gives unit hint for section 1
      ['Weight (oz)', 'Zone 1', 'Zone 2', 'Zone 3', 'Zone 4'],
      ['1',    '4.19', '4.26', '4.28', '4.39'],
      ['2',    '4.85', '4.92', '4.95', '5.10'],
      ['15.99','7.00', '7.50', '8.00', '8.50'],
      // Section separator
      ['LB', '', '', '', ''],
      ['1',  '5.00', '5.50', '6.00', '6.50'],
      ['5',  '9.00', '9.50', '10.00', '10.50'],
    ]

    const result = parseRateCard2D({ data, inputMode: 'file' })

    expect(result.errors).toHaveLength(0)
    expect(result.sections).toHaveLength(2)

    const [oz, lbs] = result.sections

    // oz section
    expect(oz.detectedUnit).toBe('oz')
    expect(oz.unitConfidence).toBe('high')
    expect(oz.weights).toEqual([1, 2, 15.99])
    expect(oz.zoneColumns).toEqual([1, 2, 3, 4])
    expect(oz.prices[0]).toEqual([4.19, 4.26, 4.28, 4.39])
    expect(oz.prices[2][0]).toBe(7.0) // 15.99 row, zone 1

    // lbs section
    expect(lbs.detectedUnit).toBe('lbs')
    expect(lbs.unitConfidence).toBe('high')
    expect(lbs.weights).toEqual([1, 5])
    expect(lbs.zoneColumns).toEqual([1, 2, 3, 4])
    expect(lbs.prices[0]).toEqual([5.0, 5.5, 6.0, 6.5])
  })

  // ── Test 2: Junk rows at top, 15.99 preserved, section break at "LB" ─────────
  it('skips junk rows to find the zone header and preserves 15.99 weight', () => {
    const data: string[][] = [
      ['USPS Commercial Base Pricing', '', '', '', ''],
      ['Effective January 2024', '', '', '', ''],
      ['', '', '', '', ''],
      // Anchor at row 3 — no unit label in weight col
      ['Weight', 'Zone 1', 'Zone 2', 'Zone 3', 'Zone 4'],
      ['1',    '4.19', '4.26', '4.28', '4.39'],
      ['15.99','7.00', '7.50', '8.00', '8.50'],
      ['LB', '', '', '', ''],
      ['1',  '5.00', '5.50', '6.00', '6.50'],
      ['8',  '14.00', '14.50', '15.00', '15.50'],
    ]

    const result = parseRateCard2D({ data, inputMode: 'file' })

    expect(result.errors).toHaveLength(0)
    expect(result.sections).toHaveLength(2)

    const [sec0, sec1] = result.sections

    // Junk rows skipped — anchor found
    expect(sec0.sourceRowStart).toBeGreaterThanOrEqual(4)  // data starts below anchor
    expect(sec0.weights).toContain(15.99)

    // Section break detected at 'LB' row
    expect(sec1.detectedUnit).toBe('lbs')
    expect(sec1.unitConfidence).toBe('high')
    expect(sec1.weights).toEqual([1, 8])
  })

  // ── Test 3: Card starting at Zone 2 — Zone 1 auto-filled from Zone 2 ─────────
  it('auto-fills Zone 1 from Zone 2 when zone 1 is absent, and adds a warning', () => {
    const data: string[][] = [
      ['Weight', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5'],
      ['1', '4.26', '4.28', '4.39', '4.45'],
      ['2', '5.26', '5.28', '5.39', '5.45'],
    ]

    const result = parseRateCard2D({ data, inputMode: 'file' })

    expect(result.errors).toHaveLength(0)
    expect(result.sections).toHaveLength(1)

    const [sec] = result.sections

    // Zone 1 inserted at index 0
    expect(sec.zoneColumns[0]).toBe(1)
    expect(sec.zoneColumns).toEqual([1, 2, 3, 4, 5])

    // Zone 1 prices = Zone 2 prices
    expect(sec.prices[0][0]).toBe(sec.prices[0][1])  // zone 1 = zone 2 for row 0
    expect(sec.prices[1][0]).toBe(sec.prices[1][1])  // zone 1 = zone 2 for row 1

    // Warning generated
    expect(result.warnings.some(w => w.toLowerCase().includes('zone 1'))).toBe(true)
  })

  // ── Test 4: Extra columns (Hawaii, Alaska) ignored, warning generated ─────────
  it('ignores Hawaii/Alaska columns and generates a warning', () => {
    const data: string[][] = [
      ['Weight', 'Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Hawaii', 'Alaska'],
      ['1', '4.19', '4.26', '4.28', '4.39', '9.99', '10.99'],
      ['2', '5.19', '5.26', '5.28', '5.39', '11.99', '12.99'],
    ]

    const result = parseRateCard2D({ data, inputMode: 'file' })

    expect(result.errors).toHaveLength(0)
    expect(result.sections).toHaveLength(1)

    const [sec] = result.sections

    // Only standard zones 1-4 in the output
    expect(sec.zoneColumns).toEqual([1, 2, 3, 4])

    // Prices have 4 values per row (not 6)
    expect(sec.prices[0]).toHaveLength(4)

    // Warning about ignored columns
    expect(result.warnings.some(w => /hawaii|alaska/i.test(w))).toBe(true)
  })

  // ── Test 5: Pure paste grid — 8 columns, no headers ──────────────────────────
  // Use a non-ascending first column so the parser does NOT mistake col 0 for weights.
  // (The paste-path hasWeightCol heuristic requires the first column to be monotonically
  // ascending. If it's not, the parser treats the entire grid as a pure price matrix.)
  it('parses a pure numeric paste grid (8 cols, no headers) as single unknown-unit section', () => {
    const rows = [
      // First column is NOT ascending (8.50 → 7.50 → 9.50), so hasWeightCol=false
      ['8.50', '4.26', '4.28', '4.39', '4.45', '4.55', '4.83', '5.10'],
      ['7.50', '5.26', '5.28', '5.39', '5.45', '5.55', '5.83', '6.10'],
      ['9.50', '6.26', '6.28', '6.39', '6.45', '6.55', '6.83', '7.10'],
    ]

    const result = parseRateCard2D({ data: rows, inputMode: 'paste' })

    expect(result.errors).toHaveLength(0)
    expect(result.sections).toHaveLength(1)

    const [sec] = result.sections
    expect(sec.detectedUnit).toBe('unknown')
    expect(sec.unitConfidence).toBe('low')
    expect(sec.zoneColumns).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(sec.weights).toEqual([1, 2, 3])  // sequential default weights 1…N
    expect(sec.prices[0][0]).toBe(8.50)     // first value of the grid
    expect(sec.prices[0][7]).toBe(5.10)
  })

  // ── Test 6: Paste grid with 7 columns → zones 2-8, zone 1 auto-filled ────────
  // Same non-ascending first-column trick to ensure pure price grid path is taken.
  it('maps 7-column paste grid to zones 2-8 and auto-fills zone 1', () => {
    const rows = [
      // First column is NOT ascending (8.26 → 6.26), so hasWeightCol=false
      ['8.26', '4.28', '4.39', '4.45', '4.55', '4.83', '5.10'],
      ['6.26', '5.28', '5.39', '5.45', '5.55', '5.83', '6.10'],
    ]

    const result = parseRateCard2D({ data: rows, inputMode: 'paste' })

    expect(result.errors).toHaveLength(0)
    expect(result.sections).toHaveLength(1)

    const [sec] = result.sections
    // 7 columns → zones 2-8 → zone 1 auto-filled → 8 total zones
    expect(sec.zoneColumns).toEqual([1, 2, 3, 4, 5, 6, 7, 8])

    // Zone 1 price = Zone 2 price (auto-fill copies col 0 → prepended as zone 1)
    expect(sec.prices[0][0]).toBe(sec.prices[0][1])

    // Warning generated for zone 1 fill
    expect(result.warnings.some(w => w.toLowerCase().includes('zone 1'))).toBe(true)
  })

  // ── Test 7: Error — no zone header row found ──────────────────────────────────
  it('returns an error when no zone header row is found', () => {
    const data: string[][] = [
      ['Weight', 'Price A', 'Price B', 'Price C'],
      ['1', '4.19', '4.26', '4.28'],
      ['2', '5.00', '5.50', '6.00'],
    ]

    const result = parseRateCard2D({ data, inputMode: 'file' })

    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toMatch(/zone header/i)
    expect(result.sections).toHaveLength(0)
  })

  // ── Test 8: Error — duplicate weight values ────────────────────────────────
  // Use weight=2 appearing twice (equal, not decreasing). The section-break heuristic
  // only fires when the next weight is LESS THAN the previous, so equal values stay
  // in the same section and the duplicate is caught by validation.
  it('returns an error when duplicate weight values are present', () => {
    const data: string[][] = [
      ['Weight', 'Zone 1', 'Zone 2', 'Zone 3'],
      ['1', '4.19', '4.26', '4.28'],
      ['2', '5.00', '5.50', '6.00'],
      ['2', '6.00', '6.50', '7.00'],  // duplicate weight: 2 (equal, not decreasing → stays in section)
    ]

    const result = parseRateCard2D({ data, inputMode: 'file' })

    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.some(e => /duplicate/i.test(e) && e.includes('2'))).toBe(true)
  })
})
