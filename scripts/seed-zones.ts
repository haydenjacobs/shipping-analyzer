/**
 * seed-zones.ts
 *
 * One-time script that fetches the complete USPS domestic zone chart
 * (all origin ZIP3 → destination ZIP3 → zone mappings) and stores
 * them in the local SQLite database.
 *
 * Run with:  npm run seed-zones
 * Takes approximately 7-10 minutes. Safe to re-run (clears and rebuilds).
 */

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_PATH = path.join(process.cwd(), 'db', 'shipping-analyzer.db')

const USPS_URL = 'https://postcalc.usps.com/DomesticZoneChart/GetZoneChart'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getShippingDate(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}/${dd}/${d.getFullYear()}`
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Expands a USPS ZipCodes range string into individual ZIP3 strings.
 * "100---118" → ["100", "101", ..., "118"]
 * "531"       → ["531"]
 */
function expandZip3Range(zipCodes: string): string[] {
  const trimmed = zipCodes.trim()
  const parts = trimmed.split('---')

  if (parts.length === 2) {
    const start = parseInt(parts[0].trim(), 10)
    const end = parseInt(parts[1].trim(), 10)
    if (isNaN(start) || isNaN(end) || start > end || end > 999) return []
    const result: string[] = []
    for (let i = start; i <= end; i++) {
      result.push(String(i).padStart(3, '0'))
    }
    return result
  }

  if (/^\d{1,3}$/.test(parts[0].trim())) {
    return [parts[0].trim().padStart(3, '0')]
  }

  return []
}

/**
 * Parses a USPS zone string like "1*", "2", "8+" → integer 1-8, or null to skip.
 * Zone 9 = territories (APO/FPO/etc.) — not relevant for commercial 3PL routing.
 */
function parseZone(zoneStr: string): number | null {
  if (!zoneStr) return null
  const digits = zoneStr.replace(/[^0-9]/g, '')
  if (!digits) return null
  const zone = parseInt(digits, 10)
  if (zone < 1 || zone > 8) return null
  return zone
}

// ─── USPS API types ───────────────────────────────────────────────────────────

interface UspsRow {
  ZipCodes: string
  Zone: string
  MailService: string
}

interface UspsResponse {
  ZIPCodeError?: string
  ShippingDateError?: string
  PageError?: string
  EffectiveDate?: string
  Column0?: UspsRow[]
  Column1?: UspsRow[]
  Column2?: UspsRow[]
  Column3?: UspsRow[]
  Zip5Digit?: UspsRow[]
}

// ─── Fetch one origin ZIP3 ────────────────────────────────────────────────────

async function fetchZoneChart(
  originZip3: string,
  shippingDate: string,
  attempt = 1
): Promise<Array<{ destZip3: string; zone: number }> | null> {
  const url = `${USPS_URL}?zipCode3Digit=${originZip3}&shippingDate=${encodeURIComponent(shippingDate)}`

  let data: UspsResponse
  try {
    const res = await fetch(url, {
      headers: {
        Referer: 'https://postcalc.usps.com/DomesticZoneChart',
        'User-Agent': 'Mozilla/5.0 (compatible; 3pl-zone-seeder/1.0)',
      },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      if (attempt < 3) {
        await sleep(attempt * 2000)
        return fetchZoneChart(originZip3, shippingDate, attempt + 1)
      }
      return null
    }
    data = (await res.json()) as UspsResponse
  } catch {
    if (attempt < 3) {
      await sleep(attempt * 2000)
      return fetchZoneChart(originZip3, shippingDate, attempt + 1)
    }
    return null
  }

  // Non-empty ZIPCodeError means this origin prefix isn't in use
  if (data.ZIPCodeError || data.PageError) return null

  const rows: Array<{ destZip3: string; zone: number }> = []

  for (const col of [data.Column0, data.Column1, data.Column2, data.Column3]) {
    if (!Array.isArray(col)) continue
    for (const entry of col) {
      const zone = parseZone(entry.Zone)
      if (zone === null) continue
      for (const destZip3 of expandZip3Range(entry.ZipCodes)) {
        rows.push({ destZip3, zone })
      }
    }
  }

  // Zip5Digit entries are 5-digit-specific overrides — skip for our ZIP3 use case

  return rows.length > 0 ? rows : null
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Ensure DB directory exists
  const dbDir = path.dirname(DB_PATH)
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })

  const sqlite = new Database(DB_PATH)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = OFF') // disable during bulk load for performance

  // Create tables if they don't exist yet
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS zone_maps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      origin_zip3 TEXT NOT NULL,
      dest_zip3 TEXT NOT NULL,
      zone INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS zone_maps_origin_dest
      ON zone_maps(origin_zip3, dest_zip3);

    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // Idempotent: clear existing zone data before rebuilding
  const existingCount = (
    sqlite.prepare('SELECT COUNT(*) as cnt FROM zone_maps').get() as { cnt: number }
  ).cnt

  if (existingCount > 0) {
    console.log(`Clearing ${existingCount.toLocaleString()} existing zone rows...`)
    sqlite.exec('DELETE FROM zone_maps')
  }

  const shippingDate = getShippingDate()
  console.log(`Shipping date: ${shippingDate}`)
  console.log('Fetching zones for all 999 origin ZIP3 prefixes.')
  console.log('Expected time: ~7-10 minutes. Progress every 10 origins.\n')

  // Prepared statements for batch insert
  const insertRow = sqlite.prepare(
    'INSERT OR REPLACE INTO zone_maps (origin_zip3, dest_zip3, zone) VALUES (?, ?, ?)'
  )
  const insertBatch = sqlite.transaction(
    (rows: Array<{ originZip3: string; destZip3: string; zone: number }>) => {
      for (const r of rows) insertRow.run(r.originZip3, r.destZip3, r.zone)
    }
  )

  let totalRows = 0
  let originsWithData = 0
  let originsSkipped = 0
  const startTime = Date.now()

  for (let i = 1; i <= 999; i++) {
    const originZip3 = String(i).padStart(3, '0')

    const rows = await fetchZoneChart(originZip3, shippingDate)

    if (!rows) {
      originsSkipped++
    } else {
      const batch = rows.map(r => ({ originZip3, destZip3: r.destZip3, zone: r.zone }))
      insertBatch(batch)
      totalRows += batch.length
      originsWithData++
    }

    if (i % 10 === 0) {
      const elapsedSec = (Date.now() - startTime) / 1000
      const pct = ((i / 999) * 100).toFixed(1)
      const eta =
        elapsedSec > 0
          ? `~${((elapsedSec / i) * (999 - i) / 60).toFixed(0)}m remaining`
          : ''
      console.log(
        `  ${i}/999 (${pct}%) — ${totalRows.toLocaleString()} rows — ${eta}`
      )
    }

    // Respectful rate limit: 300-500ms between requests
    await sleep(300 + Math.random() * 200)
  }

  // Store metadata so the app can display when zones were last seeded
  const upsertMeta = sqlite.prepare(
    'INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?, ?)'
  )
  upsertMeta.run('zones_seeded_at', new Date().toISOString())
  upsertMeta.run('zones_effective_date', shippingDate)
  upsertMeta.run('zones_row_count', String(totalRows))
  upsertMeta.run('zones_origin_count', String(originsWithData))

  const totalMin = ((Date.now() - startTime) / 60000).toFixed(1)

  console.log(`\n── Seed complete ──────────────────────────────────`)
  console.log(`  Origins with data: ${originsWithData}`)
  console.log(`  Origins skipped:   ${originsSkipped} (unused ZIP3 prefixes)`)
  console.log(`  Total rows:        ${totalRows.toLocaleString()}`)
  console.log(`  Time:              ${totalMin} minutes`)

  // ── Validation spot checks ───────────────────────────────────────────────
  console.log('\n── Validation ─────────────────────────────────────')

  function checkZone(origin: string, dest: string, expectedMin: number, expectedMax: number) {
    const row = sqlite
      .prepare('SELECT zone FROM zone_maps WHERE origin_zip3 = ? AND dest_zip3 = ?')
      .get(origin, dest) as { zone: number } | undefined

    if (!row) {
      console.log(`  ${origin} → ${dest}: NOT FOUND  ✗`)
      return
    }
    const ok = row.zone >= expectedMin && row.zone <= expectedMax
    console.log(
      `  ${origin} → ${dest}: zone ${row.zone}  ${ok ? '✓' : `✗ (expected ${expectedMin}-${expectedMax})`}`
    )
  }

  // Known-good from project validation data (spreadsheet says zone 5;
  // USPS may return 4 or 5 — both acceptable)
  checkZone('531', '040', 4, 5)

  const distinctOrigins = (
    sqlite
      .prepare('SELECT COUNT(DISTINCT origin_zip3) as cnt FROM zone_maps')
      .get() as { cnt: number }
  ).cnt

  const rowCountOk = totalRows >= 700_000
  const originCountOk = distinctOrigins >= 600
  console.log(
    `  Total rows ${totalRows.toLocaleString()}: ${rowCountOk ? '✓' : '✗ LOW — expected ≥700,000'}`
  )
  console.log(
    `  Distinct origins ${distinctOrigins}: ${originCountOk ? '✓' : '✗ LOW — expected ≥600'}`
  )

  sqlite.pragma('foreign_keys = ON')
  sqlite.close()
  console.log('\nDone. Zone data is ready for use.')
}

main().catch(err => {
  console.error('\nSeed failed:', err)
  process.exit(1)
})
