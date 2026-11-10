'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { binderApi, BinderApiError } from '@/app/binder/api'
import { FingerprintPanel, type FingerprintRunner } from '@/app/binder/fingerprint-queue'
import { photoImagePath, type ReviewDecision, type ReviewFace, type ReviewPhoto, type ReviewTruck } from '@/lib/binder/review'
import {
  angleShortcut,
  appendItems,
  choose,
  createReviewSession,
  currentItem,
  faceShortcut,
  forgetRetry,
  noteSave,
  prefetchItems,
  rememberRetry,
  remainingCount,
  retarget,
  skip,
  undo,
  type ReviewItem,
  type ReviewSession,
  type ReviewWrite,
} from '@/lib/binder/review-session'
import { PHOTO_ANGLES, type PhotoAngle } from '@/lib/binder/types'

const ANGLE_LABEL: Record<PhotoAngle, string> = {
  front: 'Front',
  'front-3q': 'Three-quarter front',
  side: 'Side',
  'rear-3q': 'Three-quarter rear',
  rear: 'Rear',
  other: 'Other',
}

function messageFrom(error: unknown, fallback: string) {
  return error instanceof BinderApiError || error instanceof Error ? error.message : fallback
}

function toItem(photo: ReviewPhoto): ReviewItem {
  return {
    id: photo.id,
    sha256: photo.sha256,
    angle: photo.angle,
    faceTagId: photo.faceTagId,
    status: photo.status,
    truckId: photo.truckId,
    truckSlug: photo.truckSlug,
  }
}

