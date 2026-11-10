import { PHOTO_ANGLES, type PhotoAngle, type PhotoStatus } from '@/lib/binder/types'

export type ReviewItem = {
  id: string
  sha256: string
  angle: PhotoAngle | null
  faceTagId: string | null
  status: PhotoStatus
  truckId: string | null
  truckSlug: string | null
}

export type ReviewChoice = {
  status: 'approved' | 'rejected'
  angle: PhotoAngle | null
  faceTagId: string | null
}

export type ReviewStep = {
  token: string
  kind: 'skip' | 'choice'
  id: string
  index: number
  before: { angle: PhotoAngle | null; faceTagId: string | null; status: PhotoStatus; truckId: string | null; truckSlug: string | null }
  after: ReviewChoice | null
  save: 'pending' | 'saved' | 'failed'
  error: string | null
}

export type FingerprintState = 'waiting' | 'running' | 'done' | 'failed' | 'dropped'

export type FingerprintJob = {
  id: string
  sha256: string
  state: FingerprintState
  error: string | null
  /** Bumps when the same photo is queued again, so a late result cannot clear the new job. */
  generation: number
}

export type ReviewWrite = {
  token: string
  id: string
  status: PhotoStatus
  angle: PhotoAngle | null
  faceTagId: string | null
  error: string
}

export type ReviewSession = {
  items: ReviewItem[]
  index: number
  steps: ReviewStep[]
  retries: ReviewWrite[]
  total: number
}

const FACE_LETTERS = 'bcdefghijklmnopqtvw'

export function angleShortcut(angle: PhotoAngle): string {
  return String(PHOTO_ANGLES.indexOf(angle) + 1)
}

export function faceShortcut(index: number): string | null {
  return FACE_LETTERS[index] ?? null
}

export function createReviewSession(items: ReviewItem[], total: number): ReviewSession {
  return { items: items.map((item) => ({ ...item })), index: 0, steps: [], retries: [], total: Math.max(total, items.length) }
}

export function currentItem(session: ReviewSession): ReviewItem | null {
  return session.items[session.index] ?? null
}

export function remainingCount(session: ReviewSession): number {
  return Math.max(0, session.total - session.index)
}

export function prefetchItems(session: ReviewSession, count = 3): ReviewItem[] {
  return session.items.slice(session.index + 1, session.index + 1 + count)
}

export function appendItems(session: ReviewSession, items: ReviewItem[], total: number): ReviewSession {
  const seen = new Set(session.items.map((item) => item.id))
  const extra = items.filter((item) => !seen.has(item.id)).map((item) => ({ ...item }))
  const totalNext = Math.max(session.total, total, session.items.length + extra.length)
  if (extra.length === 0 && totalNext === session.total) return session
  return {
    ...session,
    items: [...session.items, ...extra],
    total: totalNext,
  }
}

function snapshot(item: ReviewItem): ReviewStep['before'] {
  return {
    angle: item.angle,
    faceTagId: item.faceTagId,
    status: item.status,
    truckId: item.truckId,
    truckSlug: item.truckSlug,
  }
}

export function canApprove(item: ReviewItem): boolean {
  return Boolean(item.truckId)
}

export function choose(session: ReviewSession, choice: ReviewChoice, token: string): ReviewSession {
  const item = currentItem(session)
  if (!item) return session
  if (choice.status === 'approved' && !canApprove(item)) return session
  const step: ReviewStep = {
    token,
    kind: 'choice',
    id: item.id,
    index: session.index,
    before: snapshot(item),
    after: choice,
    save: 'pending',
    error: null,
  }
  const items = session.items.map((entry, index) =>
    index === session.index ? { ...entry, angle: choice.angle, faceTagId: choice.faceTagId, status: choice.status } : entry,
  )
  return { ...session, items, index: session.index + 1, steps: [...session.steps, step] }
}

export function skip(session: ReviewSession, token: string): ReviewSession {
  const item = currentItem(session)
  if (!item) return session
  const step: ReviewStep = {
    token,
    kind: 'skip',
    id: item.id,
    index: session.index,
    before: snapshot(item),
    after: null,
    save: 'saved',
    error: null,
  }
  return { ...session, index: session.index + 1, steps: [...session.steps, step] }
}

export function undo(session: ReviewSession): { session: ReviewSession; step: ReviewStep | null } {
  const step = session.steps.at(-1)
  if (!step) return { session, step: null }
  const items = session.items.map((item) =>
    item.id === step.id
      ? {
          ...item,
          angle: step.before.angle,
          faceTagId: step.before.faceTagId,
          status: step.before.status,
          truckId: step.before.truckId,
          truckSlug: step.before.truckSlug,
        }
      : item,
  )
  return {
    session: {
      ...session,
      items,
      index: step.index,
      steps: session.steps.slice(0, -1),
      retries: session.retries.filter((item) => item.id !== step.id),
    },
    step,
  }
}

