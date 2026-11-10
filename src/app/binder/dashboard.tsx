'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { binderApi, BinderApiError, SANITY_SYNC_TIMEOUT_MS } from '@/app/binder/api'
import { CoverageList, type CoverageItem } from '@/app/binder/coverage-list'
import { useFingerprintRunner, FingerprintPanel } from '@/app/binder/fingerprint-queue'
import { LogoutButton } from '@/app/binder/logout-button'
import { ModelCombobox } from '@/app/binder/model-combobox'
import { ReviewMode, useReviewSaves } from '@/app/binder/review-mode'
import { UploadPanel } from '@/app/binder/upload-panel'
import type { ClipProgress } from '@/lib/clip/browser'
import { aiBadgeClass, aiBadgeLabel, type AiOutcomeFilter, type AiSort } from '@/lib/binder/ai-review'
import { MAX_EMBED_ITEMS, MAX_STATUS_IDS, photoImagePath, type ReviewFace, type ReviewPhoto, type ReviewTruck } from '@/lib/binder/review'
import { applySelection } from '@/lib/binder/selection'
import { type PhotoAngle, type PhotoStatus } from '@/lib/binder/types'
import { displayModelTitle, makeOptions } from '@/lib/makes'

type Tab = PhotoStatus | 'coverage'
type Counts = Record<PhotoStatus, number>

