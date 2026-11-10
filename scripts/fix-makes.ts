/**
 * Give every truck its real make, and mark which makes appear on the homepage.
 *
 * Dry run (no Sanity writes):
 *   npm run fix:makes
 * Write the mutation list, still with no Sanity writes:
 *   npm run fix:makes -- --plan-json makes.json
 * Write with a token. The read uses that same client, so a re-run sees docs it created:
 *   BINDER_CONFIRM=1 SANITY_API_TOKEN=... npm run fix:makes
 *
 * Slugs are never changed. Documents are never deleted.
 * New make ids are `make-<slug>` with no dot, so anonymous readers can see them.
 * A draft is patched with set() for title and the make reference only.
 */
import { writeFileSync } from 'node:fs'
import { createClient, type SanityClient } from '@sanity/client'
import { writesEnabled } from '../src/lib/binder/confirm'
import {
  CATCH_ALL_SLUG,
  FEATURED_MAKE_SLUGS,
  buildMakeMutations,
  isCatchAllMake,
  planTruckMake,
  type TruckMakeOverride,
  type TruckMakePlan,
} from '../src/lib/makes'
import { apiVersion, dataset, projectId } from '../src/lib/sanityConfig'

type MakeDoc = {
  _id: string
  name?: string | null
  slug?: string | null
  featured?: boolean | null
  isCatchAll?: boolean | null
}

type TruckDoc = {
  _id: string
  slug?: string | null
  title?: string | null
  summary?: string | null
  makeName?: string | null
  makeSlug?: string | null
}

/** Per-slug decisions. These win over the title prefix. */
export const TRUCK_OVERRIDES: Record<string, TruckMakeOverride> = {
  'datsun-1': { makeName: 'Nissan', makeSlug: 'nissan', source: 'override: stays Nissan' },
  'datsun-2': { makeName: 'Nissan', makeSlug: 'nissan', source: 'override: stays Nissan' },
  'datsun-3': { makeName: 'Nissan', makeSlug: 'nissan', source: 'override: stays Nissan' },
  'datsun-4': { makeName: 'Nissan', makeSlug: 'nissan', source: 'override: stays Nissan' },
  mit: {
    makeName: 'Mitsubishi',
    makeSlug: 'mitsubishi',
    title: 'Mighty Max / Ram 50',
    source: 'override: Mighty Max / Ram 50',
  },
}

const TRUCKS = `*[_type == "truckModel" && !(_id in path("drafts.**"))] | order(slug.current asc) {
  _id,
  "slug": slug.current,
  title,
  summary,
  "makeName": manufacturer->name,
  "makeSlug": manufacturer->slug.current
}`

const MAKES = `*[_type == "manufacturer" && !(_id in path("drafts.**"))] {
  _id,
  name,
  "slug": slug.current,
  featured,
  isCatchAll
}`

function cell(value: string): string {
  return value.replace(/\|/g, '/').replace(/\s+/g, ' ').trim()
}

export function formatPlanTable(plans: TruckMakePlan[]): string {
  const header = '| slug | current title | current make | new title | new make | source | flagged |'
  const rule = '| --- | --- | --- | --- | --- | --- | --- |'
  const rows = plans.map(
    (plan) =>
      `| ${cell(plan.slug)} | ${cell(plan.currentTitle)} | ${cell(plan.currentMake)} | ${cell(plan.newTitle)} | ${cell(plan.newMake)} | ${cell(plan.source)} | ${plan.flagged ? 'yes' : 'no'} |`,
  )
  return [header, rule, ...rows].join('\n')
}

function planJsonPath(argv: readonly string[]): string | null {
  const index = argv.indexOf('--plan-json')
  if (index === -1) return null
  const file = argv[index + 1]
  if (!file || file.startsWith('-')) {
    console.error('--plan-json needs a file path')
    process.exit(1)
  }
  return file
}

