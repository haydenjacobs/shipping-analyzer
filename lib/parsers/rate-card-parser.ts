// Deterministic rate card parser. No AI, no heuristics that guess — every decision follows
// explicit rules and punts to the user when unsure.

export interface ParserInput {
  data: string[][]       // 2D array: rows × columns, all values as strings
  inputMode?: 'file' | 'paste'  // default 'file'
}

export interface ParsedSection {
  detectedUnit: 'oz' | 'lbs' | 'unknown'
  unitConfidence: 'high' | 'low'
  weights: number[]              // weight value per data row (may be decimal, e.g. 15.99)
  zoneColumns: number[]          // zone numbers present (e.g. [1,2,3,4,5,6,7,8])
  prices: (number | null)[][]    // prices[rowIdx][zoneIdx] — dollars, not cents
  sourceRowStart: number         // row index in original data where this section starts
  sourceRowEnd: number
}

/** Convert a dollar price (e.g. 4.19) to integer cents (419). Rounds to the
 * nearest cent. Returns null for null/NaN. Use at the DB insert boundary so the
 * stored rate_card_entries.price_cents matches the money integer convention. */
export function dollarsToCents(dollars: number | null | undefined): number | null {
  if (dollars == null || !Number.isFinite(dollars)) return null
  return Math.round(dollars * 100)
}

/** Convenience: the ParsedSection prices[][] matrix mapped to integer cents. */
export function sectionPricesInCents(section: ParsedSection): (number | null)[][] {
  return section.prices.map(row => row.map(dollarsToCents))
}

export interface ParserOutput {
  sections: ParsedSection[]
  warnings: string[]
  errors: string[]
}

// ─── Zone pattern detection ───────────────────────────────────────────────────

/** Returns zone number 1–8 if cell matches a zone pattern, else null. */
function matchZonePattern(cell: string): number | null {
  const s = cell.trim()
  if (!s) return null

  // Bare integer 1-8
  if (/^[1-8]$/.test(s)) return parseInt(s, 10)

  // "Zone X" or "zone X" or "zone  3" — zone\s*[1-8]
  const m = s.match(/^zone\s*([1-8])$/i)
  if (m) return parseInt(m[1], 10)

  // "Z1" through "Z8"
  const z = s.match(/^z([1-8])$/i)
  if (z) return parseInt(z[1], 10)

  return null
}

/** Count zone matches in a row. Returns array of {colIdx, zone}. */
function findZonesInRow(row: string[]): Array<{ colIdx: number; zone: number }> {
  const found: Array<{ colIdx: number; zone: number }> = []
  for (let c = 0; c < row.length; c++) {
    const z = matchZonePattern(row[c])
    if (z !== null) found.push({ colIdx: c, zone: z })
  }
  return found
}

// ─── Unit label detection ─────────────────────────────────────────────────────

function detectUnitLabel(text: string): 'oz' | 'lbs' | null {
  const s = text.trim().toLowerCase()
  if (/\boz\b|\bounce/.test(s)) return 'oz'
  if (/\blbs?\b|\bpound/.test(s)) return 'lbs'
  return null
}

// ─── Price cell parsing ───────────────────────────────────────────────────────

function parsePrice(raw: string): number | null {
  const s = raw.replace(/[$,\s]/g, '')
  if (!s) return null
  const v = parseFloat(s)
  if (isNaN(v) || v < 0) return null
  return v
}

function parseWeight(raw: string): number | null {
  const s = raw.trim()
  if (!s) return null
  const v = parseFloat(s.replace(/[$,]/g, ''))
  if (isNaN(v) || v <= 0) return null
  return v
}

// ─── Anchor row search ────────────────────────────────────────────────────────

interface AnchorResult {
  rowIdx: number
  zones: Array<{ colIdx: number; zone: number }>
  weightColIdx: number  // column immediately left of leftmost zone column
}

