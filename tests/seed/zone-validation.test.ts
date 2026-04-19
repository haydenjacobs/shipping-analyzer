/**
 * zone-validation.test.ts
 *
 * Validates that the zone_maps table was seeded correctly.
 * Run AFTER `npm run seed-zones` completes.
 *
 * These tests will skip (not fail) if the table is empty, so they
 * don't break CI before seeding has been run.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import Database from 'better-sqlite3'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'db', 'shipping-analyzer.db')

let sqlite: Database.Database | null = null
let rowCount = 0

beforeAll(() => {
  try {
    sqlite = new Database(DB_PATH, { readonly: true })
    rowCount = (sqlite.prepare('SELECT COUNT(*) as cnt FROM zone_maps').get() as { cnt: number }).cnt
  } catch {
    // DB doesn't exist yet — tests will skip
    sqlite = null
    rowCount = 0
  }
})

function skipIfNotSeeded() {
  if (!sqlite || rowCount === 0) {
    return true
  }
  return false
}

describe('Zone seed validation', () => {
  it('has at least 700,000 rows', () => {
    if (skipIfNotSeeded()) return
    expect(rowCount).toBeGreaterThanOrEqual(700_000)
  })

  it('has at least 600 distinct origin ZIP3s', () => {
    if (skipIfNotSeeded()) return
    const result = sqlite!
      .prepare('SELECT COUNT(DISTINCT origin_zip3) as cnt FROM zone_maps')
      .get() as { cnt: number }
    expect(result.cnt).toBeGreaterThanOrEqual(600)
  })

  it('origin 531 → dest 040 is zone 4 or 5 (Milwaukee → Maine)', () => {
    // Spreadsheet says zone 5. USPS may return 4 or 5 — both acceptable.
    if (skipIfNotSeeded()) return
    const row = sqlite!
      .prepare('SELECT zone FROM zone_maps WHERE origin_zip3 = ? AND dest_zip3 = ?')
      .get('531', '040') as { zone: number } | undefined
    expect(row).not.toBeUndefined()
    expect(row!.zone).toBeGreaterThanOrEqual(4)
    expect(row!.zone).toBeLessThanOrEqual(5)
  })

  it('all zones are integers between 1 and 8', () => {
    if (skipIfNotSeeded()) return
    const bad = sqlite!
      .prepare('SELECT COUNT(*) as cnt FROM zone_maps WHERE zone < 1 OR zone > 8')
      .get() as { cnt: number }
    expect(bad.cnt).toBe(0)
  })

  it('no duplicate origin+dest pairs', () => {
    if (skipIfNotSeeded()) return
    const dups = sqlite!
      .prepare(
        `SELECT COUNT(*) as cnt FROM (
          SELECT origin_zip3, dest_zip3, COUNT(*) as c
          FROM zone_maps
          GROUP BY origin_zip3, dest_zip3
          HAVING c > 1
        )`
      )
      .get() as { cnt: number }
    expect(dups.cnt).toBe(0)
  })

  it('all ZIP3s are exactly 3 digits', () => {
    if (skipIfNotSeeded()) return
    const bad = sqlite!
      .prepare(
        `SELECT COUNT(*) as cnt FROM zone_maps
         WHERE length(origin_zip3) != 3 OR length(dest_zip3) != 3`
      )
      .get() as { cnt: number }
    expect(bad.cnt).toBe(0)
  })

  it('metadata records zones_seeded_at', () => {
    if (skipIfNotSeeded()) return
    const row = sqlite!
      .prepare("SELECT value FROM app_metadata WHERE key = 'zones_seeded_at'")
      .get() as { value: string } | undefined
    expect(row).not.toBeUndefined()
    expect(row!.value).toMatch(/^\d{4}-\d{2}-\d{2}/) // ISO date
  })
})
