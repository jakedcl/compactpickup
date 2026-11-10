/**
 * Give every truck its real make, and mark which makes appear on the homepage.
 *
 * Dry run (no Sanity writes):
 *   npm run fix:makes
 * Write published docs, and a matching draft when one exists:
 *   BINDER_CONFIRM=1 SANITY_API_TOKEN=... npm run fix:makes
 *
 * Slugs are never changed. Documents are never deleted.
 */
import { createClient, type SanityClient } from '@sanity/client'
import { writesEnabled } from '../src/lib/binder/confirm'
import {
  CATCH_ALL_SLUG,
  FEATURED_MAKE_SLUGS,
  isCatchAllMake,
  planTruckMake,
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

function makeIdFor(slug: string, existing: Map<string, MakeDoc>): string {
  return existing.get(slug)?._id ?? `make.${slug}`
}

async function patchBoth(client: SanityClient, id: string, draftIds: Set<string>, set: Record<string, unknown>) {
  await client.patch(id).set(set).commit()
  const draftId = `drafts.${id}`
  if (draftIds.has(draftId)) await client.patch(draftId).set(set).commit()
}

async function main() {
  const client = createClient({ projectId, dataset, apiVersion, useCdn: false })
  const [trucks, makes] = await Promise.all([
    client.fetch<TruckDoc[]>(TRUCKS),
    client.fetch<MakeDoc[]>(MAKES),
  ])
  const plans = trucks.flatMap((truck) => {
    if (!truck._id || !truck.slug || !truck.title) return []
    return [
      planTruckMake({
        id: truck._id,
        slug: truck.slug,
        title: truck.title,
        makeName: truck.makeName ?? '',
        makeSlug: truck.makeSlug ?? '',
        summary: truck.summary,
      }),
    ]
  })
  const bySlug = new Map(makes.flatMap((make) => (make.slug ? [[make.slug, make] as const] : [])))
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
    console.log(`Create makes: ${[...needed.entries()].map(([slug, name]) => `${name} (${slug})`).join(', ')}`)
  } else {
    console.log('Create makes: none')
  }
  console.log(
    `Homepage featured flags: ${FEATURED_MAKE_SLUGS.join(', ')}. More... stays the catch-all (${CATCH_ALL_SLUG}).`,
  )

  if (!writesEnabled()) {
    console.log('Dry run. Set BINDER_CONFIRM=1 and SANITY_API_TOKEN to patch Sanity.')
    return
  }

  const token = process.env.SANITY_API_TOKEN
  if (!token) {
    console.error('SANITY_API_TOKEN is not set')
    process.exit(1)
  }
  const writer = createClient({ projectId, dataset, apiVersion, token, useCdn: false })
  const draftIds = new Set(
    await writer.fetch<string[]>(`*[_id in path("drafts.**") && _type in ["truckModel", "manufacturer"]]._id`),
  )

  for (const [slug, name] of needed) {
    const _id = `make.${slug}`
    await writer.createIfNotExists({
      _id,
      _type: 'manufacturer',
      name,
      slug: { _type: 'slug', current: slug },
      featured: false,
      isCatchAll: false,
    })
    bySlug.set(slug, { _id, name, slug, featured: false, isCatchAll: false })
  }

  for (const make of makes) {
    if (!make.slug || !make._id) continue
    const catchAll = isCatchAllMake({ name: make.name, slug: make.slug, isCatchAll: make.isCatchAll })
    const featured = catchAll ? false : (FEATURED_MAKE_SLUGS as readonly string[]).includes(make.slug)
    await patchBoth(writer, make._id, draftIds, { featured, ...(catchAll ? { isCatchAll: true } : {}) })
  }

  for (const plan of plans) {
    if (!plan.changed) continue
    const ref = makeIdFor(plan.newMakeSlug, bySlug)
    await patchBoth(writer, plan.id, draftIds, {
      title: plan.newTitle,
      manufacturer: { _type: 'reference', _ref: ref },
    })
    console.log(`patched ${plan.slug}`)
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