function findAnchorRow(data: string[][], startRow = 0): AnchorResult | null {
  for (let r = startRow; r < data.length; r++) {
    const row = data[r]
    const zones = findZonesInRow(row)
    if (zones.length >= 3) {
      const sorted = [...zones].sort((a, b) => a.colIdx - b.colIdx)
      const leftmostZoneCol = sorted[0].colIdx
      const weightColIdx = leftmostZoneCol - 1
      if (weightColIdx < 0) {
        // Zone columns start at column 0 — can't have a weight col to the left.
        // This might still be a valid anchor if it's a paste grid detected earlier.
        // For the file path, we require a weight column.
        continue
      }
      return { rowIdx: r, zones: sorted, weightColIdx }
    }
  }
  return null
}

// ─── Ignored column detection ─────────────────────────────────────────────────

const IGNORED_REGION_LABELS = [
  'hawaii', 'alaska', 'puerto rico', 'apo', 'fpo', 'us territories', 'other us',
  'pr', 'hi', 'ak', 'dpo', 'territory',
]

function isIgnoredRegionLabel(cell: string): boolean {
  const s = cell.trim().toLowerCase()
  return IGNORED_REGION_LABELS.some(label => s.includes(label))
}

// ─── Section extraction ───────────────────────────────────────────────────────

interface RawSection {
  anchorRowIdx: number
  zones: Array<{ colIdx: number; zone: number }>
  weightColIdx: number
  dataRows: Array<{ rowIdx: number; weight: number; prices: (number | null)[] }>
  unitLabelFromHeader: 'oz' | 'lbs' | null   // from separator or weight col header
  ignoredColLabels: string[]
}

function extractSectionsFromAnchor(
  data: string[][],
  anchor: AnchorResult,
  warnings: string[],
  errors: string[],
): RawSection[] {
  const sections: RawSection[] = []

  // Detect ignored columns (in anchor row, non-zone, non-weight columns)
  const zoneColSet = new Set(anchor.zones.map(z => z.colIdx))
  const ignoredCols: string[] = []
  for (let c = 0; c < (data[anchor.rowIdx]?.length ?? 0); c++) {
    if (c === anchor.weightColIdx || zoneColSet.has(c)) continue
    const cell = data[anchor.rowIdx][c]?.trim()
    if (cell && isIgnoredRegionLabel(cell)) {
      ignoredCols.push(cell)
    }
  }
  if (ignoredCols.length > 0) {
    warnings.push(`Columns ignored (not zones 1–8): ${ignoredCols.join(', ')}`)
  }

  // Check weight col header / anchor row for unit hint
  let anchorUnitHint: 'oz' | 'lbs' | null = null
  // Check one row above anchor if available
  if (anchor.rowIdx > 0) {
    const prevRow = data[anchor.rowIdx - 1]
    const weightCellAbove = prevRow?.[anchor.weightColIdx] ?? ''
    anchorUnitHint = detectUnitLabel(weightCellAbove)
  }
  // Also check the anchor row's weight cell itself
  if (!anchorUnitHint) {
    anchorUnitHint = detectUnitLabel(data[anchor.rowIdx][anchor.weightColIdx] ?? '')
  }

  let currentZones = anchor.zones
  let currentWeightCol = anchor.weightColIdx
  let currentAnchorRow = anchor.rowIdx
  let currentUnitLabel = anchorUnitHint
  let currentDataRows: Array<{ rowIdx: number; weight: number; prices: (number | null)[] }> = []
  const currentIgnoredCols = ignoredCols
  let lastWeight: number | null = null

  function flushSection() {
    if (currentDataRows.length > 0) {
      sections.push({
        anchorRowIdx: currentAnchorRow,
        zones: currentZones,
        weightColIdx: currentWeightCol,
        dataRows: currentDataRows,
        unitLabelFromHeader: currentUnitLabel,
        ignoredColLabels: currentIgnoredCols,
      })
    }
    currentDataRows = []
    lastWeight = null
  }

  let r = anchor.rowIdx + 1
  let consecutiveEmpty = 0

  while (r < data.length) {
    const row = data[r] ?? []
    const weightCell = (row[currentWeightCol] ?? '').trim()

    // Empty weight cell
    if (!weightCell) {
      consecutiveEmpty++
      if (consecutiveEmpty >= 3) {
        // End of data
        break
      }
      r++
      continue
    }
    consecutiveEmpty = 0

    const weightNum = parseWeight(weightCell)

    if (weightNum !== null) {
      // Check for weight reset → section break
      if (lastWeight !== null && weightNum < lastWeight) {
        flushSection()
        currentUnitLabel = null
      }

      // Parse zone prices for this row
      const prices: (number | null)[] = []
      for (const { colIdx, zone } of currentZones) {
        const raw = row[colIdx] ?? ''
        const p = parsePrice(raw)
        if (p === null && raw.trim() !== '') {
          warnings.push(`Row ${r + 1} zone ${zone}: invalid price "${raw.trim()}"`)
        }
        prices.push(p)
      }

      currentDataRows.push({ rowIdx: r, weight: weightNum, prices })
      lastWeight = weightNum
    } else {
      // Non-numeric text in weight cell — check for unit label (section separator)
      const unitLabel = detectUnitLabel(weightCell)
      if (unitLabel) {
        // Section separator found
        flushSection()
        currentUnitLabel = unitLabel

        // Check if the next row is a new anchor row
        const nextAnchor = findAnchorRow(data, r + 1)
        if (nextAnchor && nextAnchor.rowIdx === r + 1) {
          currentAnchorRow = nextAnchor.rowIdx
          currentZones = nextAnchor.zones
          currentWeightCol = nextAnchor.weightColIdx
          r = nextAnchor.rowIdx + 1
          continue
        }
        // Otherwise same zone columns continue
        lastWeight = null
        r++
        continue
      }

      // Unrecognized text — treat as section gap (1-2 empties)
      consecutiveEmpty++
      if (consecutiveEmpty >= 3) break
    }

    r++
  }

  flushSection()
  return sections
}

