/**
 * Test harness for API route handlers. Each test file calls setupTestDb() in
 * its beforeAll to get a fresh SQLite file, runs migrations against it, and
 * dynamically imports route handlers — the dynamic import ensures the env var
 * is set before `lib/db` is evaluated.
 */
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

export interface TestDbHandle {
  dir: string
  dbPath: string
  cleanup: () => void
}

export function createTestDb(): TestDbHandle {
  const dir = mkdtempSync(join(tmpdir(), 'sa-test-'))
  const dbPath = join(dir, 'test.db')
  process.env.SHIPPING_ANALYZER_DB_PATH = dbPath
  return {
    dir,
    dbPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

export async function applyMigrations() {
  const { db } = await import('@/lib/db')
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  migrate(db, { migrationsFolder: './lib/db/migrations' })
}

/** Reset all analysis-scoped tables between tests (preserves zone_maps). */
export async function resetAnalysisTables() {
  const { sqlite } = await import('@/lib/db')
  sqlite.exec(`
    DELETE FROM excluded_orders;
    DELETE FROM order_results;
    DELETE FROM rate_card_entries;
    DELETE FROM rate_cards;
    DELETE FROM orders;
    DELETE FROM warehouses;
    DELETE FROM analyses;
  `)
}

/** Seed zone map rows used across calculate tests. */
export async function seedZoneMaps(
  entries: Array<{ originZip3: string; destZip3: string; zone: number }>,
) {
  const { sqlite } = await import('@/lib/db')
  const stmt = sqlite.prepare(
    'INSERT OR REPLACE INTO zone_maps (origin_zip3, dest_zip3, zone) VALUES (?, ?, ?)',
  )
  const txn = sqlite.transaction((rows: typeof entries) => {
    for (const r of rows) stmt.run(r.originZip3, r.destZip3, r.zone)
  })
  txn(entries)
}

/**
 * Build a minimal Request for Next.js route handlers. The app-router handlers
 * take (NextRequest, { params: Promise<...> }) — we fake both.
 */
export function makeCtx<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) } as { params: Promise<T> }
}

export function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

/**
 * Create a multipart/form-data Request with a file field and optional extra
 * string fields. Works with the File/FormData globals provided by Node 18+.
 */
export function multipartRequest(
  url: string,
  file: { name: string; contentType: string; data: string | Uint8Array },
  fields: Record<string, string> = {},
): Request {
  const form = new FormData()
  const blob = new Blob([file.data as BlobPart], { type: file.contentType })
  form.append('file', new File([blob], file.name, { type: file.contentType }))
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  return new Request(url, { method: 'POST', body: form })
}