export function noteSave(session: ReviewSession, token: string, save: 'saved' | 'failed', error?: string): ReviewSession {
  return {
    ...session,
    steps: session.steps.map((step) =>
      step.token === token && step.kind === 'choice' ? { ...step, save, error: error ?? null } : step,
    ),
  }
}

export function failedSaves(session: ReviewSession): ReviewStep[] {
  return session.steps.filter((step) => step.kind === 'choice' && step.save === 'failed')
}

/** One retry per photo. A newer save replaces whatever was waiting for that photo. */
export function rememberRetry(session: ReviewSession, write: ReviewWrite): ReviewSession {
  return { ...session, retries: [...session.retries.filter((item) => item.id !== write.id), write] }
}

export function clearPhotoRetries(session: ReviewSession, id: string): ReviewSession {
  return { ...session, retries: session.retries.filter((item) => item.id !== id) }
}

export function forgetRetry(session: ReviewSession, token: string): ReviewSession {
  const match = session.retries.find((item) => item.token === token)
  if (!match) return session
  return clearPhotoRetries(session, match.id)
}

/** The server did not store this fingerprint. Undo hides it. Any other refusal stays visible for retry. */
export function refusedFingerprint(undone: boolean): 'dropped' | 'failed' {
  return undone ? 'dropped' : 'failed'
}

export function retarget(
  session: ReviewSession,
  id: string,
  truck: { truckId: string; truckSlug: string },
  keepFace: boolean,
): ReviewSession {
  return {
    ...session,
    items: session.items.map((item) =>
      item.id === id
        ? { ...item, truckId: truck.truckId, truckSlug: truck.truckSlug, faceTagId: keepFace ? item.faceTagId : null }
        : item,
    ),
  }
}

export function enqueueJob(jobs: FingerprintJob[], item: { id: string; sha256: string }): FingerprintJob[] {
  const existing = jobs.find((job) => job.id === item.id)
  if (existing && (existing.state === 'waiting' || existing.state === 'running')) return jobs
  const next: FingerprintJob = {
    id: item.id,
    sha256: item.sha256,
    state: 'waiting',
    error: null,
    generation: (existing?.generation ?? 0) + 1,
  }
  if (!existing) return [...jobs, next]
  return jobs.map((job) => (job.id === item.id ? next : job))
}

/** Drop a job that has not finished. A running job is marked dropped so its result is not saved. */
export function dropJob(jobs: FingerprintJob[], id: string): FingerprintJob[] {
  const job = jobs.find((item) => item.id === id)
  if (!job || job.state === 'done') return jobs
  if (job.state === 'running') return jobs.map((item) => (item.id === id ? { ...item, state: 'dropped' } : item))
  return jobs.filter((item) => item.id !== id)
}

/** Claim the next waiting job. A second call returns nothing while one is running. */
export function claimJob(jobs: FingerprintJob[]): { jobs: FingerprintJob[]; job: FingerprintJob | null } {
  if (jobs.some((job) => job.state === 'running')) return { jobs, job: null }
  const waiting = jobs.find((job) => job.state === 'waiting')
  if (!waiting) return { jobs, job: null }
  const job: FingerprintJob = { ...waiting, state: 'running', error: null }
  return { jobs: jobs.map((item) => (item.id === job.id ? job : item)), job }
}

export function settleJob(
  jobs: FingerprintJob[],
  id: string,
  state: 'done' | 'failed' | 'dropped',
  error?: string,
  generation?: number,
): FingerprintJob[] {
  return jobs.flatMap((job) => {
    if (job.id !== id) return [job]
    if (generation !== undefined && job.generation !== generation) return [job]
    if (state === 'dropped') return []
    return [{ ...job, state, error: error ?? null }]
  })
}

export function retryFailedJobs(jobs: FingerprintJob[]): FingerprintJob[] {
  return jobs.map((job) => (job.state === 'failed' ? { ...job, state: 'waiting', error: null } : job))
}

export function jobCounts(jobs: FingerprintJob[]): { waiting: number; running: number; done: number; failed: number } {
  return {
    waiting: jobs.filter((job) => job.state === 'waiting').length,
    running: jobs.filter((job) => job.state === 'running').length,
    done: jobs.filter((job) => job.state === 'done').length,
    failed: jobs.filter((job) => job.state === 'failed').length,
  }
}

export function queueBusy(jobs: FingerprintJob[]): boolean {
  return jobs.some((job) => job.state === 'waiting' || job.state === 'running' || job.state === 'failed')
}