// ─── Unit assignment ──────────────────────────────────────────────────────────

function assignUnits(sections: RawSection[]): ParsedSection[] {
  const out: ParsedSection[] = []

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]
    const maxWeight = Math.max(...s.dataRows.map(r => r.weight))
    const firstWeight = s.dataRows[0]?.weight ?? 0

    let detectedUnit: 'oz' | 'lbs' | 'unknown' = 'unknown'
    let unitConfidence: 'high' | 'low' = 'low'

    if (s.unitLabelFromHeader) {
      detectedUnit = s.unitLabelFromHeader
      unitConfidence = 'high'
    } else if (sections.length === 2) {
      if (i === 0 && maxWeight <= 16 && sections[1].dataRows[0]?.weight === 1) {
        detectedUnit = 'oz'
        unitConfidence = 'low'
      } else if (i === 1 && sections[0].dataRows[0]?.weight !== undefined) {
        detectedUnit = 'lbs'
        unitConfidence = 'low'
      }
    } else {
      // Single section
      if (maxWeight > 16) {
        detectedUnit = 'lbs'
        unitConfidence = 'low'
      }
      // else unknown — could be oz or lbs for ≤16
    }

    const zoneNumbers = s.zones.map(z => z.zone)
    const weights = s.dataRows.map(r => r.weight)
    const prices: (number | null)[][] = s.dataRows.map(r => r.prices)

    out.push({
      detectedUnit,
      unitConfidence,
      weights,
      zoneColumns: zoneNumbers,
      prices,
      sourceRowStart: s.dataRows[0]?.rowIdx ?? s.anchorRowIdx,
      sourceRowEnd: s.dataRows[s.dataRows.length - 1]?.rowIdx ?? s.anchorRowIdx,
    })
  }

  return out
}

// ─── Zone 1 auto-fill ─────────────────────────────────────────────────────────

