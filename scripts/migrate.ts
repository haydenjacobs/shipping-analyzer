import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { db } from '../lib/db'

// Apply all pending Drizzle migrations from lib/db/migrations.
// Run via `npm run db:migrate`.
migrate(db, { migrationsFolder: './lib/db/migrations' })
console.log('migrations applied')
