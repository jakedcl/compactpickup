/**
 * Display helpers for structured truck fields.
 * Null, blank, and the literal string "null" are treated as missing.
 */

export type EngineSpec = {
  _key?: string
  name?: string | null
  displacement?: string | null
  config?: string | null
  hp?: number | null
  torque?: string | null
  years?: string | null
  notes?: string | null
}

export type Dimensions = {
  wheelbaseIn?: unknown
  lengthIn?: unknown
  widthIn?: unknown
  heightIn?: unknown
} | null

export type RelatedTruckRef = {
  title?: string | null
  slug?: string | null
  manufacturerSlug?: string | null
} | null

export type TruckLink = {
  _key?: string
  name?: string | null
  relation?: string | null
  truck?: RelatedTruckRef
} | null

export type TruckSpecData = {
  generation?: string | null
  nameplate?: string | null
  productionStart?: number | null
  productionEnd?: number | null
  yearBasis?: string | null
  internalCodes?: Array<string | null> | null
  assemblyPlants?: Array<string | null> | null
  markets?: Array<string | null> | null
  bodyStyles?: Array<string | null> | null
  bedLengths?: Array<string | null> | null
  trims?: Array<string | null> | null
  transmissions?: Array<string | null> | null
  drivetrains?: Array<string | null> | null
  engines?: Array<EngineSpec | null> | null
  dimensions?: Dimensions
  curbWeight?: string | null
  payload?: string | null
  towing?: string | null
  launchMSRP?: string | null
  summary?: string | null
  sources?: Array<string | null> | null
  predecessor?: TruckLink
  successor?: TruckLink
  siblings?: Array<TruckLink> | null
}

export type SpecRow = {
  label: string
  value: string | string[]
  note?: string | null
}

export type ContentFlags = {
  hasEngines: boolean
  hasSpecs: boolean
  hasRelated: boolean
  hasSources: boolean
}

/** Labels whose data replaces the portable-text "Specifications" section. */
const SPECIFICATION_LABELS = new Set([
  'Production',
  'Assembly',
  'Markets',
  'Codes',
  'Wheelbase',
  'Length',
  'Width',
  'Height',
  'Curb weight',
  'Payload',
  'Towing',
  'Launch MSRP',
])

export function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.toLowerCase() === 'null') return null
  return trimmed
}

export function cleanList(values: Array<string | null> | null | undefined): string[] | null {
  if (!Array.isArray(values)) return null
  const items = values
    .map((item) => cleanText(item))
    .filter((item): item is string => Boolean(item))
  return items.length ? items : null
}

