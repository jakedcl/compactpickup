'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ClipError, embedImage } from '@/lib/clip/browser'
import {
  SCAN_CONSENT_VALUE,
  SCAN_FIELDS,
  formatScanScorePercent,
  type ScanCatalogTruck,
  type ScanMatch,
  type ScanVerdict,
} from '@/lib/binder/scan-types'
import ScanModal from './scan-modal'
import { ScanTruckSearch } from './scan-truck-search'
import { useMobileDevice } from './use-mobile-device'
import './scan.css'

const UPLOAD_LONG_EDGE = 1600
const UPLOAD_JPEG_QUALITY = 0.85

type Phase = 'idle' | 'preview' | 'working' | 'error'
type ModalStep = 'results' | 'correction' | 'consent' | 'done'
type SubmitPhase = 'idle' | 'sending' | 'sent' | 'duplicate' | 'error'

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

async function shrinkVisitorJpeg(file: Blob): Promise<File> {
  const bitmap = await createImageBitmap(file)
  try {
    if (bitmap.width < 1 || bitmap.height < 1) throw new ClipError('photo', 'Could not read the photo')
    const scale = Math.min(1, UPLOAD_LONG_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new ClipError('photo', 'Could not read the photo')
    ctx.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', UPLOAD_JPEG_QUALITY)
    })
    if (!blob || blob.size === 0) throw new ClipError('photo', 'Could not read the photo')
    return new File([blob], 'truck.jpg', { type: 'image/jpeg' })
  } finally {
    bitmap.close()
  }
}

