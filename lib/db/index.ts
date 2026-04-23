import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import path from 'path'
import fs from 'fs'

// Allow tests (and future deployment scenarios) to point at a different file.
// Defaults to ./db/shipping-analyzer.db inside the project.
const DB_PATH = process.env.SHIPPING_ANALYZER_DB_PATH
  || path.join(process.cwd(), 'db', 'shipping-analyzer.db')

// Ensure db/ directory exists before opening the file. Drizzle's migrator
// creates the schema itself — no CREATE TABLE statements belong here.
const dbDir = path.dirname(DB_PATH)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

const sqlite = new Database(DB_PATH)

// WAL: better concurrent read performance under our read-heavy workload.
// foreign_keys must be enabled per-connection in SQLite for our ON DELETE
// CASCADE constraints to take effect.
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })
export { sqlite }
