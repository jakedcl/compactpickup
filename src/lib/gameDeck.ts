import type { SanityImageValue } from '@/lib/sanityImage'

export const ROUND = 10
export const SECONDS = 15
export const BEST_STREAK_KEY = 'cp-best-streak'

export type GameStill = SanityImageValue & {
  truckTitle: string
  manufacturerName: string
  truckSlug?: string
  manufacturerSlug?: string
  yearRange?: string | null
}

type TruckWithImages = {
  images?: Array<GameStill | null> | null
}

export function daySeed(date = new Date()): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
}

export function seededShuffle<T>(items: T[], seed: number): T[] {
  const copy = [...items]
  let state = seed >>> 0 || 1
  const rand = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0
    return state / 4294967296
  }
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    const swap = copy[i]
    copy[i] = copy[j]
    copy[j] = swap
  }
  return copy
}

export function buildDeck(trucks: TruckWithImages[] | null | undefined, seed = daySeed()): GameStill[] {
  const seen = new Set<string>()
  const stills: GameStill[] = []
  for (const truck of trucks ?? []) {
    for (const image of truck.images ?? []) {
      if (!image?.asset?._ref || !image.truckTitle) continue
      const key = `${image.manufacturerSlug ?? image.manufacturerName}/${image.truckSlug ?? image.truckTitle}`
      if (seen.has(key)) continue
      seen.add(key)
      stills.push(image)
    }
  }
  stills.sort((a, b) => {
    const aKey = `${a.manufacturerSlug ?? ''}/${a.truckSlug ?? a.truckTitle}`
    const bKey = `${b.manufacturerSlug ?? ''}/${b.truckSlug ?? b.truckTitle}`
    return aKey.localeCompare(bKey)
  })
  return seededShuffle(stills, seed)
}

export function choicesFor(stills: GameStill[], index: number): { correct: string; choices: string[] } | null {
  const current = stills[index]
  if (!current || stills.length < 4) return null
  const correct = current.truckTitle
  const same = stills
    .filter((image, i) => i !== index && image.manufacturerName === current.manufacturerName && image.truckTitle !== correct)
    .map((image) => image.truckTitle)
  const other = stills
    .filter((image, i) => i !== index && image.manufacturerName !== current.manufacturerName && image.truckTitle !== correct)
    .map((image) => image.truckTitle)
  const pool = [...new Set([...same, ...other])].filter((choice) => choice !== correct)
  const wrong = pool.sort(() => Math.random() - 0.5).slice(0, 3)
  if (!wrong.length) return null
  const choices = [...new Set([correct, ...wrong])].sort(() => Math.random() - 0.5)
  return { correct, choices }
}

export function readBestStreak(): number {
  try {
    const value = Number(localStorage.getItem(BEST_STREAK_KEY))
    return Number.isFinite(value) && value > 0 ? value : 0
  } catch {
    return 0
  }
}

export function writeBestStreak(value: number): void {
  try {
    localStorage.setItem(BEST_STREAK_KEY, String(value))
  } catch {
    // Private browsing can block storage. The round still plays.
  }
}
