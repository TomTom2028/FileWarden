import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import Database from 'better-sqlite3'

// `import.meta.url` is avoided — pkg's bytecode compiler fails on it and then
// ships an ESM-to-CJS-rewritten source that Node refuses to load under "type":"module".
// `process.argv[1]` holds the entry script's snapshot path inside pkg.
const entryScript = process.argv[1]
if (!entryScript) {
	throw new Error('Could not resolve entry script path (process.argv[1] is empty)')
}
const MIGRATIONS_DIR = path.join(path.dirname(entryScript), '..', 'prisma', 'migrations')

// Mirrors Prisma's own tracking table so `prisma migrate dev` against the
// same db won't try to re-apply migrations we already ran.
const TRACKING_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
)
`

interface AppliedRow {
	migration_name: string
}

export function runMigrations(dbFile: string): void {
	const db = new Database(dbFile)
	try {
		db.exec(TRACKING_TABLE_DDL)

		const entries = fs.readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
		const migrationDirs = entries
			.filter((e) => e.isDirectory())
			.map((e) => e.name)
			.sort()

		const appliedRows = db
			.prepare('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL')
			.all() as AppliedRow[]
		const applied = new Set(appliedRows.map((r) => r.migration_name))

		const insert = db.prepare(
			'INSERT INTO _prisma_migrations (id, checksum, migration_name, applied_steps_count) VALUES (?, ?, ?, 0)'
		)
		const finish = db.prepare(
			'UPDATE _prisma_migrations SET finished_at = current_timestamp, applied_steps_count = 1 WHERE id = ?'
		)

		for (const name of migrationDirs) {
			if (applied.has(name)) continue

			const sqlPath = path.join(MIGRATIONS_DIR, name, 'migration.sql')
			const sql = fs.readFileSync(sqlPath, 'utf8')
			const checksum = crypto.createHash('sha256').update(sql).digest('hex')
			const id = crypto.randomUUID()

			console.log(`Applying migration: ${name}`)
			db.transaction(() => {
				insert.run(id, checksum, name)
				db.exec(sql)
				finish.run(id)
			})()
		}
	} finally {
		db.close()
	}
}