export function useReviewSaves() {
  const [box, setBox] = useState<ReviewSession>(() => createReviewSession([], 0))
  const boxRef = useRef(box)
  const chains = useRef(new Map<string, Promise<void>>())
  const cancelled = useRef(new Set<string>())

  useEffect(() => {
    boxRef.current = box
  }, [box])

  const send = useCallback((body: ReviewDecision, token: string) => {
    const task = async () => {
      if (cancelled.current.has(token)) return
      try {
        await binderApi('/api/admin/photos/review', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        if (cancelled.current.has(token)) return
        setBox((current) => forgetRetry(noteSave(current, token, 'saved'), token))
      } catch (error) {
        if (cancelled.current.has(token)) return
        const message = messageFrom(error, 'The photo was not updated.')
        const write: ReviewWrite = {
          token,
          id: body.id,
          status: body.status,
          angle: body.angle,
          faceTagId: body.faceTagId,
          error: message,
        }
        setBox((current) => rememberRetry(noteSave(current, token, 'failed', message), write))
      }
    }
    const prev = chains.current.get(body.id) ?? Promise.resolve()
    const next = prev.then(task, task)
    chains.current.set(
      body.id,
      next.then(
        () => undefined,
        () => undefined,
      ),
    )
  }, [])

  const cancel = useCallback((token: string) => {
    cancelled.current.add(token)
    setBox((current) => forgetRetry(current, token))
  }, [])

  const retryAll = useCallback(() => {
    for (const write of boxRef.current.retries) {
      send(
        { id: write.id, status: write.status, angle: write.angle, faceTagId: write.faceTagId },
        write.token,
      )
    }
  }, [send])

  return { retries: box.retries, send, cancel, retryAll }
}

export type ReviewSaves = ReturnType<typeof useReviewSaves>

function truckTitle(trucks: ReviewTruck[], item: ReviewItem) {
  const truck = trucks.find((entry) => entry.id === item.truckId)
  if (!truck) return item.truckSlug
  return truck.maker ? `${truck.maker} ${truck.title}` : truck.title
}

export function ReviewMode({
  photos,
  matched,
  cursor,
  loading,
  listError,
  trucks,
  faces,
  runner,
  saves,
  onLoadMore,
  onClose,
}: {
  photos: ReviewPhoto[]
  matched: number
  cursor: string | null
  loading: boolean
  listError: string | null
  trucks: ReviewTruck[]
  faces: ReviewFace[]
  runner: FingerprintRunner
  saves: ReviewSaves
  onLoadMore: () => void
  onClose: () => void
}) {
  const total = matched > 0 ? Math.max(matched, photos.length) : photos.length
  const [session, setSession] = useState<ReviewSession>(() => createReviewSession(photos.map(toItem), total))
  const opened = photos[0]
  const [angle, setAngle] = useState<PhotoAngle | null>(opened?.angle ?? null)
  const [faceId, setFaceId] = useState<string | null>(opened?.faceTagId ?? null)
  const [trackedId, setTrackedId] = useState<string | null>(opened?.id ?? null)
  const [wrong, setWrong] = useState(false)
  const [truckBusy, setTruckBusy] = useState(false)
  const [truckError, setTruckError] = useState<string | null>(null)
  const acted = useRef<string | null>(null)
  const asked = useRef<string | null>(null)
  const seq = useRef(0)
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    setSession((current) => appendItems(current, photos.map(toItem), total))
  }, [photos, total])

  const photo = currentItem(session)
  const visibleId = photo?.id ?? null
  if (visibleId !== trackedId) {
    setTrackedId(visibleId)
    setAngle(photo?.angle ?? null)
    setFaceId(photo?.faceTagId ?? null)
    setWrong(false)
    setTruckError(null)
  }
  const truckFaces = useMemo(
    () => (photo ? faces.filter((face) => face.truckId === photo.truckId) : []),
    [faces, photo],
  )

  useEffect(() => {
    closeRef.current?.focus()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    for (const item of prefetchItems(session)) {
      const img = new Image()
      img.src = photoImagePath(item.id, item.sha256)
    }
  }, [session])

  useEffect(() => {
    if (!cursor || loading) return
    if (session.items.length === 0) return
    if (session.index <= session.items.length - 4) return
    if (asked.current === cursor) return
    asked.current = cursor
    onLoadMore()
  }, [cursor, loading, onLoadMore, session.index, session.items.length])

  const nextToken = useCallback(() => {
    seq.current += 1
    return `review-${seq.current}`
  }, [])

  const act = useCallback((status: 'approved' | 'rejected') => {
    const current = currentItem(session)
    if (!current || acted.current === current.id) return
    acted.current = current.id
    const token = nextToken()
    setSession((existing) => choose(existing, { status, angle, faceTagId: faceId }, token))
    if (status === 'approved') runner.enqueue({ id: current.id, sha256: current.sha256 })
    saves.send({ id: current.id, status, angle, faceTagId: faceId }, token)
  }, [angle, faceId, nextToken, runner, saves, session])

  const skipPhoto = useCallback(() => {
    const current = currentItem(session)
    if (!current || acted.current === current.id) return
    acted.current = current.id
    const token = nextToken()
    setSession((existing) => skip(existing, token))
  }, [nextToken, session])

  const undoLast = useCallback(() => {
    const result = undo(session)
    if (!result.step) return
    acted.current = null
    const step = result.step
    setSession(result.session)
    if (step.kind !== 'choice') return
    saves.cancel(step.token)
    if (step.after?.status === 'approved') runner.drop(step.id)
    const token = `undo-${step.token}`
    saves.send(
      {
        id: step.id,
        status: 'pending',
        angle: step.before.angle,
        faceTagId: step.before.faceTagId,
      },
      token,
    )
  }, [runner, saves, session])

  async function changeTruck(nextId: string) {
    if (!photo || nextId === photo.truckId || truckBusy) return
    const truck = trucks.find((entry) => entry.id === nextId)
    if (!truck) return
    setTruckBusy(true)
    setTruckError(null)
    try {
      await binderApi(`/api/admin/photos/${photo.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ truckId: nextId }),
      })
      const keepFace = faces.some((face) => face.id === photo.faceTagId && face.truckId === nextId)
      setSession((existing) =>
        retarget(existing, photo.id, { truckId: truck.id, truckSlug: truck.slug }, keepFace),
      )
      setFaceId((current) =>
        current && faces.some((face) => face.id === current && face.truckId === nextId) ? current : null,
      )
    } catch (error) {
      setTruckError(messageFrom(error, 'The truck was not changed.'))
    } finally {
      setTruckBusy(false)
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return
      const target = event.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || target.isContentEditable) return
      }
      const key = event.key.toLowerCase()
      if (key === 'a') {
        event.preventDefault()
        act('approved')
        return
      }
      if (key === 'r' || key === 'x') {
        event.preventDefault()
        act('rejected')
        return
      }
      if (key === 's' || event.key === 'ArrowRight') {
        event.preventDefault()
        skipPhoto()
        return
      }
      if (key === 'u' || key === 'z') {
        event.preventDefault()
        undoLast()
        return
      }
      if (key === '0') {
        event.preventDefault()
        setFaceId(null)
        return
      }
      const angleIndex = Number(key) - 1
      const picked = key >= '1' && key <= '6' ? PHOTO_ANGLES[angleIndex] : undefined
      if (picked) {
        event.preventDefault()
        setAngle(picked)
        return
      }
      if (/^[a-z]$/.test(key)) {
        const index = truckFaces.findIndex((_, faceIndex) => faceShortcut(faceIndex) === key)
        if (index >= 0) {
          event.preventDefault()
          setFaceId(truckFaces[index]?.id ?? null)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [act, skipPhoto, truckFaces, undoLast])

  const listed = photo ? photos.find((item) => item.id === photo.id) : null
  const sourceLine = listed ? [listed.source, listed.author, listed.license].filter(Boolean).join(' · ') : ''
  const left = remainingCount(session)
  const toast = saves.retries.at(-1)?.error ?? null

  return (
    <div className="review-screen" role="dialog" aria-modal="true" aria-label="Review">
      <div className="review-main">
        <div className="review-top">
          <button ref={closeRef} type="button" className="btn" onClick={onClose}>
            Close
          </button>
          <p>{photo ? `${left} of ${session.total} remaining` : 'Review'}</p>
        </div>
        {photo && listed ? (
          <>
            {/* Private bytes. next/image would send them through the paid optimizer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="review-photo" src={photoImagePath(photo.id, photo.sha256)} alt={truckTitle(trucks, photo)} />
            <p className="review-title">
              {truckTitle(trucks, photo)} <span>{photo.truckSlug}</span>
            </p>
            {sourceLine ? <p className="binder-meta">{sourceLine}</p> : null}
            <div className="review-grid" role="group" aria-label="Angle">
              {PHOTO_ANGLES.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={angle === value ? 'btn btn-accent' : 'btn'}
                  aria-pressed={angle === value}
                  onClick={() => setAngle(value)}
                >
                  {ANGLE_LABEL[value]}
                  <span className="review-key">{angleShortcut(value)}</span>
                </button>
              ))}
            </div>
            {truckFaces.length > 0 ? (
              <div className="review-grid" role="group" aria-label="Face tag">
                <button
                  type="button"
                  className={faceId === null ? 'btn btn-accent' : 'btn'}
                  aria-pressed={faceId === null}
                  onClick={() => setFaceId(null)}
                >
                  None
                  <span className="review-key">0</span>
                </button>
                {truckFaces.map((face, index) => {
                  const shortcut = faceShortcut(index)
                  return (
                    <button
                      key={face.id}
                      type="button"
                      className={faceId === face.id ? 'btn btn-accent' : 'btn'}
                      aria-pressed={faceId === face.id}
                      onClick={() => setFaceId(face.id)}
                    >
                      {face.label}
                      {shortcut ? <span className="review-key">{shortcut}</span> : null}
                    </button>
                  )
                })}
              </div>
            ) : null}
            <div className="review-grid">
              <button type="button" className="btn btn-accent" onClick={() => act('approved')}>
                Approve
                <span className="review-key">A</span>
              </button>
              <button type="button" className="btn" onClick={() => act('rejected')}>
                Reject
                <span className="review-key">R</span>
              </button>
              <button type="button" className="btn" onClick={skipPhoto}>
                Skip
                <span className="review-key">S</span>
              </button>
              <button type="button" className="btn" onClick={undoLast} disabled={session.steps.length === 0}>
                Undo
                <span className="review-key">U</span>
              </button>
            </div>
            {wrong ? (
              <label className="review-truck">
                Truck
                <select value={photo.truckId} disabled={truckBusy} onChange={(event) => void changeTruck(event.target.value)}>
                  {trucks.map((truck) => (
                    <option key={truck.id} value={truck.id}>
                      {truck.maker ? `${truck.maker} ${truck.title}` : truck.title}
                    </option>
                  ))}
                  {trucks.some((truck) => truck.id === photo.truckId) ? null : (
                    <option value={photo.truckId}>{photo.truckSlug}</option>
                  )}
                </select>
              </label>
            ) : (
              <button type="button" className="btn" onClick={() => setWrong(true)}>
                Wrong truck
              </button>
            )}
            {truckError ? (
              <p className="binder-note is-bad" role="alert">
                {truckError}
              </p>
            ) : null}
          </>
        ) : null}
        {!photo && cursor && loading ? <p role="status">Loading more photos…</p> : null}
        {!photo && cursor && !loading ? (
          <p className="binder-note is-bad" role="alert">
            {listError ?? 'More photos did not load.'}{' '}
            <button
              type="button"
              className="btn"
              onClick={() => {
                asked.current = null
                onLoadMore()
              }}
            >
              Try again
            </button>
          </p>
        ) : null}
        {!photo && !cursor ? <p role="status">All caught up.</p> : null}
        {toast ? (
          <p className="binder-note is-bad" role="alert">
            {toast}{' '}
            {saves.retries.length > 0 ? (
              <button type="button" className="btn" onClick={saves.retryAll}>
                Retry {saves.retries.length}
              </button>
            ) : null}
          </p>
        ) : null}
      </div>
      <FingerprintPanel runner={runner} />
    </div>
  )
}
