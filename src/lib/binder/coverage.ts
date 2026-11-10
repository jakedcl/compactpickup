/** Approved photos the shooting list aims for before a truck drops down the list. */
export const APPROVED_TARGET = 10

export type CoverageFace = {
  id: string
  label: string
  approved: number
}

export type CoverageTruck = {
  truckId: string
  slug: string
  title: string
  maker: string
  approved: number
  fingerprinted: number
  front: number
  side: number
  faces: CoverageFace[]
}

export type CoverageRow = CoverageTruck & {
  score: number
  needsFront: boolean
  needsSide: boolean
  missingFaces: string[]
  caughtUp: boolean
}

export function scoreCoverage(truck: CoverageTruck): CoverageRow {
  const needsFront = truck.front < 1
  const needsSide = truck.side < 1
  const missingFaces = truck.faces.filter((face) => face.approved < 1).map((face) => face.label)
  const short = Math.max(0, APPROVED_TARGET - truck.approved)
  const score = (needsFront ? 100 : 0) + (needsSide ? 100 : 0) + missingFaces.length * 40 + short * 5
  return {
    ...truck,
    score,
    needsFront,
    needsSide,
    missingFaces,
    caughtUp: score === 0,
  }
}

/** Neediest first. A full truck (front, side, every face, and the target count) sinks to the bottom. */
export function sortCoverage(trucks: CoverageTruck[]): CoverageRow[] {
  return trucks.map(scoreCoverage).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.approved !== b.approved) return a.approved - b.approved
    return a.title.localeCompare(b.title)
  })
}
