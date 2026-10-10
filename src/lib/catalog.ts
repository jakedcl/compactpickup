import type { SanityImageValue } from '@/lib/sanityImage'

export type CatalogTruck = {
  id: string
  title: string
  href: string
  maker: string
  makerSlug: string
  years: string
  decades: number[]
  drives: string[]
  engines: string[]
  markets: string[]
  gears: string[]
  start: number | null
  end: number | null
  rank: {
    title: string
    maker: string
    years: string
    engine: string
    drive: string
    body: string
    names: string
    notes: string
  }
  image: SanityImageValue | null
  alt: string
}

export type TruckFilters = {
  q: string
  maker: string[]
  decade: string[]
  drive: string[]
  engine: string[]
  market: string[]
  gear: string[]
}

export const EMPTY_FILTERS: TruckFilters = {
  q: '',
  maker: [],
  decade: [],
  drive: [],
  engine: [],
  market: [],
  gear: [],
}

const DRIVE_ORDER = ['RWD', '4WD', 'AWD', 'FWD']
const DRIVE_WORDS: Record<string, string> = {
  '4WD': '4wd 4x4 four-wheel four wheel',
  RWD: 'rwd 2wd 4x2 rear-wheel',
  AWD: 'awd all-wheel all wheel',
  FWD: 'fwd front-wheel front wheel',
}
const ENGINE_ORDER = ['I4', 'I5', 'I6', 'V6', 'V8', 'H4', 'V4', 'Rotary', 'Diesel']
const MARKET_ORDER = ['US', 'Canada', 'Mexico', 'Japan', 'Europe', 'Australia / NZ', 'South America', 'Asia', 'Global']
const GEAR_ORDER = ['Manual', 'Automatic']

export function engineFamily(config: string): string | null {
  const value = config.toLowerCase()
  if (/wankel|rotary/.test(value)) return 'Rotary'
  if (/\bi4\b|inline-?4/.test(value)) return 'I4'
  if (/\bi5\b/.test(value)) return 'I5'
  if (/\bi6\b/.test(value)) return 'I6'
  if (/\bv6\b/.test(value)) return 'V6'
  if (/\bv8\b/.test(value)) return 'V8'
  if (/\bh4\b|flat-?4|boxer/.test(value)) return 'H4'
  if (/\bv4\b/.test(value)) return 'V4'
  if (/diesel/.test(value)) return 'Diesel'
  return null
}

export function driveFamily(value: string): string | null {
  const text = value.toLowerCase()
  if (/\bawd\b|all-wheel/.test(text)) return 'AWD'
  if (/\bfwd\b|front-wheel/.test(text)) return 'FWD'
  if (/prerunner/.test(text)) return 'RWD'
  if (/4wd|4x4|four-wheel|4-wheel/.test(text)) return '4WD'
  if (/\brwd\b|2wd|4x2|rear-wheel/.test(text)) return 'RWD'
  return null
}

export function gearFamily(value: string): string | null {
  const text = value.toLowerCase()
  if (/manual/.test(text)) return 'Manual'
  if (/automatic|\bauto\b|powerglide|hydra-matic|torqueflite|cruise-o-matic/.test(text)) return 'Automatic'
  if (/\d-speed/.test(text)) return 'Manual'
  return null
}

export function marketFamilies(value: string): string[] {
  const text = value.toLowerCase().replace(/not\s+u\.?s\.?/g, '')
  const found = new Set<string>()
  if (/north america/.test(text) || /\b(us|u\.s\.|united states)\b/.test(text)) found.add('US')
  if (/north america|canada/.test(text)) found.add('Canada')
  if (/mexico/.test(text)) found.add('Mexico')
  if (/japan/.test(text)) found.add('Japan')
  if (/\b(europe|uk|britain|spain|germany|turkey)\b/.test(text)) found.add('Europe')
  if (/australia|new zealand|\bnz\b/.test(text)) found.add('Australia / NZ')
  if (/brazil|argentina|chile|colombia|south america/.test(text)) found.add('South America')
  if (/thailand|india|china|iran|middle east/.test(text)) found.add('Asia')
  if (/\b(global|export|worldwide)\b/.test(text)) found.add('Global')
  return [...found]
}

export function decadesFor(start: number | null, end: number | null, now = new Date().getFullYear()): number[] {
  if (!start) return []
  const last = end && end >= start ? end : now
  const from = Math.floor(start / 10) * 10
  const to = Math.floor(last / 10) * 10
  const decades: number[] = []
  for (let decade = from; decade <= to; decade += 10) decades.push(decade)
  return decades
}

