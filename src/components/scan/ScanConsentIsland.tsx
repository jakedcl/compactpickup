'use client'

import { useRouter } from 'next/navigation'
import { submitVisitorScanPhoto } from '@/lib/scan/visitor-submit'
import ScanSavePhotoButton from './ScanSavePhotoButton'
import { useScanSession } from './ScanSessionProvider'

export default function ScanConsentIsland() {
  const router = useRouter()
  const { session, islandActive, clearSession, markConsentAnswered, patchSession } = useScanSession()

  if (!islandActive || !session) return null

  const busy = session.submitPhase === 'sending'
  const answered = session.consentAnswered
  const showSave = session.fromCameraCapture && !session.photoSaved

  async function onYes() {
    if (!session) return
    patchSession({ submitPhase: 'sending', submitMessage: 'Sending' })
    const result = await submitVisitorScanPhoto(
      session.file,
      session.verdict,
      session.topGuess,
      session.correction,
    )
    const phase =
      result.outcome === 'inserted' ? 'sent' : result.outcome === 'duplicate' ? 'duplicate' : 'error'
    markConsentAnswered(phase, result.message)
  }

  function onNo() {
    markConsentAnswered('idle', 'Nothing was stored.')
  }

  function scanAnother() {
    clearSession()
    router.push('/scan')
  }

  if (answered) {
    return (
      <div className="scan-consent-island is-compact" role="region" aria-label="Scanner follow-up">
        {session.submitMessage ? (
          <p className="scan-consent-island-status" role="status">
            {session.submitMessage}
          </p>
        ) : null}
        <button type="button" className="btn btn-accent scan-consent-island-primary" onClick={scanAnother}>
          Scan another
        </button>
      </div>
    )
  }

  return (
    <div className="scan-consent-island" role="region" aria-label="Photo consent">
      <h2 className="scan-consent-island-heading">CAN WE USE THIS PHOTO TO IMPROVE?</h2>
      <p className="scan-consent-island-copy">
        A compressed copy goes to Pending for review. It is never published or used for matching until approved.
      </p>
      <div className="scan-consent-island-actions">
        <button
          type="button"
          className="btn btn-accent"
          disabled={busy || (session.verdict === 'wrong' && !session.correction)}
          onClick={() => void onYes()}
        >
          Yes
        </button>
        <button type="button" className="btn" disabled={busy} onClick={onNo}>
          No
        </button>
      </div>
      <div className="scan-consent-island-secondary" aria-label="Optional actions">
        {showSave ? (
          <ScanSavePhotoButton
            file={session.file}
            variant="quiet"
            disabled={busy}
            onSaved={() => patchSession({ photoSaved: true })}
          />
        ) : null}
        <button type="button" className="scan-consent-island-quiet" disabled={busy} onClick={scanAnother}>
          Scan another
        </button>
      </div>
      {session.submitMessage && session.submitPhase !== 'idle' ? (
        <p className="scan-consent-island-status" role="status">
          {session.submitMessage}
        </p>
      ) : null}
    </div>
  )
}
