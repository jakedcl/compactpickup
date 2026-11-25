'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CONSENT_NOTICE_MS, consentNoticeText } from '@/lib/scan/visitor-session'
import { submitVisitorScanPhoto } from '@/lib/scan/visitor-submit'
import { useScanSession } from './ScanSessionProvider'

export default function ScanConsentIsland() {
  const router = useRouter()
  const { session, islandActive, goToFreshScan, clearSession, markConsentAnswered, patchSession } = useScanSession()
  const answeredNow = Boolean(session?.consentAnswered)

  // The notice goes away on its own. This runs wherever the visitor is, so leaving the page
  // does not bring it back later.
  useEffect(() => {
    if (!answeredNow) return undefined
    const timer = setTimeout(clearSession, CONSENT_NOTICE_MS)
    return () => clearTimeout(timer)
  }, [answeredNow, clearSession])

  if (!islandActive || !session) return null

  const busy = session.submitPhase === 'sending'
  const answered = session.consentAnswered

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
    goToFreshScan()
    router.push('/scan')
  }

  if (answered) {
    return (
      <div className="scan-consent-island is-compact" role="region" aria-label="Scanner follow-up">
        <p className="scan-consent-island-status" role="status">
          {consentNoticeText(session.submitPhase, session.submitMessage)}
        </p>
        <button type="button" className="btn btn-accent scan-consent-island-primary" onClick={scanAnother}>
          Scan another
        </button>
      </div>
    )
  }

  return (
    <div className="scan-consent-island" role="region" aria-label="Scan consent">
      <h2 className="scan-consent-island-heading">CAN WE USE THESE RESULTS TO IMPROVE?</h2>
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
      <button type="button" className="scan-consent-island-quiet" disabled={busy} onClick={scanAnother}>
        Scan another
      </button>
      {session.submitMessage && session.submitPhase !== 'idle' ? (
        <p className="scan-consent-island-status" role="status">
          {session.submitMessage}
        </p>
      ) : null}
    </div>
  )
}