function applyZone1AutoFill(sections: ParsedSection[], warnings: string[]): void {
  for (const section of sections) {
    if (!section.zoneColumns.includes(1) && section.zoneColumns.includes(2)) {
      const zone2Idx = section.zoneColumns.indexOf(2)
      // Prepend zone 1 to zoneColumns
      section.zoneColumns = [1, ...section.zoneColumns]
      // Prepend zone 2's prices as zone 1 prices for each row
      section.prices = section.prices.map(row => [row[zone2Idx], ...row])
      warnings.push('Zone 1 not found — prices copied from Zone 2')
    }
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateSections(sections: ParsedSection[], errors: string[]): void {
  for (const section of sections) {
    if (section.weights.length === 0) {
      errors.push(`A section (${section.detectedUnit}) has zero data rows`)
      continue
    }

    // Duplicate weight check
    const seen = new Map<number, number>()
    for (const w of section.weights) {
      seen.set(w, (seen.get(w) ?? 0) + 1)
    }
    for (const [w, count] of seen) {
      if (count > 1) {
        errors.push(`Duplicate weight value ${w} found in ${section.detectedUnit} section`)
      }
    }

    // Contiguous zones check
    const sortedZones = [...section.zoneColumns].sort((a, b) => a - b)
    for (let i = 1; i < sortedZones.length; i++) {
      if (sortedZones[i] !== sortedZones[i - 1] + 1) {
        errors.push(`Missing zone ${sortedZones[i - 1] + 1} in rate card`)
      }
    }
  }
}

// ─── Paste-path preprocessing ─────────────────────────────────────────────────

function handlePastePath(data: string[][]): ParserOutput {
  const warnings: string[] = []
  const errors: string[] = []

  if (data.length === 0) {
    return { sections: [], warnings, errors: ['No data found in pasted text'] }
  }

  const firstRow = data[0]

  // Check if first row has zone headers → run full parser
  const zonesInFirstRow = findZonesInRow(firstRow)
  if (zonesInFirstRow.length >= 3) {
    // Run full parser logic (will be handled by the normal path)
    return { sections: [], warnings, errors: [] }  // signal to caller: use normal path
  }

  // Check if first column has ascending integers (weight col), rest are prices
  let hasWeightCol = false
  if (data.length >= 2) {
    let ascending = true
    let prev = -Infinity
    for (const row of data) {
      const v = parseWeight(row[0] ?? '')
      if (v === null || v <= prev) { ascending = false; break }
      prev = v
    }
    if (ascending) hasWeightCol = true
  }

  if (hasWeightCol) {
    // Treat first col as weight, rest as prices, auto-detect zones from column count
    const priceColCount = (data[0]?.length ?? 1) - 1
    let startZone: number
    if (priceColCount === 8) startZone = 1
    else if (priceColCount === 7) startZone = 2
    else {
      errors.push(`Pasted data has ${priceColCount} price columns — expected 7 or 8 (zones 1–8 or 2–8). Use file upload for non-standard layouts.`)
      return { sections: [], warnings, errors }
    }

    const zoneNumbers = Array.from({ length: priceColCount }, (_, i) => startZone + i)
    const weights: number[] = []
    const prices: (number | null)[][] = []

    for (let r = 0; r < data.length; r++) {
      const row = data[r]
      const w = parseWeight(row[0] ?? '')
      if (w === null) continue
      weights.push(w)
      const rowPrices = zoneNumbers.map((_, zi) => parsePrice(row[zi + 1] ?? ''))
      prices.push(rowPrices)
    }

    const section: ParsedSection = {
      detectedUnit: 'unknown',
      unitConfidence: 'low',
      weights,
      zoneColumns: zoneNumbers,
      prices,
      sourceRowStart: 0,
      sourceRowEnd: data.length - 1,
    }

    applyZone1AutoFill([section], warnings)
    validateSections([section], errors)
    return { sections: [section], warnings, errors }
  }

  // Pure price grid — all cells should be numeric
  const allNumeric = data.every(row => row.every(cell => {
    const s = cell.replace(/[$,\s]/g, '')
    return s === '' || !isNaN(parseFloat(s))
  }))

  if (!allNumeric) {
    errors.push('Pasted data contains non-numeric values. If your rate card has headers, include them so the parser can detect zone columns.')
    return { sections: [], warnings, errors }
  }

  const colCount = Math.max(...data.map(r => r.length))
  let startZone: number
  if (colCount === 8) startZone = 1
  else if (colCount === 7) startZone = 2
  else if (colCount < 6) {
    errors.push(`Pasted data has ${colCount} columns — expected 7 or 8 (zones 1–8 or 2–8). Use file upload for non-standard layouts.`)
    return { sections: [], warnings, errors }
  } else {
    errors.push(`Pasted data has ${colCount} columns — expected 7 or 8 (zones 1–8 or 2–8). Use file upload for non-standard layouts.`)
    return { sections: [], warnings, errors }
  }

  const zoneNumbers = Array.from({ length: colCount }, (_, i) => startZone + i)
  const weights = data.map((_, i) => i + 1)  // 1, 2, 3, ... N
  const prices: (number | null)[][] = data.map(row =>
    zoneNumbers.map((_, zi) => parsePrice(row[zi] ?? ''))
  )

  const section: ParsedSection = {
    detectedUnit: 'unknown',
    unitConfidence: 'low',
    weights,
    zoneColumns: zoneNumbers,
    prices,
    sourceRowStart: 0,
    sourceRowEnd: data.length - 1,
  }

  applyZone1AutoFill([section], warnings)
  validateSections([section], errors)
  return { sections: [section], warnings, errors }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function parseRateCard2D(input: ParserInput): ParserOutput {
  const { data, inputMode = 'file' } = input
  const warnings: string[] = []
  const errors: string[] = []

  if (data.length === 0) {
    return { sections: [], warnings, errors: ['No data provided'] }
  }

  // Paste-path preprocessing
  if (inputMode === 'paste') {
    // Check if first row has zone headers → fall through to normal parser
    const firstRow = data[0]
    const zonesInFirstRow = findZonesInRow(firstRow)
    if (zonesInFirstRow.length < 3) {
      // Handle as paste-specific logic
      const pasteResult = handlePastePath(data)
      if (pasteResult.errors.length > 0 || pasteResult.sections.length > 0) {
        return pasteResult
      }
      // Empty result means "use normal path" — fall through
    }
  }

  // Step 1: Find anchor row (zone header row)
  const anchor = findAnchorRow(data, 0)
  if (!anchor) {
    errors.push(
      'Could not find zone header row. Expected a row with zone numbers (1–8) or labels like "Zone 1", "Zone 2", etc.'
    )
    return { sections: [], warnings, errors }
  }

  // Warn if zone 1 is not in anchor
  const anchorZoneNums = anchor.zones.map(z => z.zone)
  if (!anchorZoneNums.includes(1) && anchorZoneNums.includes(2)) {
    warnings.push('Zone 1 not found in rate card — will be copied from Zone 2 prices')
  }

  // Step 2–3: Extract raw sections
  const rawSections = extractSectionsFromAnchor(data, anchor, warnings, errors)

  if (rawSections.length === 0) {
    errors.push('No data rows found below the zone header row')
    return { sections: [], warnings, errors }
  }

  // Step 4: Assign units
  const sections = assignUnits(rawSections)

  // Step 5: Zone 1 auto-fill
  applyZone1AutoFill(sections, warnings)

  // Deduplicate zone-1 warning if we already added it from the anchor check
  const uniqueWarnings = [...new Set(warnings)]

  // Step 7: Validate
  validateSections(sections, errors)

  return { sections, warnings: uniqueWarnings, errors }
}

// ─── Legacy export (kept for any callers that imported the old parser) ────────
// The old parseRateCard(rawText) signature is removed. Use parseRateCard2D().
