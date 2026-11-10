/**
 * Make is a manufacturer document, not a string on the truck.
 * `featured` on that document decides the homepage shelf.
 * Until those flags are written, the seven slugs below keep today's shelf:
 * Chevy, Ford, GMC, Isuzu, Mazda, Nissan, Toyota, plus the More... catch-all.
 */

export const FEATURED_MAKE_SLUGS = ['chevy', 'ford', 'gmc', 'isuzu', 'mazda', 'nissan', 'toyota'] as const

export const CATCH_ALL_SLUG = 'other'
export const MORE_ALIAS_SLUG = 'more'

const CATCH_ALL_NAMES = new Set(['More...', "One-Off's"])

export type MakeRef = {
  name?: string | null
  slug?: string | null
  featured?: boolean | null
  isCatchAll?: boolean | null
}

/** Longer prefixes first so Chevrolet wins over a shorter name. */
const TITLE_PREFIXES: ReadonlyArray<{ prefix: string; name: string; slug: string }> = [
  { prefix: 'Chevrolet', name: 'Chevy', slug: 'chevy' },
  { prefix: 'Volkswagen', name: 'Volkswagen', slug: 'volkswagen' },
  { prefix: 'Mitsubishi', name: 'Mitsubishi', slug: 'mitsubishi' },
  { prefix: 'Plymouth', name: 'Plymouth', slug: 'plymouth' },
  { prefix: 'Hyundai', name: 'Hyundai', slug: 'hyundai' },
  { prefix: 'Datsun', name: 'Datsun', slug: 'datsun' },
  { prefix: 'Hummer', name: 'Hummer', slug: 'hummer' },
  { prefix: 'Subaru', name: 'Subaru', slug: 'subaru' },
  { prefix: 'Suzuki', name: 'Suzuki', slug: 'suzuki' },
  { prefix: 'Honda', name: 'Honda', slug: 'honda' },
  { prefix: 'Dodge', name: 'Dodge', slug: 'dodge' },
  { prefix: 'Jeep', name: 'Jeep', slug: 'jeep' },
  { prefix: 'Nissan', name: 'Nissan', slug: 'nissan' },
  { prefix: 'Toyota', name: 'Toyota', slug: 'toyota' },
  { prefix: 'Mazda', name: 'Mazda', slug: 'mazda' },
  { prefix: 'Isuzu', name: 'Isuzu', slug: 'isuzu' },
  { prefix: 'Chevy', name: 'Chevy', slug: 'chevy' },
  { prefix: 'Ford', name: 'Ford', slug: 'ford' },
  { prefix: 'Ram', name: 'Ram', slug: 'ram' },
  { prefix: 'GMC', name: 'GMC', slug: 'gmc' },
]

export function isCatchAllMake(make: MakeRef): boolean {
  if (make.isCatchAll === true) return true
  if (make.slug === CATCH_ALL_SLUG || make.slug === MORE_ALIAS_SLUG) return true
  return Boolean(make.name && CATCH_ALL_NAMES.has(make.name))
}

/** A make with its own tape on the homepage. More... is not featured; it is the group. */
export function isFeaturedMake(make: MakeRef): boolean {
  if (isCatchAllMake(make)) return false
  if (make.featured === true) return true
  if (make.featured === false) return false
  return Boolean(make.slug && (FEATURED_MAKE_SLUGS as readonly string[]).includes(make.slug))
}

