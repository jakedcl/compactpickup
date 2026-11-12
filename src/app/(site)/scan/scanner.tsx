'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import ScanSavePhotoButton from '@/components/scan/ScanSavePhotoButton'
import { useScanSession } from '@/components/scan/ScanSessionProvider'
import VhsProgressBar from '@/components/ui/VhsProgressBar'
import {
  ClipError,
  EMBED_PIPELINE,
  embedPrepared,
  prefetchSiglip,
  preparePhotoCrop,
  type PreparedPhoto,
} from '@/lib/clip/browser'
import { clipProgressPercent, isDfineProgress, isSiglipProgress } from '@/lib/clip/progress'
import {
  formatScanScorePercent,
  visibleScanMatches,
  type ScanCatalogTruck,
  type ScanMatch,
  type ScanVerdict,
} from '@/lib/binder/scan-types'
import {
  correctionFromGuessIndex,
  shouldAutoScanAfterCrop,
  verdictFromGuessIndex,
  visitorProgressLabel,
  visitorProgressValue,
  visitorProgressVisible,
} from '@/lib/scan/visitor-session'
import { shouldOfferSavePhoto, type VisitorPhotoSource } from '@/lib/scan/visitor-save-photo'
import ScanModal from './scan-modal'
import { ScanTruckSearch } from './scan-truck-search'
import { useMobileDevice } from './use-mobile-device'
import './scan.css'

type Phase = 'idle' | 'preview' | 'working' | 'error'
type CropPhase = 'idle' | 'cropping' | 'ready' | 'error'
type ModalStep = 'results' | 'correction'

type ScanSuccess = {
  state: 'learning' | 'match' | 'guess'
  matches: ScanMatch[]
}

type Correction =
  | { kind: 'catalog'; truck: ScanCatalogTruck }
  | { kind: 'custom'; text: string }

function isMatch(value: unknown): value is ScanMatch {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<ScanMatch>
  return Boolean(
    typeof row.id === 'string'
    && typeof row.slug === 'string'
    && typeof row.title === 'string'
    && typeof row.maker === 'string'
    && typeof row.href === 'string'
    && row.href.startsWith('/')
    && typeof row.years === 'string'
    && typeof row.score === 'number'
    && Number.isFinite(row.score),
  )
}

function readScan(value: unknown): ScanSuccess | null {
  if (!value || typeof value !== 'object') return null
  const row = value as { ok?: unknown; state?: unknown; matches?: unknown }
  if (row.ok !== true) return null
  if (row.state !== 'learning' && row.state !== 'match' && row.state !== 'guess') return null
  if (!Array.isArray(row.matches) || !row.matches.every(isMatch)) return null
  return { state: row.state, matches: row.matches }
}

function clientMessage(error: unknown): string {
  if (error instanceof ClipError) {
    if (error.code === 'photo') return 'That photo could not be read. Try another.'
    if (error.code === 'model') return 'The scanner could not read that photo. Try another.'
  }
  return 'The scanner did not load. Check the connection and try the photo again.'
}

function messageFrom(value: unknown, fallback: string): string {
  if (!value || typeof value !== 'object') return fallback
  const message = (value as { message?: unknown }).message
  return typeof message === 'string' && message.length > 0 && message.length < 200 ? message : fallback
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)
}

async function canvasPreviewUrl(canvas: HTMLCanvasElement): Promise<string> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.92)
  })
  if (!blob) throw new ClipError('photo', 'Could not read the photo')
  return URL.createObjectURL(blob)
}