function plansFrom(trucks: TruckDoc[]): TruckMakePlan[] {
  return trucks.flatMap((truck) => {
    if (!truck._id || !truck.slug || !truck.title) return []
    return [
      planTruckMake(
        {
          id: truck._id,
          slug: truck.slug,
          title: truck.title,
          makeName: truck.makeName ?? '',
          makeSlug: truck.makeSlug ?? '',
          summary: truck.summary,
        },
        TRUCK_OVERRIDES,
      ),
    ]
  })
}

async function loadCatalog(client: SanityClient) {
  const [trucks, makes] = await Promise.all([client.fetch<TruckDoc[]>(TRUCKS), client.fetch<MakeDoc[]>(MAKES)])
  return { trucks, makes }
}

function printPlan(plans: TruckMakePlan[], makes: MakeDoc[]) {
  const bySlug = new Set(makes.flatMap((make) => (make.slug && !make._id.includes('.') ? [make.slug] : [])))
  const needed = new Map<string, string>()
  for (const plan of plans) {
    if (isCatchAllMake({ slug: plan.newMakeSlug, name: plan.newMake })) continue
    if (!bySlug.has(plan.newMakeSlug)) needed.set(plan.newMakeSlug, plan.newMake)
  }
  console.log(formatPlanTable(plans))
  console.log('')
  const flagged = plans.filter((plan) => plan.flagged)
  const changed = plans.filter((plan) => plan.changed)
  console.log(`${plans.length} trucks, ${changed.length} to change, ${flagged.length} flagged.`)
  if (needed.size > 0) {
    const names = [...needed.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([slug, name]) => `${name} (${slug})`)
    console.log(`Create makes: ${names.join(', ')}`)
  } else {
    console.log('Create makes: none')
  }
  console.log(
    `Homepage featured flags: ${FEATURED_MAKE_SLUGS.join(', ')}. More... stays the catch-all (${CATCH_ALL_SLUG}). New makes are not featured.`,
  )
}

async function main() {
  const jsonPath = planJsonPath(process.argv)
  const writing = writesEnabled() && !jsonPath
  let client = createClient({ projectId, dataset, apiVersion, useCdn: false })
  if (writing) {
    const token = process.env.SANITY_API_TOKEN
    if (!token) {
      console.error('SANITY_API_TOKEN is not set')
      process.exit(1)
    }
    client = createClient({ projectId, dataset, apiVersion, token, useCdn: false })
  }

  const { trucks, makes } = await loadCatalog(client)
  const plans = plansFrom(trucks)
  printPlan(plans, makes)
  const { mutations, draftPatches } = buildMakeMutations(plans, makes)

  if (jsonPath) {
    writeFileSync(
      jsonPath,
      `${JSON.stringify(
        {
          note: 'Apply mutations in one transaction. Apply each draftPatches entry only when that draft exists. Draft sets are title and the make reference, and nothing else.',
          mutations,
          draftPatches,
        },
        null,
        2,
      )}\n`,
    )
    console.log(`Wrote ${jsonPath}. No Sanity writes.`)
    return
  }

  if (!writing) {
    console.log('Dry run. No Sanity writes.')
    console.log('Write the mutations with: npm run fix:makes -- --plan-json makes.json')
    console.log('Or patch Sanity with: BINDER_CONFIRM=1 SANITY_API_TOKEN=... npm run fix:makes')
    return
  }

  for (const mutation of mutations) {
    if ('createIfNotExists' in mutation) await client.createIfNotExists(mutation.createIfNotExists)
    else await client.patch(mutation.patch.id).set(mutation.patch.set).commit()
  }
  const draftIds = new Set(
    await client.fetch<string[]>(`*[_id in path("drafts.**") && _type == "truckModel"]._id`),
  )
  for (const mutation of draftPatches) {
    if (!('patch' in mutation) || !draftIds.has(mutation.patch.id)) continue
    await client.patch(mutation.patch.id).set(mutation.patch.set).commit()
  }
  console.log('Sanity patches committed.')
}

const entry = process.argv[1] ?? ''
if (entry.endsWith('fix-makes.ts') || entry.endsWith('fix-makes.js')) {
  main().catch((error: unknown) => {
    const name = error instanceof Error ? error.name : 'Error'
    console.error(`make fix failed (${name})`)
    process.exit(1)
  })
}
