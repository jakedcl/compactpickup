'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { prepareScanImage } from '@/lib/scan/clientImage'
import type { ScanIdentifyResult, ScanMatch } from '@/lib/scan/types'
import '@/components/scan.css'

type Phase = 'idle' | 'camera' | 'preview' | 'loading' | 'done'

function confidenceLabel(value: number): string {
  return `${Math.round(value * 100)}% match`
}

function MatchList({ matches, label }: { matches: ScanMatch[]; label?: string }) {
  if (!matches.length) return null
  return (
    <>
      {label ? <p className="scan-status">{label}</p> : null}
      <ul className="scan-results">
        {matches.map((match, index) => (
          <li key={`${match.truckId}-${index}`} className="scan-result">
            <Link href={match.href}>
              <span className="scan-confidence">{confidenceLabel(match.confidence)}</span>
              <span className="scan-result-title">{match.maker} {match.model}</span>
              <span className="scan-result-meta">
                {[match.generation, match.years].filter(Boolean).join(' · ')}
              </span>
              {match.reason ? <span className="scan-alt">{match.reason}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

export default function ScanScreen() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ScanIdentifyResult | null>(null)
  const [cameraSupported, setCameraSupported] = useState(true)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    const video = videoRef.current
    if (video) video.srcObject = null
  }, [])

  useEffect(() => () => {
    stopCamera()
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl, stopCamera])

  const identifyBlob = useCallback(async (blob: Blob) => {
    setError(null)
    setResult(null)
    setPhase('loading')
    try {
      const prepared = await prepareScanImage(blob)
      const response = await fetch('/api/scan/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: prepared.base64,
          mimeType: prepared.mimeType,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        const message = payload && typeof payload.error === 'string' ? payload.error : 'Scan failed.'
        throw new Error(message)
      }
      setResult(payload as ScanIdentifyResult)
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed.')
      setPhase('preview')
    }
  }, [])

  const startCamera = useCallback(async () => {
    setError(null)
    setResult(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraSupported(false)
      fileRef.current?.click()
      return
    }
    try {
      stopCamera()
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await video.play()
      }
      setPhase('camera')
    } catch {
      setCameraSupported(false)
      setError('Camera blocked or unavailable. Use upload instead.')
      fileRef.current?.click()
    }
  }, [stopCamera])

  const captureFrame = useCallback(async () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    stopCamera()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9))
    if (!blob) {
      setError('Could not capture frame.')
      return
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    const url = URL.createObjectURL(blob)
    setPreviewUrl(url)
    setPhase('preview')
    await identifyBlob(blob)
  }, [identifyBlob, previewUrl, stopCamera])

  const onFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    stopCamera()
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(URL.createObjectURL(file))
    setPhase('preview')
    await identifyBlob(file)
  }, [identifyBlob, previewUrl, stopCamera])

  const reset = useCallback(() => {
    stopCamera()
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setResult(null)
    setError(null)
    setPhase('idle')
  }, [previewUrl, stopCamera])

  return (
    <main className="screen scan-page">
      <p className="scan-lede">Point at a compact pickup in the wild</p>
      <p className="lede">We compare your photo to the catalog. Nothing is stored on our servers.</p>

      <div className="scan-stage" aria-live="polite">
        {phase === 'camera' ? (
          <video ref={videoRef} className="scan-video" playsInline muted autoPlay />
        ) : previewUrl ? (
          <div className="scan-preview">
            {/* Local blob preview; not a remote asset */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Photo to identify" />
          </div>
        ) : (
          <p className="scan-status">Camera or upload a photo to start.</p>
        )}
      </div>

      <input
        ref={fileRef}
        className="scan-file"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFileChange}
      />

      <div className="scan-actions">
        {phase === 'idle' ? (
          <>
            <button type="button" className="btn btn-accent" onClick={() => void startCamera()}>
              {cameraSupported ? 'Open camera' : 'Upload photo'}
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              Upload photo
            </button>
          </>
        ) : null}
        {phase === 'camera' ? (
          <>
            <button type="button" className="btn btn-accent" onClick={() => void captureFrame()}>
              Capture
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              Upload instead
            </button>
            <button type="button" className="btn" onClick={reset}>
              Cancel
            </button>
          </>
        ) : null}
        {phase === 'preview' || phase === 'loading' || phase === 'done' ? (
          <>
            <button type="button" className="btn btn-accent" disabled={phase === 'loading'} onClick={() => void startCamera()}>
              Scan again
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={phase === 'loading'}>
              New photo
            </button>
            <button type="button" className="btn" onClick={reset} disabled={phase === 'loading'}>
              Reset
            </button>
          </>
        ) : null}
      </div>

      {phase === 'loading' ? <p className="scan-status">Identifying…</p> : null}
      {error ? <p className="scan-error" role="alert">{error}</p> : null}

      {result?.status === 'match' ? (
        <MatchList matches={result.matches} label="Best match" />
      ) : null}
      {result?.status === 'unknown' ? (
        <>
          <p className="scan-error" role="status">{result.message}</p>
          {result.matches ? <MatchList matches={result.matches} label="Closest guesses" /> : null}
        </>
      ) : null}
      {result?.status === 'not_truck' ? (
        <p className="scan-error" role="status">{result.message}</p>
      ) : null}

      <Link href="/" className="btn">Back home</Link>
    </main>
  )
}