export function readFilters(params: URLSearchParams): TruckFilters {
  const list = (key: string) => (params.get(key) ?? '').split(',').map((item) => item.trim()).filter(Boolean)
  return {
    q: params.get('q') ?? '',
    maker: list('maker'),
    decade: list('decade'),
    drive: list('drive'),
    engine: list('engine'),
    market: list('market'),
    gear: list('gear'),
  }
}

export function filtersToQuery(filters: TruckFilters): string {
  const params = new URLSearchParams()
  const set = (key: string, values: string[]) => {
    if (values.length) params.set(key, values.join(','))
  }
  if (filters.q.trim()) params.set('q', filters.q.trim())
  set('maker', filters.maker)
  set('decade', filters.decade)
  set('drive', filters.drive)
  set('engine', filters.engine)
  set('market', filters.market)
  set('gear', filters.gear)
  const query = params.toString()
  return query ? `?${query}` : ''
}

export function filtersActive(filters: TruckFilters): boolean {
  return Boolean(
    filters.q.trim()
    || filters.maker.length
    || filters.decade.length
    || filters.drive.length
    || filters.engine.length
    || filters.market.length
    || filters.gear.length,
  )
}

function intersects(selected: string[], values: string[]): boolean {
  if (!selected.length) return true
  return selected.some((item) => values.includes(item))
}

export function foldSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function searchBlob(parts: Array<string | number | null | undefined>): string {
  const text = foldSearch(parts.filter((part) => part != null && String(part).trim() !== '').join(' '))
  if (!text) return ''
  const compact = text.replace(/ /g, '')
  return compact === text ? text : `${text} ${compact}`
}

export function driveSearchText(raw: Array<string | null | undefined>, families: string[]): string {
  return searchBlob([
    ...raw,
    ...families,
    ...families.map((family) => DRIVE_WORDS[family] ?? ''),
  ])
}

function yearToken(token: string): number | null {
  if (!/^\d{4}$/.test(token)) return null
  const year = Number(token)
  return year >= 1930 && year <= 2100 ? year : null
}

function coversYear(start: number | null, end: number | null, year: number): boolean {
  if (start == null) return false
  const last = end ?? start
  return year >= start && year <= last
}

const RANK_WEIGHT = {
  title: 100,
  maker: 80,
  year: 70,
  engine: 60,
  drive: 55,
  body: 40,
  names: 35,
  notes: 12,
} as const

function hit(haystack: string, token: string): boolean {
  return Boolean(haystack) && haystack.includes(token)
}

export function matchScore(truck: CatalogTruck, query: string): number {
  const tokens = foldSearch(query).split(' ').filter((token) => token.length > 1)
  if (!tokens.length) return 0
  let total = 0
  for (const token of tokens) {
    let best = 0
    const year = yearToken(token)
    if (hit(truck.rank.title, token)) best = Math.max(best, RANK_WEIGHT.title)
    if (hit(truck.rank.maker, token)) best = Math.max(best, RANK_WEIGHT.maker)
    if (year && coversYear(truck.start, truck.end, year)) best = Math.max(best, RANK_WEIGHT.year)
    if (hit(truck.rank.years, token)) best = Math.max(best, RANK_WEIGHT.year)
    if (hit(truck.rank.engine, token)) best = Math.max(best, RANK_WEIGHT.engine)
    if (hit(truck.rank.drive, token)) best = Math.max(best, RANK_WEIGHT.drive)
    if (hit(truck.rank.body, token)) best = Math.max(best, RANK_WEIGHT.body)
    if (hit(truck.rank.names, token)) best = Math.max(best, RANK_WEIGHT.names)
    if (hit(truck.rank.notes, token)) best = Math.max(best, RANK_WEIGHT.notes)
    if (!best) return 0
    total += best
  }
  const phrase = tokens.join(' ')
  if (phrase.length > 2 && truck.rank.title.includes(phrase)) total += 30
  if (truck.rank.title === phrase || truck.rank.maker === phrase) total += 40
  return total
}

export function truckMatches(truck: CatalogTruck, filters: TruckFilters): boolean {
  if (filters.q.trim() && matchScore(truck, filters.q) === 0) return false
  if (!intersects(filters.maker, [truck.makerSlug])) return false
  if (!intersects(filters.decade, truck.decades.map(String))) return false
  if (!intersects(filters.drive, truck.drives)) return false
  if (!intersects(filters.engine, truck.engines)) return false
  if (!intersects(filters.market, truck.markets)) return false
  if (!intersects(filters.gear, truck.gears)) return false
  return true
}

