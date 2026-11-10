/**
 * Upsert offline vision review rows from a results.json file.
 *
 *   npm run import:ai-reviews -- ./results.json
 *   BINDER_CONFIRM=1 npm run import:ai-reviews -- ./results.json
 *
 * Uses DATABASE_URL (falls back to DATABASE_URL_UNPOOLED). Skips unknown photo_ids.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { aiAngleToBinder, readStringArray, type AiOutcome } from '../src/lib/binder/ai-review'
import { writesEnabled } from '../src/lib/binder/confirm'
import { query } from '../src/lib/binder/db'
import { requireEnv } from '../src/lib/binder/env'
import { UUID_RE } from '../src/lib/binder/review'

type ImportRow = {
  photo_id: string
  r2_key?: string
  outcome: AiOutcome
  suggested_truck_slug?: string | null
  generation_years_guess?: string | null
  angle?: string | null
  confidence?: number | null
  reasons?: unknown
  questions_for_jake?: unknown
  reject_reason?: string | null
  model?: string | null
  reviewed_at?: string | null
}

type ResultsFile = {
  photos: ImportRow[]
}

function reviewedAt(value: string | null | undefined): Date | null {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? new Date(time) : null
}

async function photoExists(id: string): Promise<boolean> {
  const result = await query<{ id: string }>(`select id from photos where id = $1::uuid`, [id])
  return result.rows.length > 0
}

async function upsertRow(row: ImportRow, raw: unknown) {
  const reasons = JSON.stringify(readStringArray(row.reasons))
  const questions = JSON.stringify(readStringArray(row.questions_for_jake))
  await query(
    `insert into photo_ai_reviews (
      photo_id, outcome, suggested_truck_slug, angle, confidence,
      reasons, questions, reject_reason, generation_years_guess, model, reviewed_at, raw
    ) values (
      $1::uuid, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12::jsonb
    )
    on conflict (photo_id) do update set
      outcome = excluded.outcome,
      suggested_truck_slug = excluded.suggested_truck_slug,
      angle = excluded.angle,
      confidence = excluded.confidence,
      reasons = excluded.reasons,
      questions = excluded.questions,
      reject_reason = excluded.reject_reason,
      generation_years_guess = excluded.generation_years_guess,
      model = excluded.model,
      reviewed_at = excluded.reviewed_at,
      raw = excluded.raw`,
    [
      row.photo_id,
      row.outcome,
      row.suggested_truck_slug ?? null,
      aiAngleToBinder(row.angle) ?? row.angle ?? null,
      row.confidence ?? null,
      reasons,
      questions,
      row.reject_reason ?? null,
      row.generation_years_guess ?? null,
      row.model ?? null,
      reviewedAt(row.reviewed_at),
      JSON.stringify(raw),
    ],
  )
}

async function main() {
  const fileArg = process.argv[2]
  if (!fileArg) {
    console.error('Usage: npm run import:ai-reviews -- <path-to-results.json>')
    process.exit(1)
  }
  const file = path.resolve(fileArg)
  const parsed = JSON.parse(await readFile(file, 'utf8')) as ResultsFile
  const rows = parsed.photos ?? []
  if (rows.length === 0) {
    console.error('No photos in file.')
    process.exit(1)
  }
  try {
    requireEnv('DATABASE_URL')
  } catch {
    try {
      requireEnv('DATABASE_URL_UNPOOLED')
    } catch {
      console.error('DATABASE_URL is not set')
      process.exit(1)
    }
  }

  let skipped = 0
  let invalid = 0
  let upserted = 0
  for (const row of rows) {
    if (!row.photo_id || !UUID_RE.test(row.photo_id)) {
      invalid += 1
      continue
    }
    const allowed = ['looks_right', 'reject', 'wrong_truck', 'needs_jake'] as const
    if (!allowed.includes(row.outcome)) {
      invalid += 1
      continue
    }
    if (!(await photoExists(row.photo_id))) {
      skipped += 1
      continue
    }
    if (!writesEnabled()) {
      upserted += 1
      continue
    }
    await upsertRow(row, row)
    upserted += 1
  }
  if (!writesEnabled()) {
    console.log(`Dry run. Would upsert ${upserted}, skip ${skipped} missing, ${invalid} invalid.`)
    console.log('Set BINDER_CONFIRM=1 to write.')
    return
  }
  console.log(`upserted ${upserted}, skipped ${skipped} missing photos, ${invalid} invalid rows`)
}

main().catch((error: unknown) => {
  const name = error instanceof Error ? error.name : 'Error'
  console.error(`import-ai-reviews failed (${name})`)
  process.exit(1)
})