export function cleanSources(values: Array<string | null> | null | undefined): string[] {
  return (cleanList(values) ?? []).filter((url) => /^https?:\/\//i.test(url))
}

function asNumbers(value: unknown): number[] {
  const source = Array.isArray(value) ? value : [value]
  return source.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
}

function formatInches(value: unknown): string | null {
  const nums = asNumbers(value)
  if (!nums.length) return null
  return `${nums.join(' / ')} in`
}

/** US model years are the site default, so that phrase is not repeated on each truck. */
export function yearBasisNote(yearBasis?: string | null): string | null {
  const basis = cleanText(yearBasis)
  if (!basis || basis.toLowerCase() === 'us model years') return null
  return basis
}

export function formatProduction(start?: number | null, end?: number | null): string | null {
  const hasStart = typeof start === 'number'
  const hasEnd = typeof end === 'number'
  if (!hasStart && !hasEnd) return null
  if (hasStart && hasEnd) return `${start}–${end}`
  if (hasStart) return `${start}–present`
  return `through ${end}`
}

export function displayEngines(engines: TruckSpecData['engines']): EngineSpec[] {
  if (!Array.isArray(engines)) return []
  return engines.filter((engine): engine is EngineSpec => {
    if (!engine) return false
    return Boolean(
      cleanText(engine.name) ||
        cleanText(engine.displacement) ||
        cleanText(engine.config) ||
        typeof engine.hp === 'number' ||
        cleanText(engine.torque) ||
        cleanText(engine.years) ||
        cleanText(engine.notes),
    )
  })
}

export function engineColumns(engines: EngineSpec[]) {
  const columns: Array<{key: keyof EngineSpec; label: string}> = [
    {key: 'name', label: 'Engine'},
    {key: 'displacement', label: 'Disp.'},
    {key: 'config', label: 'Config'},
    {key: 'hp', label: 'HP'},
    {key: 'torque', label: 'Torque'},
    {key: 'years', label: 'Years'},
    {key: 'notes', label: 'Notes'},
  ]
  return columns.filter((column) =>
    engines.some((engine) => {
      const value = engine[column.key]
      if (column.key === 'hp') return typeof value === 'number'
      return Boolean(cleanText(value))
    }),
  )
}

export function specRows(truck: TruckSpecData): SpecRow[] {
  const rows: SpecRow[] = []
  const push = (label: string, value: string | string[] | null) => {
    if (!value || (Array.isArray(value) && value.length === 0)) return
    rows.push({label, value})
  }
  const dimensions = truck.dimensions

  push('Generation', cleanText(truck.generation))
  push('Nameplate', cleanText(truck.nameplate))
  const production = formatProduction(truck.productionStart, truck.productionEnd)
  const note = yearBasisNote(truck.yearBasis)
  if (production) rows.push({label: 'Production', value: production, note})
  else if (note) rows.push({label: 'Production', value: note})
  push('Assembly', cleanList(truck.assemblyPlants))
  push('Markets', cleanList(truck.markets))
  push('Codes', cleanList(truck.internalCodes))
  push('Body styles', cleanList(truck.bodyStyles))
  push('Bed lengths', cleanList(truck.bedLengths))
  push('Drivetrains', cleanList(truck.drivetrains))
  push('Transmissions', cleanList(truck.transmissions))
  push('Trims', cleanList(truck.trims))
  push('Wheelbase', formatInches(dimensions?.wheelbaseIn))
  push('Length', formatInches(dimensions?.lengthIn))
  push('Width', formatInches(dimensions?.widthIn))
  push('Height', formatInches(dimensions?.heightIn))
  push('Curb weight', cleanText(truck.curbWeight))
  push('Payload', cleanText(truck.payload))
  push('Towing', cleanText(truck.towing))
  push('Launch MSRP', cleanText(truck.launchMSRP))

  return rows
}

export function glanceFacts(truck: TruckSpecData, yearRange?: string | null): Array<{label: string; value: string}> {
  const facts: Array<{label: string; value: string}> = []
  const years = cleanText(yearRange) || formatProduction(truck.productionStart, truck.productionEnd)
  const drives = cleanList(truck.drivetrains)
  const engineNames = [...new Set(
    displayEngines(truck.engines)
      .map((engine) => cleanText(engine.name) || cleanText(engine.config))
      .filter((name): name is string => Boolean(name)),
  )]
  const markets = cleanList(truck.markets)
  if (years) facts.push({label: 'Years', value: years})
  if (drives?.length) facts.push({label: 'Drivetrain', value: drives.join(' · ')})
  if (engineNames.length) facts.push({label: 'Engines', value: engineNames.slice(0, 3).join(' · ')})
  if (markets?.length) facts.push({label: 'Markets', value: markets.slice(0, 3).join(' · ')})
  return facts
}

export function linkLabel(link: TruckLink): string | null {
  if (!link) return null
  return cleanText(link.truck?.title) || cleanText(link.name)
}

export function linkHref(link: TruckLink): string | null {
  const slug = cleanText(link?.truck?.slug)
  const manufacturer = cleanText(link?.truck?.manufacturerSlug)
  if (!slug || !manufacturer) return null
  return `/${manufacturer}/${slug}`
}

export function visibleLinks(
  links: Array<TruckLink | undefined> | null | undefined,
): Array<NonNullable<TruckLink>> {
  if (!Array.isArray(links)) return []
  return links.filter((link): link is NonNullable<TruckLink> => Boolean(link && linkLabel(link)))
}

export function hasRelatedTrucks(truck: TruckSpecData): boolean {
  return (
    visibleLinks([truck.predecessor]).length > 0 ||
    visibleLinks([truck.successor]).length > 0 ||
    visibleLinks(truck.siblings).length > 0
  )
}

export function contentFlags(truck: TruckSpecData): ContentFlags {
  const rows = specRows(truck)
  return {
    hasEngines: displayEngines(truck.engines).length > 0,
    hasSpecs: rows.some((row) => SPECIFICATION_LABELS.has(row.label)),
    hasRelated: hasRelatedTrucks(truck),
    hasSources: cleanSources(truck.sources).length > 0,
  }
}

export function hasSpecSheet(truck: TruckSpecData): boolean {
  return specRows(truck).length > 0 || displayEngines(truck.engines).length > 0
}

export function truckSortYear(truck: {
  productionStart?: number | null
  yearRange?: string | null
}): number {
  if (typeof truck.productionStart === 'number') return truck.productionStart
  const match = truck.yearRange?.match(/\d{4}/)
  return match ? Number(match[0]) : 9999
}

export function compareTrucksByYear<T extends {productionStart?: number | null; yearRange?: string | null; title: string}>(
  a: T,
  b: T,
): number {
  return truckSortYear(a) - truckSortYear(b) || a.title.localeCompare(b.title)
}
