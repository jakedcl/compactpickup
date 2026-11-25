'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { usePathname } from 'next/navigation'
import {
  shouldDismissIslandOnNavigation,
  shouldShowConsentIsland,
  type VisitorScanSession,
} from '@/lib/scan/visitor-session'

type ScanSessionContextValue = {
  session: VisitorScanSession | null
  islandActive: boolean
  scanEpoch: number
  beginSession: (next: Omit<VisitorScanSession, 'submitPhase' | 'submitMessage' | 'consentAnswered'>) => void
  clearSession: () => void
  markConsentAnswered: (submitPhase: VisitorScanSession['submitPhase'], submitMessage: string) => void
  patchSession: (
    patch: Partial<Pick<VisitorScanSession, 'submitPhase' | 'submitMessage' | 'consentAnswered'>>,
  ) => void
  registerScannerReset: (reset: (() => void) | null) => void
  goToFreshScan: () => void
}

const ScanSessionContext = createContext<ScanSessionContextValue | null>(null)

export function ScanSessionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [session, setSession] = useState<VisitorScanSession | null>(null)
  const [scanEpoch, setScanEpoch] = useState(0)
  const scannerResetRef = useRef<(() => void) | null>(null)
  const islandActive = shouldShowConsentIsland(pathname, session)
  // The page the island first showed on. A session can start on /scan and only show up on the
  // truck page the visitor picks, so this is set when the island appears, not when it begins.
  const shownOnPath = useRef<string | null>(null)

  const clearSession = useCallback(() => {
    setSession((current) => {
      if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl)
      return null
    })
  }, [])

  const registerScannerReset = useCallback((reset: (() => void) | null) => {
    scannerResetRef.current = reset
  }, [])

  const goToFreshScan = useCallback(() => {
    clearSession()
    scannerResetRef.current?.()
    setScanEpoch((value) => value + 1)
  }, [clearSession])

  const beginSession = useCallback(
    (next: Omit<VisitorScanSession, 'submitPhase' | 'submitMessage' | 'consentAnswered'>) => {
      setSession((current) => {
        if (current?.previewUrl && current.previewUrl !== next.previewUrl) {
          URL.revokeObjectURL(current.previewUrl)
        }
        return {
          ...next,
          submitPhase: 'idle',
          submitMessage: '',
          consentAnswered: false,
        }
      })
    },
    [],
  )

  const patchSession = useCallback(
    (patch: Partial<Pick<VisitorScanSession, 'submitPhase' | 'submitMessage' | 'consentAnswered'>>) => {
      setSession((current) => (current ? { ...current, ...patch } : current))
    },
    [],
  )

  const markConsentAnswered = useCallback(
    (submitPhase: VisitorScanSession['submitPhase'], submitMessage: string) => {
      patchSession({ consentAnswered: true, submitPhase, submitMessage })
    },
    [patchSession],
  )

  useEffect(() => {
    if (!session) {
      shownOnPath.current = null
      return
    }
    if (shouldDismissIslandOnNavigation(shownOnPath.current, pathname)) {
      shownOnPath.current = null
      clearSession()
      return
    }
    if (islandActive && shownOnPath.current === null) shownOnPath.current = pathname
  }, [session, islandActive, pathname, clearSession])

  // Only /scan reserves room for the question (see scan.css). The island itself always
  // floats over the page, so it never changes the layout of the page it is on.
  const asking = islandActive && !session?.consentAnswered
  useEffect(() => {
    document.documentElement.classList.toggle('scan-island-asking', asking)
    return () => document.documentElement.classList.remove('scan-island-asking')
  }, [asking])

  useEffect(() => {
    const revoke = () => {
      if (session?.previewUrl) URL.revokeObjectURL(session.previewUrl)
    }
    window.addEventListener('pagehide', revoke)
    return () => window.removeEventListener('pagehide', revoke)
  }, [session?.previewUrl])

  const value = useMemo(
    () => ({
      session,
      islandActive,
      scanEpoch,
      beginSession,
      clearSession,
      markConsentAnswered,
      patchSession,
      registerScannerReset,
      goToFreshScan,
    }),
    [
      session,
      islandActive,
      scanEpoch,
      beginSession,
      clearSession,
      markConsentAnswered,
      patchSession,
      registerScannerReset,
      goToFreshScan,
    ],
  )

  return <ScanSessionContext.Provider value={value}>{children}</ScanSessionContext.Provider>
}

export function useScanSession(): ScanSessionContextValue {
  const ctx = useContext(ScanSessionContext)
  if (!ctx) throw new Error('useScanSession must be used within ScanSessionProvider')
  return ctx
}
