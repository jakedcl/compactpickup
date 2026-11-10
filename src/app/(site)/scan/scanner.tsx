'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { ClipError, embedImage } from '@/lib/clip/browser'
import { SCAN_CONSENT_VALUE, SCAN_FIELDS, type ScanCatalogTruck, type ScanMatch } from '@/lib/binder/scan-types'
import './scan.css'

const UPLOAD_LONG_EDGE = 1600
const UPLOAD_JPEG_QUALITY = 0.85

type Phase = 'idle' | 'working' | 'results' | 'error'
type SubmitPhase = 'idle' | 'sending' | 'sent' | 'duplicate' | 'error'
type Verdict = 'right' | 'wrong'

type ScanSuccess = {
  state: 'learning' | 'match' | 'guess'
  matches: ScanMatch[]
}

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

function messageFrom(value: unknown, fallback: string): string {
  if (!value || typeof value !== 'object') return fallback
  const message = (value as { message?: unknown }).message
  return typeof message === 'string' && message.length > 0 && message.length < 200 ? message : fallback
}

export default function Scanner({
  trucks,
  catalogStatus,
}: {
  trucks: ScanCatalogTruck[]
  catalogStatus: 'ready' | 'error'
}) {
  const runId = useRef(0)
  const previewRef = useRef<string | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [status, setStatus] = useState('The photo stays on this phone until you choose to send a copy.')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<ScanSuccess | null>(null)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [correctionId, setCorrectionId] = useState('')
  const [filter, setFilter] = useState('')
  const [consent, setConsent] = useState(false)
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>('idle')
  const [submitMessage, setSubmitMessage] = useState('')

  useEffect(() => {
    const revoke = () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    }
    window.addEventListener('pagehide', revoke)
    return () => window.removeEventListener('pagehide', revoke)
  }, [])

  const correction = trucks.find((truck) => truck.id === correctionId) ?? null
  const shown = useMemo(() => {
    const query = filter.trim().toLowerCase()
    return trucks.filter((truck) => {
      if (truck.id === correctionId) return true
      if (!query) return true
      return `${truck.maker} ${truck.title} ${truck.years}`.toLowerCase().includes(query)
    })
  }, [trucks, filter, correctionId])

  const groups = useMemo(() => {
    const map = new Map<string, ScanCatalogTruck[]>()
    for (const truck of shown) {
      const list = map.get(truck.maker) ?? []
      list.push(truck)
      map.set(truck.maker, list)
    }
    return [...map.entries()]
  }, [shown])

  const busy = phase === 'working' || submitPhase === 'sending'
  const top = result?.matches[0]
  const canSend = Boolean(
    file
    && top
    && consent
    && submitPhase !== 'sending'
    && submitPhase !== 'sent'
    && submitPhase !== 'duplicate'
    && (verdict === 'right' || (verdict === 'wrong' && correction && catalogStatus === 'ready')),
  )

  async function run(next: File) {
    const id = runId.current + 1
    runId.current = id
    setFile(next)
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    const url = URL.createObjectURL(next)
    previewRef.current = url
    setPreview(url)
    setPhase('working')
    setResult(null)
    setVerdict(null)
    setCorrectionId('')
    setConsent(false)
    setSubmitPhase('idle')
    setSubmitMessage('')
    setStatus('Reading the photo. The first time downloads the scanner (about 90 MB) onto this phone and keeps it there.')
    try {
      const vector = await embedImage(next, (progress) => {
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
      setPhase('results')
      if (parsed.state === 'learning') {
        setStatus('The scanner is still learning. Reference photos are not ready yet, so there is no match to show.')
      } else if (parsed.matches.length === 0) {
        setStatus('Not sure. The closest photos are not on a truck page yet.')
      } else if (parsed.state === 'guess') {
        setStatus('Not sure. Here is the closest guess.')
      } else {
        setStatus('Closest match.')
      }
    } catch (error) {
      if (runId.current !== id) return
      setPhase('error')
      setStatus(clientMessage(error))
    }
  }

  function onPhoto(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0]
    event.target.value = ''
    if (next) void run(next)
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file || !top || !verdict || !canSend) return
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
    if (verdict === 'wrong' && correction) {
      body.set(SCAN_FIELDS.correctedTruckId, correction.id)
      body.set(SCAN_FIELDS.correctedTruckSlug, correction.slug)
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
        setSubmitMessage('That photo is already in the library. Your note was saved. The stored photo was left as it was.')
        return
      }
      if (outcome === 'inserted') {
        setSubmitPhase('sent')
        setSubmitMessage('Sent. It waits in Pending until it is reviewed, and it is not used for matching yet.')
        return
      }
      setSubmitPhase('error')
      setSubmitMessage('Signal lost. The photo was not stored.')
    } catch {
      setSubmitPhase('error')
      setSubmitMessage('Signal lost. The photo was not stored.')
    }
  }

  return (
    <div>
      <p className="scan-note">The photo stays on this phone until you choose to send a copy.</p>
      <div className="scan-preview">
        {preview ? (
          // Local camera preview. next/image does not serve blob URLs.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="The photo you chose" />
        ) : (
          <p>No photo yet</p>
        )}
      </div>
      <div className="scan-actions">
        <label className={`btn btn-accent scan-capture${busy ? ' is-disabled' : ''}`}>
          Take photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={busy}
            onChange={onPhoto}
          />
        </label>
        <label className={`btn scan-capture${busy ? ' is-disabled' : ''}`}>
          Choose photo
          <input type="file" accept="image/*" disabled={busy} onChange={onPhoto} />
        </label>
      </div>
      <p className="scan-status" role="status">{status}</p>
      {phase === 'error' && file ? (
        <button type="button" className="btn" onClick={() => void run(file)}>Try again</button>
      ) : null}
      {phase === 'results' && result && result.matches.length > 0 ? (
        <ol className="scan-results">
          {result.matches.map((match, index) => (
            <li key={match.id}>
              <Link href={match.href} className="card scan-hit">
                <span className="card-copy">
                  <span className="card-label">
                    {index === 0 ? (result.state === 'match' ? 'Closest' : 'Closest guess') : 'Next closest'}
                  </span>
                  <span className="card-label">{match.maker}</span>
                  <span className="card-title">{match.title}</span>
                  {match.years ? <span>{match.years}</span> : null}
                  <span className="meta">Score {match.score.toFixed(2)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      ) : null}
      {phase === 'results' && top ? (
        <form className="scan-feedback" onSubmit={onSubmit}>
          <h2>Was this the right truck?</h2>
          <div className="scan-choice">
            <button
              type="button"
              className={verdict === 'right' ? 'btn btn-accent' : 'btn'}
              aria-pressed={verdict === 'right'}
              onClick={() => setVerdict('right')}
            >
              Right
            </button>
            <button
              type="button"
              className={verdict === 'wrong' ? 'btn btn-accent' : 'btn'}
              aria-pressed={verdict === 'wrong'}
              onClick={() => setVerdict('wrong')}
            >
              Wrong
            </button>
          </div>
          {verdict === 'wrong' ? (
            catalogStatus === 'error' ? (
              <p role="status">The truck list did not load, so a correction cannot be picked.</p>
            ) : (
              <label className="scan-label">
                Which truck is it?
                <input
                  className="scan-field"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.preventDefault()
                  }}
                  placeholder="Ranger, Hilux"
                  autoComplete="off"
                  enterKeyHint="search"
                />
                <select
                  className="scan-field"
                  value={correctionId}
                  onChange={(event) => setCorrectionId(event.target.value)}
                >
                  <option value="">Choose a truck</option>
                  {groups.map(([maker, list]) => (
                    <optgroup key={maker} label={maker}>
                      {list.map((truck) => (
                        <option key={truck.id} value={truck.id}>
                          {truck.title}{truck.years ? ` ${truck.years}` : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            )
          ) : null}
          <label className="scan-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>
              I took this photo, or I have permission to share it. Store one compressed copy for review.
              If it is approved, it can teach the scanner. It is not published before that.
              The report also stores this network address to limit spam.
            </span>
          </label>
          <button type="submit" className="btn btn-accent" disabled={!canSend}>
            {submitPhase === 'sending' ? 'Sending' : 'Send photo'}
          </button>
          {submitMessage ? <p role="status">{submitMessage}</p> : null}
        </form>
      ) : null}
    </div>
  )
}
