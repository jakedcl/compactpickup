import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { withDirectClient } from '../src/lib/binder/db'
import { writesEnabled } from '../src/lib/binder/confirm'

const MIGRATION = /^\d+_.+\.sql$/

function statements(sql: string): string[] {
  const withoutComments = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
  return withoutComments
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
}

async function migrationFiles(): Promise<string[]> {
  const directory = path.join(process.cwd(), 'db', 'migrations')
  const names = await readdir(directory)
  return names.filter((name) => MIGRATION.test(name)).sort()
}

async function main() {
  const files = await migrationFiles()
  if (files.length === 0) {
    console.error('No migration files in db/migrations')
    process.exit(1)
  }
  if (!process.env.DATABASE_URL_UNPOOLED) {
    for (const file of files) console.log(file)
    if (writesEnabled()) {
      console.error('DATABASE_URL_UNPOOLED is not set')
      process.exit(1)
    }
    console.log('Dry run. DATABASE_URL_UNPOOLED is not set, so applied history was not read.')
    console.log('Set BINDER_CONFIRM=1 to apply once the direct URL is set.')
    return
  }

  await withDirectClient(async (client) => {
    await client.query(
      `create table if not exists schema_migrations (
         filename text primary key,
         applied_at timestamptz not null default now()
       )`,
    )
    const applied = await client.query<{ filename: string }>(`select filename from schema_migrations`)
    const done = new Set(applied.rows.map((row) => row.filename))
    const pending = files.filter((file) => !done.has(file))
    if (pending.length === 0) {
      console.log('No pending migrations.')
      return
    }
    for (const file of pending) console.log(`pending ${file}`)
    if (!writesEnabled()) {
      console.log('Dry run. Set BINDER_CONFIRM=1 to apply.')
      return
    }
    for (const file of pending) {
      const sql = await readFile(path.join(process.cwd(), 'db', 'migrations', file), 'utf8')
      await client.query('begin')
      try {
        for (const statement of statements(sql)) {
          await client.query(statement)
        }
        await client.query(`insert into schema_migrations (filename) values ($1)`, [file])
        await client.query('commit')
        console.log(`applied ${file}`)
      } catch (error) {
        await client.query('rollback')
        throw error
      }
    }
  })
}

main().catch((error: unknown) => {
  const name = error instanceof Error ? error.name : 'Error'
  console.error(`migration failed (${name})`)
  process.exit(1)
})