/** Homepage shelf: the featured makes, and the More... spot in its usual place. */
export function showsOnShelf(make: MakeRef): boolean {
  return isCatchAllMake(make) || isFeaturedMake(make)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function startsWithMake(title: string, makeName: string): boolean {
  const name = makeName.trim()
  if (!name) return false
  return new RegExp(`^${escapeRegExp(name)}(?:\\s+|$)`, 'i').test(title.trim())
}

/** Title with a leading make name removed. An empty result keeps the original title. */
export function stripMakePrefix(title: string, makeName: string): string {
  const trimmed = title.trim()
  const name = makeName.trim()
  if (!name) return trimmed
  const next = trimmed.replace(new RegExp(`^${escapeRegExp(name)}(?:\\s+|$)`, 'i'), '').trim()
  return next || trimmed
}

/** Card and page title: the model name, without repeating a make that is shown beside it. */
export function modelTitle(makeName: string | null | undefined, title: string): string {
  const make = (makeName ?? '').trim()
  const clean = title.trim()
  if (!make || isCatchAllMake({ name: make })) return clean
  return stripMakePrefix(clean, make)
}

/** One line for a label that has to include the make. More... is not prefixed. */
export function displayModelTitle(makeName: string | null | undefined, title: string): string {
  const make = (makeName ?? '').trim()
  const clean = title.trim()
  if (!make || isCatchAllMake({ name: make })) return clean
  if (startsWithMake(clean, make)) return clean
  return `${make} ${clean}`
}

export type TruckMakeInput = {
  id: string
  slug: string
  title: string
  makeName: string
  makeSlug: string
  summary?: string | null
}

export type TruckMakePlan = {
  id: string
  slug: string
  currentTitle: string
  currentMake: string
  currentMakeSlug: string
  newTitle: string
  newMake: string
  newMakeSlug: string
  source: string
  flagged: boolean
  changed: boolean
}

function titlePrefix(title: string): { prefix: string; name: string; slug: string } | null {
  const trimmed = title.trim()
  for (const entry of TITLE_PREFIXES) {
    if (startsWithMake(trimmed, entry.prefix)) return entry
  }
  return null
}

function uncertainBadge(title: string, summary: string): boolean {
  if (/rebadge/i.test(title)) return true
  return /three badges|several badges|multiple badges/i.test(summary)
}

/**
 * Real make from the title prefix when the title starts with one.
 * Otherwise keep the catalog make. A catch-all truck with no clear make stays More... and is flagged.
 * A title that names one make but describes several badges stays More... and is flagged.
 */
export function planTruckMake(truck: TruckMakeInput): TruckMakePlan {
  const currentMake = truck.makeName.trim() || 'More...'
  const currentSlug = truck.makeSlug.trim() || CATCH_ALL_SLUG
  const catchAll = isCatchAllMake({ name: currentMake, slug: currentSlug })
  const match = titlePrefix(truck.title)
  const summary = truck.summary ?? ''
  const base = {
    id: truck.id,
    slug: truck.slug,
    currentTitle: truck.title,
    currentMake,
    currentMakeSlug: currentSlug,
  }

  if (match && catchAll && uncertainBadge(truck.title, summary)) {
    return {
      ...base,
      newTitle: truck.title,
      newMake: currentMake,
      newMakeSlug: currentSlug,
      source: `flagged: title starts with ${match.name}, but the overview describes more than one badge`,
      flagged: true,
      changed: false,
    }
  }

  if (match) {
    const newTitle = stripMakePrefix(truck.title, match.prefix)
    const changed = newTitle !== truck.title || match.slug !== currentSlug || match.name !== currentMake
    return {
      ...base,
      newTitle,
      newMake: match.name,
      newMakeSlug: match.slug,
      source: 'title prefix',
      flagged: false,
      changed,
    }
  }

  if (catchAll) {
    return {
      ...base,
      newTitle: truck.title,
      newMake: currentMake,
      newMakeSlug: currentSlug,
      source: 'flagged: no make in the title',
      flagged: true,
      changed: false,
    }
  }

  const newTitle = stripMakePrefix(truck.title, currentMake)
  return {
    ...base,
    newTitle,
    newMake: currentMake,
    newMakeSlug: currentSlug,
    source: 'catalog make',
    flagged: false,
    changed: newTitle !== truck.title,
  }
}

export function makeOptions(names: readonly string[]): string[] {
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))].sort((a, b) => {
    const aCatch = isCatchAllMake({ name: a })
    const bCatch = isCatchAllMake({ name: b })
    if (aCatch !== bCatch) return aCatch ? 1 : -1
    return a.localeCompare(b)
  })
}