export function filterTrucks(trucks: CatalogTruck[], filters: TruckFilters): CatalogTruck[] {
  const matched = trucks.filter((truck) => truckMatches(truck, filters))
  const query = filters.q.trim()
  if (!query) return matched
  return matched
    .map((truck) => ({truck, score: matchScore(truck, query)}))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      const aStart = a.truck.start ?? 9999
      const bStart = b.truck.start ?? 9999
      if (aStart !== bStart) return aStart - bStart
      return a.truck.title.localeCompare(b.truck.title)
    })
    .map((item) => item.truck)
}

export type SearchSuggestion =
  | { kind: 'truck'; id: string; truck: CatalogTruck }
  | { kind: 'search'; id: string; query: string; label: string; detail: string }

function termHit(label: string, folded: string, aliases = ''): string | null {
  if (folded.length < 2) return null
  const foldedLabel = foldSearch(label)
  if (foldedLabel.startsWith(folded) || folded.startsWith(foldedLabel)) return label
  const alias = aliases.split(' ').find((word) => word.length > 1 && (word.startsWith(folded) || folded.startsWith(word)))
  return alias ?? null
}

export function searchSuggestions(trucks: CatalogTruck[], query: string, limit = 6): SearchSuggestion[] {
  const folded = foldSearch(query)
  if (folded.length < 2) return []
  const searches: SearchSuggestion[] = []
  const seen = new Set<string>()
  const addSearch = (id: string, label: string, searchQuery: string, detail: string) => {
    const key = foldSearch(searchQuery)
    if (!key || seen.has(key)) return
    seen.add(key)
    searches.push({ kind: 'search', id, query: searchQuery, label, detail })
  }

  const makers = new Map<string, string>()
  for (const truck of trucks) makers.set(truck.makerSlug, truck.maker)
  for (const [slug, name] of makers) {
    if (!termHit(name, folded)) continue
    addSearch(`maker-${slug}`, name, name, 'Make')
  }

  const choices = filterChoices(trucks)
  for (const drive of choices.drives) {
    const label = termHit(drive, folded, foldSearch(DRIVE_WORDS[drive] ?? ''))
    if (!label) continue
    addSearch(`drive-${drive}`, label === drive ? drive : label, label === drive ? drive : label, 'Drive')
  }
  for (const engine of choices.engines) {
    if (!termHit(engine, folded)) continue
    addSearch(`engine-${engine}`, engine, engine, 'Engine')
  }
  for (const decade of choices.decades) {
    if (folded.length < 3) continue
    const label = decadeLabel(decade)
    if (!termHit(label, folded) && !String(decade).startsWith(folded)) continue
    addSearch(`decade-${decade}`, label, String(decade), 'Years')
  }

  const searchHits = searches.slice(0, 2)
  const truckHits = filterTrucks(trucks, { ...EMPTY_FILTERS, q: query })
    .slice(0, Math.max(limit - searchHits.length, 4))
    .map((truck): SearchSuggestion => ({ kind: 'truck', id: truck.id, truck }))

  return [...truckHits, ...searchHits]
}

export function suggestionHref(suggestion: SearchSuggestion): string {
  if (suggestion.kind === 'truck') return suggestion.truck.href
  return `/browse${filtersToQuery({ ...EMPTY_FILTERS, q: suggestion.query })}`
}

function uniqueInOrder(values: string[], order: string[]): string[] {
  const present = new Set(values)
  const known = order.filter((item) => present.has(item))
  const extra = [...present].filter((item) => !order.includes(item)).sort()
  return [...known, ...extra]
}

export function filterChoices(trucks: CatalogTruck[]) {
  const makers = new Map<string, string>()
  for (const truck of trucks) makers.set(truck.makerSlug, truck.maker)
  const makerList = [...makers.entries()]
    .map(([slug, name]) => ({ slug, name }))
    .sort((a, b) => {
      if (a.slug === 'other') return 1
      if (b.slug === 'other') return -1
      return a.name.localeCompare(b.name)
    })

  return {
    makers: makerList,
    decades: uniqueInOrder(trucks.flatMap((truck) => truck.decades.map(String)), []).map(Number).sort((a, b) => a - b),
    drives: uniqueInOrder(trucks.flatMap((truck) => truck.drives), DRIVE_ORDER),
    engines: uniqueInOrder(trucks.flatMap((truck) => truck.engines), ENGINE_ORDER),
    markets: uniqueInOrder(trucks.flatMap((truck) => truck.markets), MARKET_ORDER),
    gears: uniqueInOrder(trucks.flatMap((truck) => truck.gears), GEAR_ORDER),
  }
}

export function decadeLabel(decade: number): string {
  return `${decade}s`
}
