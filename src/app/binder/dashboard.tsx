'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { binderApi, BinderApiError } from '@/app/binder/api'
import { CoverageList, type CoverageItem } from '@/app/binder/coverage-list'
import { LogoutButton } from '@/app/binder/logout-button'
import { UploadPanel } from '@/app/binder/upload-panel'
import type { ClipProgress } from '@/lib/clip/browser'
import { MAX_EMBED_ITEMS, MAX_STATUS_IDS, photoImagePath, type ReviewFace, type ReviewPhoto, type ReviewTruck } from '@/lib/binder/review'
import { PHOTO_ANGLES, type PhotoAngle, type PhotoStatus } from '@/lib/binder/types'

type Tab = PhotoStatus | 'coverage' | 'add'
type Counts = Record<PhotoStatus, number>

type ListResponse = {
  photos: ReviewPhoto[]
  nextCursor: string | null
  counts: Counts
  missingEmbeddings: number
}

type TruckResponse = { trucks: ReviewTruck[]; faces: ReviewFace[] }
type CoverageResponse = { trucks: CoverageItem[] }

const ANGLE_LABEL: Record<PhotoAngle, string> = {
  front: 'Front',
  'front-3q': 'Three-quarter front',
  side: 'Side',
  'rear-3q': 'Three-quarter rear',
  rear: 'Rear',
  other: 'Other',
}

function listUrl(status: PhotoStatus, truckId: string, cursor: string | null, limit = 24, missing = false) {
  const params = new URLSearchParams({ status, limit: String(limit) })
  if (truckId) params.set('truckId', truckId)
  if (cursor) params.set('cursor', cursor)
  if (missing) params.set('missingEmbedding', '1')
  return `/api/admin/photos?${params}`
}

function messageFrom(error: unknown, fallback: string) {
  return error instanceof BinderApiError || error instanceof Error ? error.message : fallback
}

