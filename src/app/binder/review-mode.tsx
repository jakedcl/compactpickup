'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { binderApi, BinderApiError } from '@/app/binder/api'
import { ModelCombobox } from '@/app/binder/model-combobox'
import { FingerprintPanel, type FingerprintRunner } from '@/app/binder/fingerprint-queue'
import { aiBadgeClass, aiBadgeLabel, rejectReasonLabel } from '@/lib/binder/ai-review'
import { photoImagePath, type ReviewDecision, type ReviewFace, type ReviewPhoto, type ReviewTruck } from '@/lib/binder/review'
import {
  angleShortcut,
  appendItems,
  canApprove,
  choose,
  clearPhotoRetries,
  createReviewSession,
  currentItem,
  faceShortcut,
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
import { displayModelTitle } from '@/lib/makes'

const ANGLE_LABEL: Record<PhotoAngle, string> = {
  front: 'Front',
  'front-3q': 'Three-quarter front',
  side: 'Side',
  'rear-3q': 'Three-quarter rear',
  rear: 'Rear',
  other: 'Other',
}

const ANGLE_SHORT: Record<PhotoAngle, string> = {
  front: 'Front',
  'front-3q': '3/4 front',
  side: 'Side',
  'rear-3q': '3/4 rear',
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

export function useReviewSaves(onApproved?: (item: { id: string; sha256: string }) => void) {
  const [box, setBox] = useState<ReviewSession>(() => createReviewSession([], 0))
  const [inflight, setInflight] = useState(0)
  const boxRef = useRef(box)
  const chains = useRef(new Map<string, Promise<void>>())
  const cancelled = useRef(new Set<string>())
  const latest = useRef(new Map<string, string>())
  const shaByToken = useRef(new Map<string, string>())
  const onApprovedRef = useRef(onApproved)

  useEffect(() => {
    boxRef.current = box
  }, [box])

  useEffect(() => {
    onApprovedRef.current = onApproved
  }, [onApproved])

  const send = useCallback((body: ReviewDecision, token: string, sha256?: string) => {
    if (sha256) shaByToken.current.set(token, sha256)
    latest.current.set(body.id, token)
    setInflight((count) => count + 1)
    setBox((current) => clearPhotoRetries(current, body.id))
    const task = async () => {
      const stale = () => cancelled.current.has(token) || latest.current.get(body.id) !== token
      try {
        if (stale()) return
        await binderApi('/api/admin/photos/review', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        if (stale()) return
        setBox((current) => clearPhotoRetries(noteSave(current, token, 'saved'), body.id))
        if (body.status === 'approved') {
          const sha = shaByToken.current.get(token)
          if (sha) onApprovedRef.current?.({ id: body.id, sha256: sha })
        }
      } catch (error) {
        if (stale()) return
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
      } finally {
        setInflight((count) => count - 1)
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
    setBox((current) => {
      const id = current.retries.find((item) => item.token === token)?.id
      return id ? clearPhotoRetries(current, id) : current
    })
  }, [])

  const retryAll = useCallback(() => {
    for (const write of boxRef.current.retries) {
      send(
        { id: write.id, status: write.status, angle: write.angle, faceTagId: write.faceTagId },
        write.token,
        shaByToken.current.get(write.token),
      )
    }
  }, [send])

  const settle = useCallback(() => Promise.all(Array.from(chains.current.values())).then(() => undefined), [])

  const pending = inflight > 0 || box.retries.length > 0
  useEffect(() => {
    if (!pending) return
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [pending])

  return { retries: box.retries, pending, send, cancel, retryAll, settle }
}

export type ReviewSaves = ReturnType<typeof useReviewSaves>

function truckTitle(trucks: ReviewTruck[], item: ReviewItem) {
  if (!item.truckId) return 'No model'
  const truck = trucks.find((entry) => entry.id === item.truckId)
  if (!truck) return item.truckSlug || 'No model'
  return displayModelTitle(truck.maker, truck.title)
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
  onClose: () => void | Promise<void>
}) {
  const total = matched > 0 ? Math.max(matched, photos.length) : photos.length
  const [session, setSession] = useState<ReviewSession>(() => createReviewSession(photos.map(toItem), total))
  const opened = photos[0]
  const [angle, setAngle] = useState<PhotoAngle | null>(opened?.angle ?? null)
  const [faceId, setFaceId] = useState<string | null>(opened?.faceTagId ?? null)
  const [trackedId, setTrackedId] = useState<string | null>(opened?.id ?? null)
  const [truckBusy, setTruckBusy] = useState(false)
  const [truckError, setTruckError] = useState<string | null>(null)
  const acted = useRef<string | null>(null)
  const asked = useRef<string | null>(null)
  const prefilled = useRef<string | null>(null)
  const seq = useRef(0)
  const closeRef = useRef<HTMLButtonElement>(null)
  const modelRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const [closing, setClosing] = useState(false)
  useEffect(() => {
    setSession((current) => appendItems(current, photos.map(toItem), total))
  }, [photos, total])

  const photo = currentItem(session)
  const visibleId = photo?.id ?? null
  if (visibleId !== trackedId) {
    setTrackedId(visibleId)
    setAngle(photo?.angle ?? null)
    setFaceId(photo?.faceTagId ?? null)
    setTruckError(null)
  }
  const truckFaces = useMemo(
    () => (photo ? faces.filter((face) => face.truckId === photo.truckId) : []),
    [faces, photo],
  )

  useEffect(() => {
    closeRef.current?.focus()
    const scrollY = window.scrollY
    const previousBody = document.body.style.overflow
    const previousHtml = document.documentElement.style.overflow
    const previousPosition = document.body.style.position
    const previousTop = document.body.style.top
    const previousWidth = document.body.style.width
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'
    const root = dialogRef.current
    function onTab(event: KeyboardEvent) {
      if (event.key !== 'Tab' || !root) return
      const nodes = [...root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea')].filter((node) => {
        if (node.hidden || node.hasAttribute('disabled') || node.getAttribute('tabindex') === '-1') return false
        let current: HTMLElement | null = node
        while (current && current !== root.parentElement) {
          const style = window.getComputedStyle(current)
          if (style.display === 'none' || style.visibility === 'hidden') return false
          if (current === root) break
          current = current.parentElement
        }
        return true
      })
      if (nodes.length === 0) {
        event.preventDefault()
        return
      }
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      const active = document.activeElement
      if (event.shiftKey) {
        if (active === first || !root.contains(active)) {
          event.preventDefault()
          last?.focus()
        }
      } else if (active === last || !root.contains(active)) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onTab, true)
    return () => {
      document.body.style.overflow = previousBody
      document.documentElement.style.overflow = previousHtml
      document.body.style.position = previousPosition
      document.body.style.top = previousTop
      document.body.style.width = previousWidth
      window.scrollTo(0, scrollY)
      document.removeEventListener('keydown', onTab, true)
    }
  }, [])

  const focusModel = photo?.id && !photo.truckId ? photo.id : null
  useEffect(() => {
    if (focusModel) modelRef.current?.focus()
  }, [focusModel])

  useEffect(() => {
    for (const item of prefetchItems(session)) {
      const img = new Image()
      img.src = photoImagePath(item.id, item.sha256)
    }
  }, [session])

  useEffect(() => {
    if (closing || !cursor || loading) return
    if (session.items.length === 0) return
    if (session.index <= session.items.length - 4) return
    if (asked.current === cursor) return
    asked.current = cursor
    onLoadMore()
  }, [closing, cursor, loading, onLoadMore, session.index, session.items.length])

  const nextToken = useCallback(() => {
    seq.current += 1
    return `review-${seq.current}`
  }, [])

  const act = useCallback((status: 'approved' | 'rejected', faceOverride?: string | null) => {
    const current = currentItem(session)
    if (!current || acted.current === current.id) return
    if (status === 'approved' && !canApprove(current)) return
    acted.current = current.id
    const token = nextToken()
    const faceTagId = faceOverride === undefined ? faceId : faceOverride
    setSession((existing) => choose(existing, { status, angle, faceTagId }, token))
    saves.send({ id: current.id, status, angle, faceTagId }, token, current.sha256)
  }, [angle, faceId, nextToken, saves, session])

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
    const sha256 = session.items.find((item) => item.id === step.id)?.sha256
    saves.send(
      {
        id: step.id,
        status: step.before.status,
        angle: step.before.angle,
        faceTagId: step.before.faceTagId,
      },
      token,
      sha256,
    )
  }, [runner, saves, session])

  async function close() {
    if (closing) return
    setClosing(true)
    try {
      await onClose()
    } finally {
      setClosing(false)
    }
  }

  async function changeTruck(nextId: string): Promise<boolean> {
    if (!photo || nextId === photo.truckId || truckBusy) return false
    const truck = trucks.find((entry) => entry.id === nextId)
    if (!truck) return false
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
      return true
    } catch (error) {
      setTruckError(messageFrom(error, 'The truck was not changed.'))
      return false
    } finally {
      setTruckBusy(false)
    }
  }

  useEffect(() => {
    if (!photo) return
    const row = photos.find((item) => item.id === photo.id)
    if (!row?.aiReview || prefilled.current === photo.id) return
    prefilled.current = photo.id
    const review = row.aiReview
    // Local prefill only. Nothing is saved until Jake taps a decision.
    if (review.angle) setAngle(review.angle)
  }, [photo, photos])

  const listed = photo ? photos.find((item) => item.id === photo.id) : null
  const ai = listed?.aiReview ?? null
  const suggestedTruck =
    ai?.outcome === 'wrong_truck' && ai.suggestedTruckSlug
      ? (trucks.find((entry) => entry.slug === ai.suggestedTruckSlug) ?? null)
      : null
  // Offer the AI's truck only while the photo is still on the truck the AI reviewed.
  const suggestMove = Boolean(
    photo && listed && suggestedTruck && photo.truckId === listed.truckId && photo.truckId !== suggestedTruck.id,
  )

  async function approveSuggested() {
    if (!photo || acted.current === photo.id) return
    if (!suggestMove || !suggestedTruck) {
      act('approved')
      return
    }
    const nextId = suggestedTruck.id
    const keepFace = faceId && faces.some((face) => face.id === faceId && face.truckId === nextId) ? faceId : null
    if (await changeTruck(nextId)) act('approved', keepFace)
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
      if (event.key === '/') {
        event.preventDefault()
        modelRef.current?.focus()
        return
      }
      if (key === 'a') {
        event.preventDefault()
        void approveSuggested()
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
  })

  const sourceLine = listed ? [listed.source, listed.author, listed.license].filter(Boolean).join(' · ') : ''

  const canSuggestApprove = Boolean(photo?.truckId) && (ai?.outcome === 'looks_right' || suggestMove)
  const left = remainingCount(session)
  const toast = saves.retries.at(-1)?.error ?? null

  return (
    <div ref={dialogRef} className="review-screen" role="dialog" aria-modal="true" aria-label="Review">
      <div className="review-main">
        <div className="review-top">
          <button ref={closeRef} type="button" className="btn" onClick={() => void close()} disabled={closing}>
            {closing ? 'Saving' : 'Close'}
          </button>
          <p>{photo ? `${left} of ${session.total} remaining` : 'Review'}</p>
        </div>
        <div className="review-stage">
          {photo && listed ? (
            // Private bytes. next/image would send them through the paid optimizer.
            // eslint-disable-next-line @next/next/no-img-element
            <img className="review-photo" src={photoImagePath(photo.id, photo.sha256)} alt={truckTitle(trucks, photo)} />
          ) : (
            <div className="review-empty">
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
            </div>
          )}
        </div>
        {photo && listed ? (
          <div className="review-controls">
            <p className="review-title">
              {truckTitle(trucks, photo)} <span>{photo.truckSlug}</span>
            </p>
            {sourceLine ? <p className="binder-meta review-source">{sourceLine}</p> : null}
            {ai ? (
              <div className="review-ai">
                <p className={aiBadgeClass(ai.outcome)}>{aiBadgeLabel(ai.outcome)}</p>
                {ai.confidence !== null || suggestedTruck ? (
                  <p className="binder-meta review-ai-meta">
                    {ai.confidence !== null ? `Confidence ${Math.round(ai.confidence * 100)}%` : ''}
                    {ai.confidence !== null && suggestedTruck ? ' · ' : ''}
                    {suggestedTruck ? `AI says: ${displayModelTitle(suggestedTruck.maker, suggestedTruck.title)}` : ''}
                  </p>
                ) : null}
                {ai.reasons.length > 0 ? (
                  <ul className="review-ai-reasons">
                    {ai.reasons.slice(0, 3).map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                ) : null}
                {ai.questions.length > 0 ? (
                  <ul className="review-ai-questions">
                    {ai.questions.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ul>
                ) : null}
                {ai.generationYearsGuess ? (
                  <p className="binder-meta review-ai-guess">AI guess: {ai.generationYearsGuess}</p>
                ) : null}
              </div>
            ) : null}
            <ModelCombobox
              id="review-model"
              label="Model"
              hint="/"
              trucks={trucks}
              make=""
              value={photo.truckId ?? ''}
              disabled={truckBusy}
              inputRef={modelRef}
              placement="up"
              onChange={(nextId) => void changeTruck(nextId)}
            />
            <div className="review-row">
              <p className="review-label">Angle</p>
              <div className="review-grid review-angles" role="group" aria-label="Angle">
                {PHOTO_ANGLES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={angle === value ? 'btn btn-accent' : 'btn'}
                    aria-pressed={angle === value}
                    aria-label={`${ANGLE_LABEL[value]} ${angleShortcut(value)}`}
                    onClick={() => setAngle(value)}
                  >
                    {ANGLE_SHORT[value]}
                    <span className="review-key">{angleShortcut(value)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="review-row">
              <p className="review-label">Facelift</p>
              {truckFaces.length > 0 ? (
                <div className="review-grid review-faces" role="group" aria-label="Facelift">
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
              ) : (
                <p>No facelift tags for this truck.</p>
              )}
            </div>
            <div className="review-row review-decide">
              <p className="review-label">Decision</p>
              <div className="review-grid review-choices">
                {canSuggestApprove ? (
                  <button
                    type="button"
                    className="btn btn-accent"
                    onClick={() => void approveSuggested()}
                    disabled={truckBusy}
                  >
                    Approve as suggested
                    <span className="review-key">A</span>
                  </button>
                ) : (
                  <button type="button" className="btn btn-accent" onClick={() => act('approved')} disabled={!photo.truckId}>
                    Approve
                    <span className="review-key">A</span>
                  </button>
                )}
                {ai?.outcome === 'reject' && ai.rejectReason ? (
                  <button type="button" className="btn" onClick={() => act('rejected')}>
                    {rejectReasonLabel(ai.rejectReason)}
                    <span className="review-key">R</span>
                  </button>
                ) : (
                  <button type="button" className="btn" onClick={() => act('rejected')}>
                    Reject
                    <span className="review-key">R</span>
                  </button>
                )}
                <button type="button" className="btn" onClick={skipPhoto}>
                  Skip
                  <span className="review-key">S</span>
                </button>
              </div>
            </div>
            <div className="review-row">
              <p className="review-label">Fix</p>
              <div>
                <button type="button" className="btn" onClick={undoLast} disabled={session.steps.length === 0}>
                  Undo
                  <span className="review-key">U</span>
                </button>
              </div>
            </div>
            {truckError ? (
              <p className="binder-note is-bad" role="alert">
                {truckError}
              </p>
            ) : null}
          </div>
        ) : null}
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
      <FingerprintPanel runner={runner} variant="review" />
    </div>
  )
}
