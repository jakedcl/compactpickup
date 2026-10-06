import 'server-only'
import { unstable_cache } from 'next/cache'
import { sanityImageFields } from '@/lib/sanity'
import { client } from '@/lib/sanityClient'
import type { SanityImageValue } from '@/lib/sanityImage'
import {
  decadesFor,
  driveFamily,
  driveSearchText,
  engineFamily,
  gearFamily,
  marketFamilies,
  searchBlob,
  type CatalogTruck,
} from '@/lib/catalog'

type RawEngine = {
  name?: string | null
  config?: string | null
  displacement?: string | null
  years?: string | null
  hp?: number | null
  torque?: string | null
  notes?: string | null
}
type RawImage = SanityImageValue & { alt?: string | null }
type RawLink = { name?: string | null; relation?: string | null; title?: string | null }

type RawTruck = {
  _id: string
  title: string
  slug: string
  displayTitle?: string | null
  nameplate?: string | null
  generation?: string | null
  yearRange?: string | null
  originalYearRange?: string | null
  productionStart?: number | null
  productionEnd?: number | null
  productionNotes?: string | null
  internalCodes?: string[] | null
  markets?: string[] | null
  assemblyPlants?: string[] | null
  bodyStyles?: string[] | null
  bedLengths?: string[] | null
  trims?: string[] | null
  drivetrains?: string[] | null
  transmissions?: string[] | null
  engines?: RawEngine[] | null
  predecessor?: RawLink | null
  successor?: RawLink | null
  siblings?: Array<RawLink | null> | null
  summary?: string | null
  notableFeatures?: string[] | null
  history?: string[] | null
  maker?: { name?: string | null; slug?: string | null } | null
  image?: RawImage | null
}

const catalogQuery = `*[_type == "truckModel" && defined(slug.current) && defined(manufacturer)] | order(productionStart asc, title asc) {
  _id,
  title,
  "slug": slug.current,
  displayTitle,
  nameplate,
  generation,
  yearRange,
  productionStart,
  productionEnd,
  originalYearRange,
  internalCodes,
  markets,
  assemblyPlants,
  bodyStyles,
  bedLengths,
  trims,
  drivetrains,
  transmissions,
  productionNotes,
  summary,
  notableFeatures,
  history,
  "engines": engines[]{name, config, displacement, years, hp, torque, notes},
  "predecessor": predecessor{name, relation, "title": truck->title},
  "successor": successor{name, relation, "title": truck->title},
  "siblings": siblings[]{name, relation, "title": truck->title},
  "maker": manufacturer->{name, "slug": slug.current},
  "image": content[_type == "image"][0]{
    alt,
    ${sanityImageFields}
  }
}`

function clean(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

function unique(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function yearsFromText(text: string): {start: number | null; end: number | null} {
  const nums = [...text.matchAll(/\b\d{4}\b/g)]
    .map((match) => Number(match[0]))
    .filter((year) => year >= 1930 && year <= 2100)
  if (!nums.length) return {start: null, end: null}
  return {start: Math.min(...nums), end: Math.max(...nums)}
}

function linkBits(link: RawLink | null | undefined): Array<string | null | undefined> {
  if (!link) return []
  return [link.name, link.relation, link.title]
}

function toCatalogTruck(truck: RawTruck): CatalogTruck | null {
  const maker = clean(truck.maker?.name)
  const makerSlug = clean(truck.maker?.slug)
  if (!maker || !makerSlug || !truck.slug) return null

  const parsedYears = yearsFromText(`${clean(truck.yearRange)} ${clean(truck.originalYearRange)}`)
  const start = typeof truck.productionStart === 'number' ? truck.productionStart : parsedYears.start
  const rawEnd = typeof truck.productionEnd === 'number' ? truck.productionEnd : parsedYears.end
  const end = rawEnd ?? (start ? new Date().getFullYear() : null)
  const years = clean(truck.yearRange) || (start ? `${start}–${rawEnd ?? 'now'}` : '')
  const drives = unique((truck.drivetrains ?? []).map((item) => driveFamily(item ?? '')))
  const engines = unique((truck.engines ?? []).map((engine) => engineFamily(engine.config ?? '')))
  const gears = unique((truck.transmissions ?? []).map((item) => gearFamily(item ?? '')))
  const markets = unique((truck.markets ?? []).flatMap((item) => marketFamilies(item ?? '')))
  const related = [truck.predecessor, truck.successor, ...(truck.siblings ?? [])].flatMap((link) => linkBits(link))
  const rank = {
    title: searchBlob([truck.title, truck.displayTitle, truck.generation]),
    maker: searchBlob([maker, truck.maker?.slug]),
    years: searchBlob([years, truck.originalYearRange, start, rawEnd]),
    engine: searchBlob((truck.engines ?? []).flatMap((engine) => [
      engine.name,
      engine.config,
      engine.displacement,
      engine.years,
      engine.hp,
      engine.torque,
      engineFamily(engine.config ?? ''),
    ])),
    drive: driveSearchText([...(truck.drivetrains ?? []), ...(truck.transmissions ?? [])], [...drives, ...gears]),
    body: searchBlob([...(truck.bodyStyles ?? []), ...(truck.bedLengths ?? [])]),
    names: searchBlob([
      truck.nameplate,
      ...(truck.internalCodes ?? []),
      ...(truck.trims ?? []),
      ...related,
    ]),
    notes: searchBlob([
      truck.productionNotes,
      truck.summary,
      ...(truck.notableFeatures ?? []),
      ...(truck.history ?? []),
      ...(truck.assemblyPlants ?? []),
      ...(truck.markets ?? []),
      ...markets,
      ...(truck.engines ?? []).map((engine) => engine.notes),
    ]),
  }

  const image = truck.image?.asset?._ref ? truck.image : null

  return {
    id: truck._id,
    title: truck.title,
    href: `/${makerSlug}/${truck.slug}`,
    maker,
    makerSlug,
    years,
    decades: decadesFor(start, rawEnd),
    drives,
    engines,
    markets,
    gears,
    start,
    end,
    rank,
    image,
    alt: clean(image?.alt) || `${maker} ${truck.title}`,
  }
}

async function loadCatalog(): Promise<CatalogTruck[]> {
  const rows = await client.fetch<RawTruck[]>(catalogQuery)
  return (rows ?? []).map(toCatalogTruck).filter((truck): truck is CatalogTruck => truck !== null)
}

export const getCatalog = unstable_cache(loadCatalog, ['truck-catalog-fields'], { revalidate: 3600 })
