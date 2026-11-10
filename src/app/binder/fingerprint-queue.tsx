'use client'

import { useEffect, useRef, useState } from 'react'
import { binderApi, BinderApiError } from '@/app/binder/api'
import type { ClipProgress } from '@/lib/clip/browser'
import { photoImagePath } from '@/lib/binder/review'
import {
  claimJob,
  dropJob,
  enqueueJob,
  jobCounts,
  queueBusy,
  refusedFingerprint,
  retryFailedJobs,
  settleJob,
  type FingerprintJob,
} from '@/lib/binder/review-session'

type EmbedResult = { updated: string[]; skipped: string[] }

function messageFrom(error: unknown, fallback: string) {
  return error instanceof BinderApiError || error instanceof Error ? error.message : fallback
}

export function useFingerprintRunner() {
  const [jobs, setJobs] = useState<FingerprintJob[]>([])
  const [modelPercent, setModelPercent] = useState<number | null>(null)
  const [photoPercent, setPhotoPercent] = useState<number | null>(null)
  const jobsRef = useRef(jobs)
  const lock = useRef(false)
  const cancelledGen = useRef(new Map<string, number>())

  function publish(next: FingerprintJob[]) {
    jobsRef.current = next
    setJobs(next)
  }

  function enqueue(item: { id: string; sha256: string }) {
    const existing = jobsRef.current.find((job) => job.id === item.id)
    if (!existing || (existing.state !== 'waiting' && existing.state !== 'running')) {
      cancelledGen.current.delete(item.id)
    }
    publish(enqueueJob(jobsRef.current, item))
  }

  function enqueueMany(items: { id: string; sha256: string }[]) {
    let next = jobsRef.current
    for (const item of items) {
      const existing = next.find((job) => job.id === item.id)
      if (!existing || (existing.state !== 'waiting' && existing.state !== 'running')) {
        cancelledGen.current.delete(item.id)
      }
      next = enqueueJob(next, item)
    }
    publish(next)
  }

  function drop(id: string) {
    const job = jobsRef.current.find((item) => item.id === id)
    if (job) cancelledGen.current.set(id, job.generation)
    publish(dropJob(jobsRef.current, id))
  }

  function retry() {
    publish(retryFailedJobs(jobsRef.current))
  }

  async function catchUp() {
    const found: { id: string; sha256: string }[] = []
    let cursor: string | null = null
    do {
      const params = new URLSearchParams({ status: 'approved', limit: '48', missingEmbedding: '1' })
      if (cursor) params.set('cursor', cursor)
      const page = await binderApi<{ photos: { id: string; sha256: string }[]; nextCursor: string | null }>(
        `/api/admin/photos?${params}`,
      )
      for (const photo of page.photos) found.push({ id: photo.id, sha256: photo.sha256 })
      cursor = page.nextCursor
    } while (cursor && found.length < 5000)
    enqueueMany(found)
    return found.length
  }

  useEffect(() => {
    if (!queueBusy(jobs)) return
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [jobs])

  useEffect(() => {
    if (lock.current) return
    const claimed = claimJob(jobs)
    if (!claimed.job) return
    lock.current = true
    const job = claimed.job
    jobsRef.current = claimed.jobs
    setJobs(claimed.jobs)

    function abandoned() {
      if (cancelledGen.current.get(job.id) === job.generation) return true
      const live = jobsRef.current.find((item) => item.id === job.id)
      return !live || live.generation !== job.generation || live.state === 'dropped'
    }

    function finish(state: 'done' | 'failed' | 'dropped', error?: string) {
      const next = settleJob(jobsRef.current, job.id, state, error, job.generation)
      jobsRef.current = next
      setJobs(next)
    }

    void (async () => {
      try {
        if (abandoned()) {
          finish('dropped')
          return
        }
        const response = await fetch(photoImagePath(job.id, job.sha256))
        if (!response.ok) throw new Error('A photo did not load for fingerprinting.')
        const blob = await response.blob()
        if (abandoned()) {
          finish('dropped')
          return
        }
        const { embedImage } = await import('@/lib/clip/browser')
        setPhotoPercent(null)
        const vector = await embedImage(blob, (update: ClipProgress) => {
          if (typeof update.progress === 'number') {
            const percent = Math.round(Math.max(0, Math.min(100, update.progress)))
            setModelPercent(percent)
            setPhotoPercent(percent)
          }
          if (update.status === 'done' || update.status === 'ready') setModelPercent(100)
        })
        if (abandoned()) {
          finish('dropped')
          return
        }
        const saved = await binderApi<EmbedResult>('/api/admin/photos/embeddings', {
          method: 'POST',
          body: JSON.stringify({ items: [{ id: job.id, embedding: Array.from(vector) }] }),
        })
        if (abandoned()) {
          finish(refusedFingerprint(true))
          return
        }
        if (saved.skipped.includes(job.id)) {
          finish(refusedFingerprint(false), 'The fingerprint was not saved.')
          return
        }
        setPhotoPercent(null)
        finish('done')
      } catch (error) {
        if (abandoned()) {
          finish('dropped')
          return
        }
        finish('failed', messageFrom(error, 'The fingerprint did not save.'))
      } finally {
        lock.current = false
        setJobs((current) => {
          jobsRef.current = current
          return current.slice()
        })
      }
    })()
  }, [jobs])

  const counts = jobCounts(jobs)
  const running = jobs.find((job) => job.state === 'running') ?? null
  const failed = jobs.find((job) => job.state === 'failed' && job.error) ?? null
  return {
    jobs,
    counts,
    running,
    failed,
    modelPercent,
    photoPercent,
    busy: queueBusy(jobs),
    enqueue,
    drop,
    retry,
    catchUp,
  }
}

export type FingerprintRunner = ReturnType<typeof useFingerprintRunner>

export function FingerprintPanel({
  runner,
  variant = 'dock',
}: {
  runner: FingerprintRunner
  variant?: 'dock' | 'review'
}) {
  const [open, setOpen] = useState(false)
  const [catching, setCatching] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const { counts, running, failed, modelPercent, photoPercent } = runner
  const modelLine =
    modelPercent === null ? null : modelPercent >= 100 ? null : `Model ${modelPercent}%`

  async function catchUp() {
    if (catching) return
    if (!window.confirm('Finish missing fingerprints? This does not approve anything.')) return
    setCatching(true)
    setNote(null)
    try {
      const count = await runner.catchUp()
      setNote(count === 0 ? 'Every approved photo already has a fingerprint.' : `Queued ${count}.`)
    } catch (error) {
      setNote(messageFrom(error, 'The fingerprint list did not load.'))
    } finally {
      setCatching(false)
    }
  }

  if (variant === 'review') {
    return (
      <aside className="fp-panel fp-review" aria-label="Fingerprints">
        <p className="fp-strip">
          Fingerprints
          <span className="review-key">
            {counts.waiting} waiting · {counts.done} done · {counts.failed} failed
            {modelLine ? ` · ${modelLine}` : ''}
            {running ? ' · fingerprinting' : ''}
          </span>
        </p>
        <div className="fp-strip-actions">
          <button type="button" className="btn" onClick={() => runner.retry()} disabled={counts.failed === 0}>
            Retry
          </button>
          <button type="button" className="btn" onClick={() => void catchUp()} disabled={catching} aria-label="Finish missing fingerprints">
            {catching ? 'Looking' : 'Finish'}
          </button>
        </div>
        {failed?.error ? <p className="fp-strip">{failed.error}</p> : null}
        {note ? <p className="fp-strip">{note}</p> : null}
      </aside>
    )
  }

  return (
    <aside className={open ? 'fp-panel is-open' : 'fp-panel'} aria-label="Fingerprints">
      <button type="button" className="fp-toggle btn" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span>
          Fingerprints
          <span className="review-key">
            {counts.waiting} waiting · {counts.done} done · {counts.failed} failed
            {modelLine ? ` · ${modelLine}` : ''}
          </span>
        </span>
      </button>
      <div className="fp-body">
        {modelLine ? <p role="status">{modelLine}. This download happens once.</p> : null}
        <p>
          {counts.waiting} waiting · {counts.done} done · {counts.failed} failed
        </p>
        {running ? (
          <div className="fp-current">
            {/* Private bytes. next/image would send them through the paid optimizer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoImagePath(running.id, running.sha256, 'thumb')} alt="" />
            <p role="status">
              {photoPercent !== null && modelPercent !== null && modelPercent < 100
                ? `Downloading the model ${modelPercent}%`
                : 'Fingerprinting'}
            </p>
          </div>
        ) : (
          <p>No photo is fingerprinting right now.</p>
        )}
        {failed?.error ? (
          <p className="binder-note is-bad" role="alert">
            {failed.error}
          </p>
        ) : null}
        {note ? <p role="status">{note}</p> : null}
        <div className="binder-detail-actions">
          <button type="button" className="btn" onClick={() => runner.retry()} disabled={counts.failed === 0}>
            Retry failed
          </button>
          <button type="button" className="btn" onClick={() => void catchUp()} disabled={catching}>
            {catching ? 'Looking' : 'Finish missing fingerprints'}
          </button>
        </div>
      </div>
    </aside>
  )
}