type ListResponse = {
  photos: ReviewPhoto[]
  nextCursor: string | null
  counts: Counts
  matched: number
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

function listUrl(
  status: PhotoStatus,
  modelId: string,
  truckIds: string[] | null,
  cursor: string | null,
  limit = 24,
  aiOutcome: AiOutcomeFilter = '',
  sort: AiSort = 'created',
) {
  const params = new URLSearchParams({ status, limit: String(limit) })
  if (modelId) params.set('truckId', modelId)
  else if (truckIds) params.set('trucks', truckIds.join(','))
  if (cursor) params.set('cursor', cursor)
  if (aiOutcome) params.set('aiOutcome', aiOutcome)
  if (sort !== 'created') params.set('sort', sort)
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
  const [makeFilter, setMakeFilter] = useState('')
  const [modelFilter, setModelFilter] = useState('')
  const [aiOutcomeFilter, setAiOutcomeFilter] = useState<AiOutcomeFilter>('')
  const [aiSort, setAiSort] = useState<AiSort>('confidence')
  const [adding, setAdding] = useState(false)
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [trucks, setTrucks] = useState<ReviewTruck[] | null>(null)
  const [faces, setFaces] = useState<ReviewFace[]>([])
  const [trucksError, setTrucksError] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [matched, setMatched] = useState(0)
  const runner = useFingerprintRunner()
  const saves = useReviewSaves((item) => runner.enqueue(item))
  const [coverage, setCoverage] = useState<CoverageItem[] | null>(null)
  const [coverageError, setCoverageError] = useState<string | null>(null)
  const [coverageLoading, setCoverageLoading] = useState(false)
  const [showCaughtUp, setShowCaughtUp] = useState(false)
  const [selectingAll, setSelectingAll] = useState(false)
  const requestId = useRef(0)
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

  const modelIds = useMemo(() => {
    if (modelFilter || !makeFilter) return null
    return (trucks ?? []).filter((truck) => truck.maker === makeFilter).map((truck) => truck.id)
  }, [makeFilter, modelFilter, trucks])

  const loadPhotos = useCallback(async (
    status: PhotoStatus,
    modelId: string,
    truckIds: string[] | null,
    nextCursor: string | null,
    aiOutcome: AiOutcomeFilter = aiOutcomeFilter,
    sort: AiSort = aiSort,
  ) => {
    const id = ++requestId.current
    setListLoading(true)
    setListError(null)
    try {
      const data = await binderApi<ListResponse>(listUrl(status, modelId, truckIds, nextCursor, 24, aiOutcome, sort))
      if (id !== requestId.current) return
      for (const photo of data.photos) shaById.current.set(photo.id, photo.sha256)
      setPhotos((current) => (nextCursor ? [...current, ...data.photos] : data.photos))
      setCursor(data.nextCursor)
      setCounts(data.counts)
      setMatched(data.matched)
    } catch (error) {
      if (id !== requestId.current) return
      if (!nextCursor) setPhotos([])
      setListError(messageFrom(error, 'The photos did not load.'))
    } finally {
      if (id === requestId.current) setListLoading(false)
    }
  }, [aiOutcomeFilter, aiSort])

  useEffect(() => {
    void loadTrucks()
  }, [])

  useEffect(() => {
    if (!photoTab) return
    if (makeFilter && !modelFilter && trucks === null) return
    setSelected(new Set())
    void loadPhotos(photoTab, modelFilter, modelIds, null, aiOutcomeFilter, aiSort)
  }, [photoTab, makeFilter, modelFilter, modelIds, trucks, aiOutcomeFilter, aiSort, loadPhotos])

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

  function titleFor(photo: ReviewPhoto) {
    if (!photo.truckId) return 'No model'
    const truck = (trucks ?? []).find((item) => item.id === photo.truckId)
    if (!truck) return photo.truckSlug || 'No model'
    return displayModelTitle(truck.maker, truck.title)
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
    const verb = status === 'approved' ? 'Approve' : status === 'rejected' ? 'Reject' : 'Move'
    const extra = status === 'approved' ? ' Fingerprints run in the browser and can take a while.' : ''
    const noun = ids.length === 1 ? 'photo' : 'photos'
    if (!window.confirm(`${verb} ${ids.length} ${noun}?${extra}`)) return
    setBusy(true)
    setNotice(null)
    try {
      const approvedIds: string[] = []
      for (let index = 0; index < ids.length; index += MAX_STATUS_IDS) {
        const chunk = ids.slice(index, index + MAX_STATUS_IDS)
        const result = await binderApi<{ updated: number; ids: string[]; status: PhotoStatus }>('/api/admin/photos/status', {
          method: 'POST',
          body: JSON.stringify({ ids: chunk, status }),
        })
        if (status === 'approved') approvedIds.push(...result.ids)
      }
      if (status === 'approved' && approvedIds.length > 0) {
        try {
          await fingerprint(approvedIds)
        } catch {
          setPhotos((current) =>
            current.map((item) => (approvedIds.includes(item.id) ? { ...item, status: 'approved' } : item)),
          )
          throw new Error('Approved. The fingerprint did not save. Use Finish missing fingerprints to retry.')
        }
      }
      const stayed = ids.length - approvedIds.length
      setSelected(new Set())
      setNotice(
        status === 'approved'
          ? stayed > 0
            ? `Approved ${approvedIds.length}. ${stayed} stayed pending (no model yet).`
            : `Approved ${approvedIds.length}.`
          : status === 'rejected'
            ? 'Rejected. The photo stays in Rejected.'
            : 'Moved back to pending.',
      )
      if (photoTab) await loadPhotos(photoTab, modelFilter, modelIds, null)
      else await loadPhotos('pending', '', null, null)
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

  function runStatus(ids: string[], status: PhotoStatus) {
    void updateStatus(ids, status).catch(() => undefined)
  }

  async function selectAll() {
    if (!photoTab || selectingAll) return
    setSelectingAll(true)
    setNotice(null)
    try {
      const ids: string[] = []
      let next: string | null = null
      do {
        const page: ListResponse = await binderApi(
          listUrl(photoTab, modelFilter, modelIds, next, 48, aiOutcomeFilter, aiSort),
        )
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
    if (!window.confirm('Finish missing fingerprints? This does not approve anything.')) return
    setNotice(null)
    try {
      const count = await runner.catchUp()
      setNotice(
        count === 0
          ? 'Every approved photo already has a fingerprint.'
          : `Queued ${count} photos for fingerprints.`,
      )
    } catch (error) {
      setNotice(messageFrom(error, 'The fingerprint list did not load.'))
    }
  }

  const loadMoreReview = useCallback(() => {
    if (!cursor || !photoTab) return
    void loadPhotos(photoTab, modelFilter, modelIds, cursor, aiOutcomeFilter, aiSort)
  }, [aiOutcomeFilter, aiSort, cursor, loadPhotos, modelFilter, modelIds, photoTab])

  async function fetchAllFiltered(): Promise<ReviewPhoto[]> {
    if (!photoTab) return []
    const found: ReviewPhoto[] = []
    let next: string | null = null
    do {
      const page: ListResponse = await binderApi<ListResponse>(
        listUrl(photoTab, modelFilter, modelIds, next, 48, aiOutcomeFilter, aiSort),
      )
      remember(page.photos)
      found.push(...page.photos)
      next = page.nextCursor
    } while (next && found.length < 5000)
    return found
  }

  async function bulkApproveLooksRight() {
    if (!photoTab || aiOutcomeFilter !== 'looks_right' || busy) return
    const total = matched > 0 ? matched : photos.length
    if (!window.confirm(`Approve all ${total} looks-right photos in this filter?`)) return
    setBusy(true)
    setNotice(null)
    setProgress(null)
    try {
      const items = await fetchAllFiltered()
      let approved = 0
      let stayed = 0
      for (let index = 0; index < items.length; index += 1) {
        const photo = items[index]
        if (!photo.truckId || photo.aiReview?.outcome !== 'looks_right') {
          stayed += 1
          continue
        }
        const angle = photo.aiReview.angle ?? photo.angle
        setProgress(`Approving ${index + 1} of ${items.length}`)
        await binderApi('/api/admin/photos/review', {
          method: 'POST',
          body: JSON.stringify({
            id: photo.id,
            status: 'approved',
            angle,
            faceTagId: photo.faceTagId,
          }),
        })
        runner.enqueue({ id: photo.id, sha256: photo.sha256 })
        approved += 1
      }
      setNotice(
        stayed > 0
          ? `Approved ${approved}. ${stayed} stayed pending (no model or not looks right).`
          : `Approved ${approved} photos.`,
      )
      await loadPhotos(photoTab, modelFilter, modelIds, null, aiOutcomeFilter, aiSort)
      setSelected(new Set())
    } catch (error) {
      setNotice(messageFrom(error, 'Bulk approve did not finish.'))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  async function importSanity() {
    if (busy) return
    if (!window.confirm('Import Sanity photos into Pending?')) return
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
          signal: AbortSignal.timeout(SANITY_SYNC_TIMEOUT_MS),
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
      if (photoTab) await loadPhotos(photoTab, modelFilter, modelIds, null)
      else await loadPhotos('pending', '', null, null)
    } catch (error) {
      setNotice(messageFrom(error, 'The Sanity import did not finish.'))
    } finally {
      setBusy(false)
    }
  }

  function toggle(id: string) {
    setSelected((current) => applySelection(current, 'toggle', [], id))
  }

  function startReview() {
    const first = photos[0]
    if (!photoTab || !first) return
    setReviewId(first.id)
  }

  function chooseMake(next: string) {
    setMakeFilter(next)
    setModelFilter((current) => {
      if (!current) return ''
      const truck = (trucks ?? []).find((item) => item.id === current)
      if (!truck || (next && truck.maker !== next)) return ''
      return current
    })
  }

  const makes = makeOptions((trucks ?? []).map((truck) => truck.maker))
  const reviewStart = reviewId ? photos.findIndex((photo) => photo.id === reviewId) : -1
  const reviewPhotos = reviewStart >= 0 ? photos.slice(reviewStart) : []
  const reviewMatched = reviewStart >= 0 ? Math.max(reviewPhotos.length, matched - reviewStart) : 0

  return (
    <div>
      <div className="binder-top">
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
        </div>
        <LogoutButton />
      </div>

      <section className="binder-section" aria-label="Tools">
        <h2>Tools</h2>
        <div className="binder-tools">
          <div className="binder-tool">
            <button type="button" className="btn" onClick={() => startReview()} disabled={!photoTab || photos.length === 0}>
              Start review
            </button>
            <p>Go through photos one at a time.</p>
          </div>
          <div className="binder-tool">
            <button type="button" className={adding ? 'btn btn-accent' : 'btn'} aria-pressed={adding} onClick={() => setAdding((value) => !value)}>
              Add photos
            </button>
            <p>Upload photos into Pending.</p>
          </div>
          <div className="binder-tool">
            <button type="button" className="btn" onClick={() => void importSanity()} disabled={busy}>
              Import Sanity photos
            </button>
            <p>Copy gallery images from the catalog into Pending.</p>
          </div>
          <div className="binder-tool is-quiet">
            <button type="button" className="btn btn-quiet" onClick={() => void fingerprintMissing()}>
              Finish missing fingerprints
            </button>
            <p>Makes fingerprints for approved photos that don&apos;t have one yet. Doesn&apos;t change or approve anything.</p>
          </div>
        </div>
      </section>
      {adding ? (
        trucks && trucks.length > 0 ? (
          <UploadPanel
            trucks={trucks}
            disabled={busy}
            onDone={() => {
              setNotice('Uploaded to pending.')
              setTab('pending')
              void loadPhotos('pending', modelFilter, modelIds, null)
            }}
          />
        ) : trucks && trucks.length === 0 ? (
          <p>No trucks are in the catalog.</p>
        ) : (
          <p>Loading trucks…</p>
        )
      ) : null}
      {progress ? <p role="status">{progress}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {saves.retries.length > 0 ? (
        <p className="binder-note is-bad" role="alert">
          {saves.retries.length === 1 ? '1 photo did not save.' : `${saves.retries.length} photos did not save.`}{' '}
          <button type="button" className="btn" onClick={saves.retryAll}>
            Retry
          </button>
        </p>
      ) : null}
      {trucksError ? (
        <p className="binder-note is-bad" role="alert">
          {trucksError}{' '}
          <button type="button" className="btn" onClick={() => void loadTrucks()}>
            Try again
          </button>
        </p>
      ) : null}

      {photoTab ? (
        <section className={photoTab === 'pending' && aiOutcomeFilter === 'looks_right' ? 'binder-pad' : undefined} aria-label={photoTab}>
          <div className="binder-filters">
            <label htmlFor="make-filter">Make</label>
            <select id="make-filter" value={makeFilter} onChange={(event) => chooseMake(event.target.value)}>
              <option value="">All makes</option>
              {makes.map((make) => (
                <option key={make} value={make}>
                  {make}
                </option>
              ))}
            </select>
            <ModelCombobox
              id="model-filter"
              label="Model"
              trucks={trucks ?? []}
              make={makeFilter}
              value={modelFilter}
              onChange={setModelFilter}
            />
            <label htmlFor="ai-outcome-filter">AI</label>
            <select
              id="ai-outcome-filter"
              value={aiOutcomeFilter}
              onChange={(event) => setAiOutcomeFilter(event.target.value as AiOutcomeFilter)}
            >
              <option value="">All AI</option>
              <option value="looks_right">Looks right</option>
              <option value="needs_jake">Needs you</option>
              <option value="wrong_truck">Wrong truck</option>
              <option value="reject">Reject</option>
              <option value="none">No AI note</option>
            </select>
            <label htmlFor="ai-sort">Sort</label>
            <select id="ai-sort" value={aiSort} onChange={(event) => setAiSort(event.target.value as AiSort)}>
              <option value="confidence">AI confidence</option>
              <option value="created">Newest</option>
            </select>
          </div>
          <section className="binder-section" aria-label="Selection">
            <h2>Selection</h2>
            <div className="binder-selection">
              <button type="button" className="btn" onClick={() => void selectAll()} disabled={selectingAll || busy || photos.length === 0}>
                {selectingAll ? 'Selecting' : 'Select all'}
              </button>
              <button type="button" className="btn" onClick={() => setSelected((current) => applySelection(current, 'clear', []))} disabled={selected.size === 0}>
                Clear selected
              </button>
              <span>{selected.size} selected</span>
              {photoTab !== 'approved' ? (
                <button type="button" className="btn btn-accent" disabled={busy || selected.size === 0} onClick={() => runStatus([...selected], 'approved')}>
                  Approve
                </button>
              ) : null}
              {photoTab !== 'rejected' ? (
                <button type="button" className="btn" disabled={busy || selected.size === 0} onClick={() => runStatus([...selected], 'rejected')}>
                  Reject
                </button>
              ) : null}
              {photoTab !== 'pending' ? (
                <button type="button" className="btn" disabled={busy || selected.size === 0} onClick={() => runStatus([...selected], 'pending')}>
                  Pending
                </button>
              ) : null}
            </div>
          </section>
          {listLoading && photos.length === 0 ? <p>Loading photos…</p> : null}
          {listError ? (
            <p className="binder-note is-bad" role="alert">
              {listError}{' '}
              <button
                type="button"
                className="btn"
                onClick={() => void loadPhotos(photoTab, modelFilter, modelIds, null, aiOutcomeFilter, aiSort)}
              >
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
                  {photo.aiReview ? (
                    <span className={aiBadgeClass(photo.aiReview.outcome)}>{aiBadgeLabel(photo.aiReview.outcome)}</span>
                  ) : null}
                  <label className="binder-check">
                    <input
                      type="checkbox"
                      checked={selected.has(photo.id)}
                      onChange={() => toggle(photo.id)}
                    />
                    <span className="sr-only">Select {title}</span>
                  </label>
                  <button type="button" className="binder-card-open" onClick={() => setReviewId(photo.id)}>
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
              <button
                type="button"
                className="btn"
                onClick={() => void loadPhotos(photoTab, modelFilter, modelIds, cursor, aiOutcomeFilter, aiSort)}
                disabled={listLoading}
              >
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
            const truck = (trucks ?? []).find((item) => item.id === truckId)
            setMakeFilter(truck?.maker ?? '')
            setModelFilter(truckId)
            setTab('approved')
          }}
          onRetry={() => void loadCoverage()}
        />
      ) : null}

      {photoTab === 'pending' && aiOutcomeFilter === 'looks_right' && matched > 0 ? (
        <div className="binder-bulk">
          <p>
            Filtered to AI “looks right”
            {modelFilter || makeFilter ? ' for this make/model' : ''}. {matched} photos.
          </p>
          <div className="binder-bulk-buttons">
            <button type="button" className="btn btn-accent" disabled={busy} onClick={() => void bulkApproveLooksRight()}>
              Approve all shown ({matched})
            </button>
          </div>
        </div>
      ) : null}

      {reviewId && photoTab && reviewPhotos.length > 0 ? (
        <ReviewMode
          photos={reviewPhotos}
          matched={reviewMatched}
          cursor={cursor}
          loading={listLoading}
          listError={listError}
          trucks={trucks ?? []}
          faces={faces}
          runner={runner}
          saves={saves}
          onLoadMore={loadMoreReview}
          onClose={async () => {
            await saves.settle()
            try {
              await loadPhotos(photoTab, modelFilter, modelIds, null, aiOutcomeFilter, aiSort)
            } finally {
              setReviewId(null)
            }
          }}
        />
      ) : null}
      {!reviewId && runner.busy ? (
        <div className="fp-float">
          <FingerprintPanel runner={runner} />
        </div>
      ) : null}
    </div>
  )
}