export function Dashboard({ initialCounts }: { initialCounts: Counts | null }) {
  const [tab, setTab] = useState<Tab>('pending')
  const [counts, setCounts] = useState<Counts | null>(initialCounts)
  const [photos, setPhotos] = useState<ReviewPhoto[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [truckFilter, setTruckFilter] = useState('')
  const [trucks, setTrucks] = useState<ReviewTruck[] | null>(null)
  const [faces, setFaces] = useState<ReviewFace[]>([])
  const [trucksError, setTrucksError] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [missingEmbeddings, setMissingEmbeddings] = useState(0)
  const [coverage, setCoverage] = useState<CoverageItem[] | null>(null)
  const [coverageError, setCoverageError] = useState<string | null>(null)
  const [coverageLoading, setCoverageLoading] = useState(false)
  const [showCaughtUp, setShowCaughtUp] = useState(false)
  const [selectingAll, setSelectingAll] = useState(false)
  const requestId = useRef(0)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const staleList = useRef(false)
  const shaById = useRef(new Map<string, string>())

  function remember(items: ReviewPhoto[]) {
    for (const photo of items) shaById.current.set(photo.id, photo.sha256)
  }

  function shaFor(id: string) {
    return shaById.current.get(id) ?? ''
  }

  const photoTab: PhotoStatus | null = tab === 'pending' || tab === 'approved' || tab === 'rejected' ? tab : null

  async function loadTrucks() {
    try {
      const data = await binderApi<TruckResponse>('/api/admin/trucks')
      setTrucks(data.trucks)
      setFaces(data.faces)
      setTrucksError(null)
    } catch (error) {
      setTrucks(null)
      setTrucksError(messageFrom(error, 'The truck list did not load.'))
    }
  }

  const loadPhotos = useCallback(async (status: PhotoStatus, filter: string, nextCursor: string | null) => {
    const id = ++requestId.current
    setListLoading(true)
    setListError(null)
    try {
      const data = await binderApi<ListResponse>(listUrl(status, filter, nextCursor))
      if (id !== requestId.current) return
      for (const photo of data.photos) shaById.current.set(photo.id, photo.sha256)
      setPhotos((current) => (nextCursor ? [...current, ...data.photos] : data.photos))
      setCursor(data.nextCursor)
      setCounts(data.counts)
      setMissingEmbeddings(data.missingEmbeddings)
    } catch (error) {
      if (id !== requestId.current) return
      if (!nextCursor) setPhotos([])
      setListError(messageFrom(error, 'The photos did not load.'))
    } finally {
      if (id === requestId.current) setListLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTrucks()
  }, [])

  useEffect(() => {
    if (!photoTab) return
    setSelected(new Set())
    void loadPhotos(photoTab, truckFilter, null)
  }, [photoTab, truckFilter, loadPhotos])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (openId && !dialog.open) dialog.showModal()
    if (!openId && dialog.open) dialog.close()
  }, [openId])

  async function loadCoverage() {
    setCoverageLoading(true)
    setCoverageError(null)
    try {
      const data = await binderApi<CoverageResponse>('/api/admin/coverage')
      setCoverage(data.trucks)
    } catch (error) {
      setCoverageError(messageFrom(error, 'The shooting list did not load.'))
    } finally {
      setCoverageLoading(false)
    }
  }

  useEffect(() => {
    if (tab !== 'coverage') return
    void loadCoverage()
  }, [tab])

  const titles = useMemo(() => new Map((trucks ?? []).map((truck) => [truck.id, truck.title])), [trucks])

  function titleFor(photo: ReviewPhoto) {
    return titles.get(photo.truckId) ?? photo.truckSlug
  }

  async function fingerprint(ids: string[]) {
    const { embedImage } = await import('@/lib/clip/browser')
    const batch: { id: string; embedding: number[] }[] = []
    const flush = async () => {
      if (batch.length === 0) return
      const items = batch.splice(0, batch.length)
      await binderApi('/api/admin/photos/embeddings', {
        method: 'POST',
        body: JSON.stringify({ items }),
      })
    }
    for (let index = 0; index < ids.length; index += 1) {
      setProgress(`Fingerprint ${index + 1} of ${ids.length}`)
      const response = await fetch(photoImagePath(ids[index], shaFor(ids[index])))
      if (!response.ok) throw new Error('A photo did not load for fingerprinting.')
      const blob = await response.blob()
      const onProgress = (update: ClipProgress) => {
        if (typeof update.progress === 'number') {
          const percent = Math.round(Math.max(0, Math.min(100, update.progress)))
          setProgress(`Downloading the fingerprint model ${percent}%. This happens once.`)
          return
        }
        if (update.status === 'initiate' || update.status === 'download' || update.status === 'progress') {
          setProgress('Downloading the fingerprint model. This happens once.')
        }
      }
      const vector = await embedImage(blob, onProgress)
      batch.push({ id: ids[index], embedding: Array.from(vector) })
      if (batch.length >= MAX_EMBED_ITEMS) await flush()
    }
    await flush()
  }

  async function updateStatus(ids: string[], status: PhotoStatus) {
    if (ids.length === 0 || busy) return
    if (ids.length > 25) {
      const verb = status === 'approved' ? 'Approve' : status === 'rejected' ? 'Reject' : 'Move'
      const extra = status === 'approved' ? ' Fingerprints run in the browser and can take a while.' : ''
      if (!window.confirm(`${verb} ${ids.length} photos?${extra}`)) return
    }
    setBusy(true)
    setNotice(null)
    try {
      for (let index = 0; index < ids.length; index += MAX_STATUS_IDS) {
        const chunk = ids.slice(index, index + MAX_STATUS_IDS)
        await binderApi('/api/admin/photos/status', {
          method: 'POST',
          body: JSON.stringify({ ids: chunk, status }),
        })
      }
      if (status === 'approved') {
        try {
          await fingerprint(ids)
        } catch {
          staleList.current = true
          setPhotos((current) =>
            current.map((item) => (ids.includes(item.id) ? { ...item, status: 'approved' } : item)),
          )
          throw new Error('Approved. The fingerprint did not save. Use Fingerprint missing to retry.')
        }
      }
      setSelected(new Set())
      setOpenId(null)
      setNotice(
        status === 'approved'
          ? 'Approved.'
          : status === 'rejected'
            ? 'Rejected. The photo stays in Rejected.'
            : 'Moved back to pending.',
      )
      if (photoTab) await loadPhotos(photoTab, truckFilter, null)
      else await loadPhotos('pending', '', null)
      if (tab === 'coverage') await loadCoverage()
    } catch (error) {
      const message = messageFrom(error, 'The photos were not updated.')
      setNotice(message)
      throw new Error(message)
    } finally {
      setProgress(null)
      setBusy(false)
    }
  }

  function closeDetail() {
    setOpenId(null)
    if (staleList.current && photoTab) {
      staleList.current = false
      void loadPhotos(photoTab, truckFilter, null)
    }
  }

  function runStatus(ids: string[], status: PhotoStatus) {
    void updateStatus(ids, status).catch(() => undefined)
  }

  async function savePhoto(photo: ReviewPhoto, patch: Record<string, unknown>) {
    if (Object.keys(patch).length === 0) return
    await binderApi(`/api/admin/photos/${photo.id}`, { method: 'PATCH', body: JSON.stringify(patch) })
    setPhotos((current) =>
      current.map((item) => (item.id === photo.id ? { ...item, ...patchFrom(item, patch, trucks ?? []) } : item)),
    )
  }

  async function selectAll() {
    if (!photoTab || selectingAll) return
    setSelectingAll(true)
    setNotice(null)
    try {
      const ids: string[] = []
      let next: string | null = null
      do {
        const page: ListResponse = await binderApi(listUrl(photoTab, truckFilter, next, 48))
        remember(page.photos)
        for (const photo of page.photos) ids.push(photo.id)
        next = page.nextCursor
        setCounts(page.counts)
      } while (next && ids.length < 5000)
      setSelected(new Set(ids))
    } catch (error) {
      setNotice(messageFrom(error, 'The photos were not selected.'))
    } finally {
      setSelectingAll(false)
    }
  }

  async function fingerprintMissing() {
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      const ids: string[] = []
      let next: string | null = null
      do {
        const page: ListResponse = await binderApi(listUrl('approved', '', next, 48, true))
        remember(page.photos)
        for (const photo of page.photos) ids.push(photo.id)
        next = page.nextCursor
      } while (next && ids.length < 5000)
      if (ids.length === 0) {
        setNotice('Every approved photo already has a fingerprint.')
        return
      }
      await fingerprint(ids)
      setNotice('Fingerprints saved.')
      setMissingEmbeddings(0)
      if (photoTab) await loadPhotos(photoTab, truckFilter, null)
    } catch (error) {
      setNotice(messageFrom(error, 'The fingerprint did not save.'))
    } finally {
      setProgress(null)
      setBusy(false)
    }
  }

  async function importSanity() {
    if (busy) return
    setBusy(true)
    setNotice('Importing Sanity photos…')
    const skipRefs: string[] = []
    let inserted = 0
    let failed = 0
    try {
      for (let round = 0; round < 400; round += 1) {
        const result = await binderApi<{
          inserted: number
          failed: number
          failedRefs: string[]
          remaining: number
        }>('/api/admin/sanity-sync', {
          method: 'POST',
          body: JSON.stringify({ skipRefs }),
        })
        inserted += result.inserted
        failed += result.failed
        skipRefs.push(...result.failedRefs)
        setNotice(`Imported ${inserted}. ${result.remaining} still new.`)
        if (result.remaining === 0) break
      }
      setNotice(
        failed > 0
          ? `Imported ${inserted}. ${failed} could not be imported.`
          : inserted > 0
            ? `Imported ${inserted} new Sanity photos into Pending.`
            : 'No new Sanity photos.',
      )
      if (photoTab) await loadPhotos(photoTab, truckFilter, null)
      else await loadPhotos('pending', '', null)
    } catch (error) {
      setNotice(messageFrom(error, 'The Sanity import did not finish.'))
    } finally {
      setBusy(false)
    }
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openPhoto = photos.find((photo) => photo.id === openId) ?? null
  const loadedIds = photos.map((photo) => photo.id)
  const allLoadedSelected = loadedIds.length > 0 && loadedIds.every((id) => selected.has(id))

  return (
    <div className={selected.size > 0 ? 'binder-pad' : undefined}>
      <div className="binder-tabs" role="tablist" aria-label="Photo library">
        {(['pending', 'approved', 'rejected'] as const).map((status) => (
          <button
            key={status}
            type="button"
            role="tab"
            className={tab === status ? 'btn btn-accent' : 'btn'}
            aria-selected={tab === status}
            onClick={() => setTab(status)}
          >
            <span>{status === 'pending' ? 'Pending' : status === 'approved' ? 'Approved' : 'Rejected'}</span>
            <strong>{counts ? counts[status] : '—'}</strong>
          </button>
        ))}
        <button type="button" role="tab" className={tab === 'coverage' ? 'btn btn-accent' : 'btn'} aria-selected={tab === 'coverage'} onClick={() => setTab('coverage')}>
          Coverage
        </button>
        <button type="button" role="tab" className={tab === 'add' ? 'btn btn-accent' : 'btn'} aria-selected={tab === 'add'} onClick={() => setTab('add')}>
          Add
        </button>
      </div>

      <div className="binder-tools">
        <button type="button" className="btn" onClick={() => void importSanity()} disabled={busy}>
          Import Sanity photos
        </button>
        <button type="button" className="btn" onClick={() => void fingerprintMissing()} disabled={busy}>
          Fingerprint missing{missingEmbeddings > 0 ? ` (${missingEmbeddings})` : ''}
        </button>
        <LogoutButton />
      </div>
      {progress ? <p role="status">{progress}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {trucksError ? (
        <p className="binder-note is-bad" role="alert">
          {trucksError}{' '}
          <button type="button" className="btn" onClick={() => void loadTrucks()}>
            Try again
          </button>
        </p>
      ) : null}

      {photoTab ? (
        <section aria-label={photoTab}>
          <div className="binder-filters">
            <label htmlFor="truck-filter">Truck</label>
            <select id="truck-filter" value={truckFilter} onChange={(event) => setTruckFilter(event.target.value)}>
              <option value="">All trucks</option>
              {(trucks ?? []).map((truck) => (
                <option key={truck.id} value={truck.id}>
                  {truck.maker ? `${truck.maker} ${truck.title}` : truck.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn"
              onClick={() => setSelected(allLoadedSelected ? new Set() : new Set(loadedIds))}
              disabled={photos.length === 0}
            >
              {allLoadedSelected ? 'Clear loaded' : 'Select loaded'}
            </button>
            <button type="button" className="btn" onClick={() => void selectAll()} disabled={selectingAll || busy}>
              {selectingAll ? 'Selecting' : 'Select all'}
            </button>
          </div>
          {listLoading && photos.length === 0 ? <p>Loading photos…</p> : null}
          {listError ? (
            <p className="binder-note is-bad" role="alert">
              {listError}{' '}
              <button type="button" className="btn" onClick={() => void loadPhotos(photoTab, truckFilter, null)}>
                Try again
              </button>
            </p>
          ) : null}
          {!listLoading && !listError && photos.length === 0 ? (
            <p>
              {photoTab === 'pending'
                ? 'No photos waiting.'
                : photoTab === 'approved'
                  ? 'No approved photos yet.'
                  : 'No rejected photos.'}
            </p>
          ) : null}
          <ul className="binder-grid">
            {photos.map((photo) => {
              const title = titleFor(photo)
              const angle = photo.angle ? ANGLE_LABEL[photo.angle] : 'Angle not set'
              return (
                <li key={photo.id} className={selected.has(photo.id) ? 'binder-card is-on' : 'binder-card'}>
                  <label className="binder-check">
                    <input
                      type="checkbox"
                      checked={selected.has(photo.id)}
                      onChange={() => toggle(photo.id)}
                    />
                    <span className="sr-only">Select {title}</span>
                  </label>
                  <button type="button" className="binder-card-open" onClick={() => setOpenId(photo.id)}>
                    {/* Private bytes. next/image would send them through the paid optimizer. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoImagePath(photo.id, photo.sha256, 'thumb')} alt="" />
                    <span className="binder-card-copy">
                      <strong>{title}</strong>
                      <span>
                        {angle}
                        {photo.status === 'approved' && !photo.hasEmbedding ? ' · no fingerprint' : ''}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {cursor ? (
            <div className="binder-actions">
              <button type="button" className="btn" onClick={() => void loadPhotos(photoTab, truckFilter, cursor)} disabled={listLoading}>
                {listLoading ? 'Loading' : 'More photos'}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === 'coverage' ? (
        <CoverageList
          trucks={coverage}
          loading={coverageLoading}
          error={coverageError}
          showCaughtUp={showCaughtUp}
          onToggle={() => setShowCaughtUp((value) => !value)}
          onShow={(truckId) => {
            setTruckFilter(truckId)
            setTab('approved')
          }}
          onRetry={() => void loadCoverage()}
        />
      ) : null}

      {tab === 'add' ? (
        trucks && trucks.length > 0 ? (
          <UploadPanel
            trucks={trucks}
            disabled={busy}
            onDone={() => {
              setNotice('Uploaded to pending.')
              void loadPhotos('pending', truckFilter, null)
            }}
          />
        ) : trucks && trucks.length === 0 ? (
          <p>No trucks are in the catalog.</p>
        ) : trucksError ? (
          <p className="binder-note is-bad" role="alert">
            The truck list did not load.
          </p>
        ) : (
          <p>Loading trucks…</p>
        )
      ) : null}

      {selected.size > 0 && photoTab ? (
        <div className="binder-bulk">
          <strong>{selected.size} selected</strong>
          <div className="binder-bulk-buttons">
            {photoTab !== 'approved' ? (
              <button type="button" className="btn btn-accent" disabled={busy} onClick={() => runStatus([...selected], 'approved')}>
                Approve
              </button>
            ) : null}
            {photoTab !== 'rejected' ? (
              <button type="button" className="btn" disabled={busy} onClick={() => runStatus([...selected], 'rejected')}>
                Reject
              </button>
            ) : null}
            {photoTab !== 'pending' ? (
              <button type="button" className="btn" disabled={busy} onClick={() => runStatus([...selected], 'pending')}>
                Pending
              </button>
            ) : null}
            <button type="button" className="btn" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>
        </div>
      ) : null}

      <dialog
        ref={dialogRef}
        className="binder-dialog"
        onClose={closeDetail}
        aria-label="Photo"
      >
        {openPhoto ? (
          <PhotoDetail
            photo={openPhoto}
            trucks={trucks ?? []}
            faces={faces}
            busy={busy}
            progress={progress}
            onClose={closeDetail}
            onSave={(patch) => savePhoto(openPhoto, patch)}
            onStatus={(status) => updateStatus([openPhoto.id], status)}
          />
        ) : (
          <p>That photo is not on this page.</p>
        )}
      </dialog>
    </div>
  )
}

function patchFrom(photo: ReviewPhoto, patch: Record<string, unknown>, trucks: ReviewTruck[]): ReviewPhoto {
  const nextTruck = typeof patch.truckId === 'string' ? trucks.find((truck) => truck.id === patch.truckId) : undefined
  return {
    ...photo,
    truckId: nextTruck?.id ?? photo.truckId,
    truckSlug: nextTruck?.slug ?? photo.truckSlug,
    angle: 'angle' in patch ? ((patch.angle as PhotoAngle | null) ?? null) : photo.angle,
    faceTagId: 'faceTagId' in patch ? ((patch.faceTagId as string | null) ?? null) : photo.faceTagId,
  }
}

function PhotoDetail({
  photo,
  trucks,
  faces,
  busy,
  progress,
  onClose,
  onSave,
  onStatus,
}: {
  photo: ReviewPhoto
  trucks: ReviewTruck[]
  faces: ReviewFace[]
  busy: boolean
  progress: string | null
  onClose: () => void
  onSave: (patch: Record<string, unknown>) => Promise<void>
  onStatus: (status: PhotoStatus) => Promise<void>
}) {
  const [truckId, setTruckId] = useState(photo.truckId)
  const [angle, setAngle] = useState<string>(photo.angle ?? '')
  const [faceId, setFaceId] = useState(photo.faceTagId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const truckFaces = faces.filter((face) => face.truckId === truckId)
  const title = trucks.find((truck) => truck.id === photo.truckId)?.title ?? photo.truckSlug

  useEffect(() => {
    setTruckId(photo.truckId)
    setAngle(photo.angle ?? '')
    setFaceId(photo.faceTagId ?? '')
  }, [photo.id, photo.truckId, photo.angle, photo.faceTagId])

  useEffect(() => {
    setError(null)
  }, [photo.id])

  function patch(): Record<string, unknown> {
    const next: Record<string, unknown> = {}
    if (truckId !== photo.truckId) next.truckId = truckId
    if ((angle || null) !== photo.angle) next.angle = angle || null
    if ((faceId || null) !== photo.faceTagId) next.faceTagId = faceId || null
    return next
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await onSave(patch())
    } catch (caught) {
      setError(messageFrom(caught, 'The photo was not updated.'))
    } finally {
      setSaving(false)
    }
  }

  async function act(status: PhotoStatus) {
    setSaving(true)
    setError(null)
    try {
      await onSave(patch())
      await onStatus(status)
    } catch (caught) {
      setError(messageFrom(caught, 'The photo was not updated.'))
    } finally {
      setSaving(false)
    }
  }

  const credit = [photo.source, photo.author, photo.license].filter(Boolean).join(' · ')

  return (
    <div className="binder-detail">
      {progress || error ? (
        <div className="binder-progress">
          {progress ? <p role="status">{progress}</p> : null}
          {error ? (
            <p className="binder-note is-bad" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
      {/* Private bytes. next/image would send them through the paid optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoImagePath(photo.id, photo.sha256)} alt={title} />
      <p>{title}</p>
      {credit ? <p className="binder-meta">{credit}</p> : null}
      {photo.notes ? <p>{photo.notes}</p> : null}
      <label>
        Truck
        <select
          value={truckId}
          disabled={busy || saving}
          onChange={(event) => {
            const next = event.target.value
            setTruckId(next)
            if (!faces.some((face) => face.id === faceId && face.truckId === next)) setFaceId('')
          }}
        >
          {trucks.map((truck) => (
            <option key={truck.id} value={truck.id}>
              {truck.maker ? `${truck.maker} ${truck.title}` : truck.title}
            </option>
          ))}
          {trucks.some((truck) => truck.id === truckId) ? null : <option value={truckId}>{photo.truckSlug}</option>}
        </select>
      </label>
      <label>
        Angle
        <select value={angle} disabled={busy || saving} onChange={(event) => setAngle(event.target.value)}>
          <option value="">Angle not set</option>
          {PHOTO_ANGLES.map((value) => (
            <option key={value} value={value}>
              {ANGLE_LABEL[value]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Face tag
        <select value={faceId} disabled={busy || saving} onChange={(event) => setFaceId(event.target.value)}>
          <option value="">No face tag</option>
          {truckFaces.map((face) => (
            <option key={face.id} value={face.id}>
              {face.label}
            </option>
          ))}
        </select>
      </label>
      <div className="binder-detail-actions">
        <button type="button" className="btn" disabled={busy || saving} onClick={() => void save()}>
          {saving ? 'Saving' : 'Save'}
        </button>
        {photo.status !== 'approved' ? (
          <button type="button" className="btn btn-accent" disabled={busy || saving} onClick={() => void act('approved')}>
            Approve
          </button>
        ) : null}
        {photo.status !== 'rejected' ? (
          <button type="button" className="btn" disabled={busy || saving} onClick={() => void act('rejected')}>
            Reject
          </button>
        ) : null}
        {photo.status !== 'pending' ? (
          <button type="button" className="btn" disabled={busy || saving} onClick={() => void act('pending')}>
            Pending
          </button>
        ) : null}
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