export default function Scanner({
  trucks,
  catalogStatus,
}: {
  trucks: ScanCatalogTruck[]
  catalogStatus: 'ready' | 'error'
}) {
  const router = useRouter()
  const { beginSession, clearSession } = useScanSession()
  const device = useMobileDevice()
  const runId = useRef(0)
  const cropRunId = useRef(0)
  const previewRef = useRef<string | null>(null)
  const preparedRef = useRef<PreparedPhoto | null>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const libraryInputRef = useRef<HTMLInputElement>(null)
  const chooseInputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)

  const [phase, setPhase] = useState<Phase>('idle')
  const [cropPhase, setCropPhase] = useState<CropPhase>('idle')
  const [cropProgress, setCropProgress] = useState(0)
  const [scanProgress, setScanProgress] = useState(0)
  const [status, setStatus] = useState('Pick a photo to scan.')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<ScanSuccess | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalStep, setModalStep] = useState<ModalStep>('results')
  const [dragging, setDragging] = useState(false)
  const [photoSource, setPhotoSource] = useState<VisitorPhotoSource | null>(null)
  const [photoSaved, setPhotoSaved] = useState(false)

  const scanning = phase === 'working'
  const cropBusy = cropPhase === 'cropping'
  const cropError = cropPhase === 'error'
  const busy = scanning || cropBusy
  const top = result?.matches[0] ?? null
  const canFeedback = Boolean(top)
  const topCatalog = top
    ? { id: top.id, slug: top.slug, title: top.title, maker: top.maker, href: top.href, years: top.years }
    : null

  const clearPreviewUrl = useCallback(() => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = null
  }, [])

  useEffect(() => {
    const revoke = () => clearPreviewUrl()
    window.addEventListener('pagehide', revoke)
    return () => window.removeEventListener('pagehide', revoke)
  }, [clearPreviewUrl])

  const resetSession = useCallback(() => {
    runId.current += 1
    cropRunId.current += 1
    preparedRef.current = null
    clearPreviewUrl()
    setFile(null)
    setPreview(null)
    setPhase('idle')
    setCropPhase('idle')
    setCropProgress(0)
    setScanProgress(0)
    setResult(null)
    setModalOpen(false)
    setModalStep('results')
    setPhotoSource(null)
    setPhotoSaved(false)
    setStatus('Pick a photo to scan.')
  }, [clearPreviewUrl])

  const pickFile = useCallback((next: File, source: VisitorPhotoSource) => {
    if (!isImageFile(next)) {
      setStatus('That file is not a photo. Choose a JPEG, PNG, or WebP.')
      return
    }
    clearSession()
    runId.current += 1
    cropRunId.current += 1
    preparedRef.current = null
    clearPreviewUrl()
    setFile(next)
    setPreview(null)
    setPhase('preview')
    setCropPhase('cropping')
    setCropProgress(4)
    setScanProgress(0)
    setResult(null)
    setModalOpen(false)
    setModalStep('results')
    setPhotoSource(source)
    setPhotoSaved(false)
    setStatus('Cropping and scanning your photo…')
  }, [clearPreviewUrl, clearSession])

  useEffect(() => {
    if (!file) return undefined
    const blob: Blob = file
    const id = (cropRunId.current += 1)
    let cancelled = false
    let creep: ReturnType<typeof setInterval> | null = null
    creep = setInterval(() => {
      setCropProgress((value) => Math.min(94, value + (value < 40 ? 1.5 : 0.4)))
    }, 180)

    async function run() {
      try {
        const prepared = await preparePhotoCrop(blob, (progress) => {
          if (cancelled || cropRunId.current !== id) return
          if (!isDfineProgress(progress)) return
          const n = clipProgressPercent(progress)
          if (n != null) setCropProgress((value) => Math.max(value, Math.min(90, 6 + n * 0.84)))
          if (progress.status === 'ready') setCropProgress((value) => Math.max(value, 72))
        })
        if (cancelled || cropRunId.current !== id) return
        if (creep) clearInterval(creep)
        setCropProgress(100)
        preparedRef.current = prepared
        clearPreviewUrl()
        const url = await canvasPreviewUrl(prepared.previewCanvas)
        previewRef.current = url
        setPreview(url)
        setCropPhase('ready')
        setStatus('Scanning your photo…')
        prefetchSiglip()
      } catch (error) {
        if (cancelled || cropRunId.current !== id) return
        if (creep) clearInterval(creep)
        setCropPhase('error')
        setPhase('error')
        setStatus(clientMessage(error))
      }
    }
    void run()
    return () => {
      cancelled = true
      if (creep) clearInterval(creep)
    }
  }, [file, clearPreviewUrl])

  const scanPhoto = useCallback(async () => {
    const prepared = preparedRef.current
    if (!prepared || !file) return
    const id = (runId.current += 1)
    setPhase('working')
    setResult(null)
    setScanProgress(8)
    const creep: ReturnType<typeof setInterval> | null = setInterval(() => {
      setScanProgress((value) => Math.min(97, value + 0.35))
    }, 120)
    try {
      const vector = await embedPrepared(prepared, (progress) => {
        if (runId.current !== id) return
        if (!isSiglipProgress(progress)) return
        const n = clipProgressPercent(progress)
        if (n != null) setScanProgress((value) => Math.max(value, Math.min(70, 8 + n * 0.62)))
        if (progress.status === 'ready') setScanProgress((value) => Math.max(value, 68))
      })
      if (runId.current !== id) return
      setScanProgress((value) => Math.max(value, 76))
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ embedding: Array.from(vector), pipeline: EMBED_PIPELINE }),
      })
      if (runId.current !== id) return
      setScanProgress((value) => Math.max(value, 92))
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setPhase('error')
        const stale =
          payload &&
          typeof payload === 'object' &&
          (payload as { reload?: unknown }).reload === true
        const fallback = stale
          ? 'This tab is still on the old scanner. Reload the page and try again.'
          : 'Signal lost. The scanner did not answer.'
        setStatus(messageFrom(payload, fallback))
        return
      }
      const parsed = readScan(payload)
      if (!parsed) {
        setPhase('error')
        setStatus('Signal lost. The scanner did not answer.')
        return
      }
      setScanProgress(100)
      setResult(parsed)
      setPhase('preview')
      setModalOpen(true)
      setModalStep('results')
      if (parsed.state === 'learning') {
        setStatus('The scanner is still learning. Reference photos are not ready yet.')
      } else if (parsed.matches.length === 0) {
        setStatus('Not sure. The closest photos are not on a truck page yet.')
      } else if (parsed.state === 'guess') {
        setStatus(`Not sure. Closest guess is ${formatScanScorePercent(parsed.matches[0].score)}.`)
      } else {
        setStatus(`Closest match at ${formatScanScorePercent(parsed.matches[0].score)}.`)
      }
    } catch (error) {
      if (runId.current !== id) return
      setPhase('error')
      setStatus(clientMessage(error))
    } finally {
      if (creep) clearInterval(creep)
    }
  }, [file])

  useEffect(() => {
    if (
      !shouldAutoScanAfterCrop({
        cropPhase,
        hasFile: Boolean(file),
        scanning,
        hasResult: Boolean(result),
        cropError,
      })
    ) {
      return
    }
    void scanPhoto()
  }, [cropPhase, file, scanning, result, cropError, scanPhoto])

  function handoffToIsland(verdict: ScanVerdict, correction: Correction | null) {
    if (!file || !topCatalog || !preview) return
    const previewUrl = preview
    previewRef.current = null
    setPreview(null)
    beginSession({
      file,
      previewUrl,
      verdict,
      correction,
      topGuess: topCatalog,
      fromCameraCapture: photoSource === 'camera',
      photoSaved,
    })
  }

  function pickGuess(match: ScanMatch, index: number) {
    if (!topCatalog) return
    const verdict = verdictFromGuessIndex(index)
    const correction = correctionFromGuessIndex(index, match)
    handoffToIsland(verdict, correction)
    setModalOpen(false)
    router.push(match.href)
  }

  useEffect(() => {
    if (device !== 'desktop') return undefined
    function hasFiles(event: DragEvent): boolean {
      return [...(event.dataTransfer?.types ?? [])].includes('Files')
    }
    function onDragEnter(event: DragEvent) {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepth.current += 1
      setDragging(true)
    }
    function onDragOver(event: DragEvent) {
      if (!hasFiles(event)) return
      event.preventDefault()
    }
    function onDragLeave(event: DragEvent) {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    }
    function onDrop(event: DragEvent) {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      const item = event.dataTransfer?.files?.[0]
      if (item && isImageFile(item)) pickFile(item, 'drop')
    }
    function onPaste(event: ClipboardEvent) {
      const item = [...(event.clipboardData?.items ?? [])].find((row) => row.type.startsWith('image/'))
      const blob = item?.getAsFile()
      if (blob) {
        event.preventDefault()
        pickFile(blob, 'paste')
      }
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('paste', onPaste)
    }
  }, [device, pickFile])

  function onCameraChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0]
    event.target.value = ''
    if (next) pickFile(next, 'camera')
  }

  function onLibraryChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0]
    event.target.value = ''
    if (next) pickFile(next, 'library')
  }

  function onChooseChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0]
    event.target.value = ''
    if (next) pickFile(next, 'desktop')
  }

  function dismissModal() {
    resetSession()
  }

  const modalTitle = modalStep === 'results' ? 'Scan results' : 'Which truck was it?'

  const progressVisible = visitorProgressVisible(cropBusy, scanning)
  const progressLabel = visitorProgressLabel(scanning)
  const progressValue = visitorProgressValue(scanning, cropProgress, scanProgress)
  const offerSave = Boolean(file && photoSource && shouldOfferSavePhoto(photoSource) && !photoSaved)

  function modalPhotoActions() {
    return (
      <div className="scan-modal-photo-actions">
        <button type="button" className="btn" onClick={dismissModal}>
          Replace photo
        </button>
        {offerSave && file ? (
          <ScanSavePhotoButton file={file} onSaved={() => setPhotoSaved(true)} />
        ) : null}
      </div>
    )
  }

  return (
    <div className="scan-shell">
      {dragging ? (
        <div className="scan-drop-overlay" aria-hidden="true">
          <p>Drop photo</p>
        </div>
      ) : null}
      <div className="scan-preview">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Cropped truck preview" />
        ) : (
          <p>{cropBusy ? 'Cropping' : 'No photo yet'}</p>
        )}
      </div>
      <VhsProgressBar label={progressLabel} value={progressValue} visible={progressVisible} />
      {!file ? (
        <div className={`scan-actions${device === 'desktop' ? ' is-single' : ''}`}>
          {device === 'unknown' ? (
            <p className="scan-device-wait" role="status">
              Preparing camera controls
            </p>
          ) : device === 'mobile' ? (
            <>
              <button
                type="button"
                className="btn btn-accent"
                disabled={busy}
                onClick={() => cameraInputRef.current?.click()}
              >
                Take photo
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => libraryInputRef.current?.click()}>
                Choose photo
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-accent"
              disabled={busy}
              onClick={() => chooseInputRef.current?.click()}
            >
              Choose photo
            </button>
          )}
        </div>
      ) : null}
      {device === 'mobile' ? (
        <>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="scan-hidden-input"
            tabIndex={-1}
            onChange={onCameraChange}
          />
          <input
            ref={libraryInputRef}
            type="file"
            accept="image/*"
            className="scan-hidden-input"
            tabIndex={-1}
            onChange={onLibraryChange}
          />
        </>
      ) : device === 'desktop' ? (
        <input
          ref={chooseInputRef}
          type="file"
          accept="image/*"
          className="scan-hidden-input"
          tabIndex={-1}
          onChange={onChooseChange}
        />
      ) : null}
      {(cropError || phase === 'error') && file ? (
        <div className="scan-preview-actions">
          <button type="button" className="btn" disabled={busy} onClick={resetSession}>
            Replace photo
          </button>
        </div>
      ) : null}
      <p className="scan-status" role="status">
        {status}
      </p>
      {phase === 'error' && file && cropPhase === 'ready' ? (
        <button type="button" className="btn" onClick={() => void scanPhoto()} disabled={busy}>
          Try again
        </button>
      ) : null}
      {device === 'desktop' && !file ? (
        <p className="scan-hint">Drop a photo anywhere on this page, or paste from the clipboard.</p>
      ) : null}

      {modalOpen ? (
        <ScanModal title={modalTitle} onClose={dismissModal}>
          {modalStep === 'results' && result ? (
            <div className="scan-modal-panel">
              {preview ? (
                <div className="scan-modal-thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Cropped truck preview" />
                </div>
              ) : null}
              {modalPhotoActions()}
              {result.matches.length > 0 ? (
                <ol className="scan-results">
                  {visibleScanMatches(result.matches).map((match, index) => (
                    <li key={match.id}>
                      <button type="button" className="scan-guess" onClick={() => pickGuess(match, index)}>
                        <span className="card scan-hit">
                          <span className="card-copy">
                            <span className="card-label">
                              {index === 0 ? (result.state === 'match' ? 'Closest' : 'Closest guess') : 'Next closest'}
                            </span>
                            <span className="card-label">{match.maker}</span>
                            <span className="card-title">{match.title}</span>
                            {match.years ? <span>{match.years}</span> : null}
                            <span className="meta">Match {formatScanScorePercent(match.score)}</span>
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <p role="status">Not sure yet. There is no truck page close enough to show.</p>
              )}
              {canFeedback ? (
                <>
                  <p className="scan-pick-prompt">Tap the right truck, or:</p>
                  <div className="scan-choice">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setModalStep('correction')}
                    >
                      Wrong
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        handoffToIsland('idk', null)
                        setModalOpen(false)
                      }}
                    >
                      Not sure
                    </button>
                  </div>
                </>
              ) : (
                <button type="button" className="btn" onClick={dismissModal}>
                  Scan another
                </button>
              )}
            </div>
          ) : null}

          {modalStep === 'correction' ? (
            <div className="scan-modal-panel">
              {preview ? (
                <div className="scan-modal-thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Cropped truck preview" />
                </div>
              ) : null}
              <button type="button" className="btn" onClick={dismissModal}>
                Replace photo
              </button>
              {catalogStatus === 'error' ? (
                <p role="status">The truck list did not load. Try again later.</p>
              ) : (
                <ScanTruckSearch
                  trucks={trucks}
                  disabled={busy}
                  onPick={(pick) => {
                    if (pick.kind === 'catalog') {
                      handoffToIsland('wrong', { kind: 'catalog', truck: pick.truck })
                      setModalOpen(false)
                      router.push(pick.truck.href)
                    } else {
                      handoffToIsland('wrong', { kind: 'custom', text: pick.text })
                      setModalOpen(false)
                    }
                  }}
                />
              )}
            </div>
          ) : null}
        </ScanModal>
      ) : null}
    </div>
  )
}