export default function Scanner({
  trucks,
  catalogStatus,
}: {
  trucks: ScanCatalogTruck[]
  catalogStatus: 'ready' | 'error'
}) {
  const device = useMobileDevice()
  const runId = useRef(0)
  const previewRef = useRef<string | null>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const libraryInputRef = useRef<HTMLInputElement>(null)
  const chooseInputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)

  const [phase, setPhase] = useState<Phase>('idle')
  const [status, setStatus] = useState('Pick a photo, then press Scan when you are ready.')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<ScanSuccess | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalStep, setModalStep] = useState<ModalStep>('results')
  const [verdict, setVerdict] = useState<ScanVerdict | null>(null)
  const [correction, setCorrection] = useState<Correction | null>(null)
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>('idle')
  const [submitMessage, setSubmitMessage] = useState('')
  const [dragging, setDragging] = useState(false)

  const busy = phase === 'working' || submitPhase === 'sending'
  const top = result?.matches[0] ?? null
  const canFeedback = Boolean(top)

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
    clearPreviewUrl()
    setFile(null)
    setPreview(null)
    setPhase('idle')
    setResult(null)
    setModalOpen(false)
    setModalStep('results')
    setVerdict(null)
    setCorrection(null)
    setSubmitPhase('idle')
    setSubmitMessage('')
    setStatus('Pick a photo, then press Scan when you are ready.')
  }, [clearPreviewUrl])

  const pickFile = useCallback((next: File) => {
    if (!isImageFile(next)) {
      setStatus('That file is not a photo. Choose a JPEG, PNG, or WebP.')
      return
    }
    runId.current += 1
    setFile(next)
    clearPreviewUrl()
    const url = URL.createObjectURL(next)
    previewRef.current = url
    setPreview(url)
    setPhase('preview')
    setResult(null)
    setModalOpen(false)
    setModalStep('results')
    setVerdict(null)
    setCorrection(null)
    setSubmitPhase('idle')
    setSubmitMessage('')
    setStatus('Press Scan when you are ready, or replace the photo.')
  }, [clearPreviewUrl])

  const scanPhoto = useCallback(async () => {
    if (!file) return
    const id = runId.current + 1
    runId.current = id
    setPhase('working')
    setResult(null)
    setStatus('Reading the photo. The first time downloads the scanner (about 90 MB) onto this device and keeps it there.')
    try {
      const vector = await embedImage(file, (progress) => {
        if (runId.current !== id) return
        if (progress.status === 'progress' && typeof progress.progress === 'number') {
          setStatus(`Downloading the scanner. ${Math.round(progress.progress)}%`)
        }
      })
      if (runId.current !== id) return
      setStatus('Checking the library')
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ embedding: Array.from(vector) }),
      })
      const payload = await response.json().catch(() => null)
      if (runId.current !== id) return
      if (!response.ok) {
        setPhase('error')
        setStatus(messageFrom(payload, 'Signal lost. The scanner did not answer.'))
        return
      }
      const parsed = readScan(payload)
      if (!parsed) {
        setPhase('error')
        setStatus('Signal lost. The scanner did not answer.')
        return
      }
      setResult(parsed)
      setPhase('preview')
      setModalOpen(true)
      setModalStep('results')
      setVerdict(null)
      setCorrection(null)
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
    }
  }, [file])

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
      if (item && isImageFile(item)) pickFile(item)
    }
    function onPaste(event: ClipboardEvent) {
      const item = [...(event.clipboardData?.items ?? [])].find((row) => row.type.startsWith('image/'))
      const blob = item?.getAsFile()
      if (blob) {
        event.preventDefault()
        pickFile(blob)
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
    if (next) pickFile(next)
  }

  function onLibraryChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0]
    event.target.value = ''
    if (next) pickFile(next)
  }

  function onChooseChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0]
    event.target.value = ''
    if (next) pickFile(next)
  }

  async function sendConsentingPhoto() {
    if (!file || !top || !verdict) return
    setSubmitPhase('sending')
    setSubmitMessage('Sending')
    let upload: File
    try {
      upload = await shrinkVisitorJpeg(file)
    } catch (error) {
      setSubmitPhase('error')
      setSubmitMessage(clientMessage(error))
      return
    }
    const body = new FormData()
    body.set(SCAN_FIELDS.photo, upload)
    body.set(SCAN_FIELDS.consent, SCAN_CONSENT_VALUE)
    body.set(SCAN_FIELDS.verdict, verdict)
    body.set(SCAN_FIELDS.guessedTruckId, top.id)
    body.set(SCAN_FIELDS.guessedTruckSlug, top.slug)
    if (verdict === 'wrong' && correction?.kind === 'catalog') {
      body.set(SCAN_FIELDS.correctedTruckId, correction.truck.id)
      body.set(SCAN_FIELDS.correctedTruckSlug, correction.truck.slug)
      body.set(SCAN_FIELDS.correctedTruckCustomText, '')
    } else if (verdict === 'wrong' && correction?.kind === 'custom') {
      body.set(SCAN_FIELDS.correctedTruckId, '')
      body.set(SCAN_FIELDS.correctedTruckSlug, '')
      body.set(SCAN_FIELDS.correctedTruckCustomText, correction.text)
    } else {
      body.set(SCAN_FIELDS.correctedTruckId, '')
      body.set(SCAN_FIELDS.correctedTruckSlug, '')
      body.set(SCAN_FIELDS.correctedTruckCustomText, '')
    }
    try {
      const response = await fetch('/api/scan/submit', { method: 'POST', body })
      const payload = await response.json().catch(() => null)
      if (response.status === 429 || !response.ok) {
        setSubmitPhase('error')
        setSubmitMessage(messageFrom(payload, 'Signal lost. The photo was not stored.'))
        return
      }
      const outcome = payload && typeof payload === 'object' ? (payload as { outcome?: unknown }).outcome : null
      if (outcome === 'duplicate') {
        setSubmitPhase('duplicate')
        setSubmitMessage('That photo is already in the library. Your note was saved.')
        setModalStep('done')
        return
      }
      if (outcome === 'inserted') {
        setSubmitPhase('sent')
        setSubmitMessage('Saved as Pending. It is not used for matching until reviewed.')
        setModalStep('done')
        return
      }
      setSubmitPhase('error')
      setSubmitMessage('Signal lost. The photo was not stored.')
    } catch {
      setSubmitPhase('error')
      setSubmitMessage('Signal lost. The photo was not stored.')
    }
  }

  function closeModal() {
    setModalOpen(false)
    setModalStep('results')
  }

  const modalTitle =
    modalStep === 'results'
      ? 'Scan results'
      : modalStep === 'correction'
        ? 'Which truck was it?'
        : modalStep === 'consent'
          ? 'Teach the scanner'
          : 'All set'

  return (
    <div className="scan-shell">
      {dragging ? (
        <div className="scan-drop-overlay" aria-hidden="true">
          <p>Drop photo</p>
        </div>
      ) : null}
      <p className="scan-note">The photo stays on this device until you choose to send a copy.</p>
      <div className="scan-preview">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="The photo you chose" />
        ) : (
          <p>No photo yet</p>
        )}
      </div>
      <div className="scan-actions">
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
        ) : (
          <>
            <button
              type="button"
              className="btn btn-accent"
              disabled={busy}
              onClick={() => chooseInputRef.current?.click()}
            >
              Choose photo
            </button>
            <input
              ref={chooseInputRef}
              type="file"
              accept="image/*"
              className="scan-hidden-input"
              tabIndex={-1}
              onChange={onChooseChange}
            />
          </>
        )}
      </div>
      {file ? (
        <div className="scan-preview-actions">
          <button type="button" className="btn btn-accent" disabled={busy} onClick={() => void scanPhoto()}>
            {phase === 'working' ? 'Scanning…' : 'Scan'}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => {
              if (device === 'mobile') libraryInputRef.current?.click()
              else chooseInputRef.current?.click()
            }}
          >
            Replace photo
          </button>
        </div>
      ) : null}
      <p className="scan-status" role="status">
        {status}
      </p>
      {phase === 'error' && file ? (
        <button type="button" className="btn" onClick={() => void scanPhoto()}>
          Try again
        </button>
      ) : null}
      {device === 'desktop' && !file ? (
        <p className="scan-hint">Drop a photo anywhere on this page, or paste from the clipboard.</p>
      ) : null}

      {modalOpen ? (
        <ScanModal title={modalTitle} onClose={closeModal}>
          {modalStep === 'results' && result ? (
            <div className="scan-modal-panel">
              {result.state === 'guess' && result.matches.length > 0 ? (
                <p className="scan-not-sure" role="status">
                  Not sure. The strongest match is only {formatScanScorePercent(result.matches[0].score)}.
                </p>
              ) : null}
              {result.matches.length > 0 ? (
                <ol className="scan-results">
                  {result.matches.slice(0, 2).map((match, index) => (
                    <li key={match.id}>
                      <Link href={match.href} className="card scan-hit">
                        <span className="card-copy">
                          <span className="card-label">
                            {index === 0 ? (result.state === 'match' ? 'Closest' : 'Closest guess') : 'Next closest'}
                          </span>
                          <span className="card-label">{match.maker}</span>
                          <span className="card-title">{match.title}</span>
                          {match.years ? <span>{match.years}</span> : null}
                          <span className="meta">Match {formatScanScorePercent(match.score)}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              ) : (
                <p role="status">Not sure yet. There is no truck page close enough to show.</p>
              )}
              {canFeedback ? (
                <>
                  <h2 className="scan-modal-heading">Is this correct?</h2>
                  <div className="scan-choice scan-choice-triple">
                    <button
                      type="button"
                      className="btn btn-accent"
                      onClick={() => {
                        setVerdict('right')
                        setModalStep('consent')
                      }}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setVerdict('wrong')
                        setModalStep('correction')
                      }}
                    >
                      No
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setVerdict('idk')
                        setModalStep('consent')
                      }}
                    >
                      IDK
                    </button>
                  </div>
                </>
              ) : (
                <button type="button" className="btn" onClick={resetSession}>
                  Scan another
                </button>
              )}
            </div>
          ) : null}

          {modalStep === 'correction' ? (
            <div className="scan-modal-panel">
              {catalogStatus === 'error' ? (
                <p role="status">The truck list did not load. Try again later.</p>
              ) : (
                <ScanTruckSearch
                  trucks={trucks}
                  disabled={busy}
                  onPick={(pick) => {
                    if (pick.kind === 'catalog') setCorrection({ kind: 'catalog', truck: pick.truck })
                    else setCorrection({ kind: 'custom', text: pick.text })
                    setModalStep('consent')
                  }}
                />
              )}
            </div>
          ) : null}

          {modalStep === 'consent' ? (
            <div className="scan-modal-panel">
              <h2 className="scan-modal-heading">Can we use this photo to teach the scanner?</h2>
              <p className="scan-consent-copy">
                A compressed copy goes to Pending for review. It is never published or used for matching until approved.
              </p>
              <div className="scan-choice">
                <button
                  type="button"
                  className="btn btn-accent"
                  disabled={busy || (verdict === 'wrong' && !correction)}
                  onClick={() => void sendConsentingPhoto()}
                >
                  Yes
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => {
                    setModalStep('done')
                    setSubmitMessage('Nothing was stored.')
                  }}
                >
                  No
                </button>
              </div>
              {submitMessage && submitPhase !== 'idle' ? <p role="status">{submitMessage}</p> : null}
            </div>
          ) : null}

          {modalStep === 'done' ? (
            <div className="scan-modal-panel">
              <p role="status">
                {submitMessage || (submitPhase === 'sent' ? 'Photo saved to Pending.' : 'Thanks for the report.')}
              </p>
              <button type="button" className="btn btn-accent" onClick={resetSession}>
                Scan another
              </button>
            </div>
          ) : null}
        </ScanModal>
      ) : null}
    </div>
  )
}
