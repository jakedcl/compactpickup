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
  search: string
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

export function truckMatches(truck: CatalogTruck, filters: TruckFilters): boolean {
  const tokens = filters.q.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.some((token) => !truck.search.includes(token))) return false
  if (!intersects(filters.maker, [truck.makerSlug])) return false
  if (!intersects(filters.decade, truck.decades.map(String))) return false
  if (!intersects(filters.drive, truck.drives)) return false
  if (!intersects(filters.engine, truck.engines)) return false
  if (!intersects(filters.market, truck.markets)) return false
  if (!intersects(filters.gear, truck.gears)) return false
  return true
}

export function filterTrucks(trucks: CatalogTruck[], filters: TruckFilters): CatalogTruck[] {
  return trucks.filter((truck) => truckMatches(truck, filters))
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
