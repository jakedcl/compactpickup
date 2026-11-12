'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  hasActiveVisitorSession,
  type VisitorScanSession,
} from '@/lib/scan/visitor-session'

type ScanSessionContextValue = {
  session: VisitorScanSession | null
  islandActive: boolean
  beginSession: (next: Omit<VisitorScanSession, 'submitPhase' | 'submitMessage' | 'consentAnswered'>) => void
  clearSession: () => void
  markConsentAnswered: (submitPhase: VisitorScanSession['submitPhase'], submitMessage: string) => void
  patchSession: (
    patch: Partial<Pick<VisitorScanSession, 'submitPhase' | 'submitMessage' | 'consentAnswered' | 'photoSaved'>>,
  ) => void
}

const ScanSessionContext = createContext<ScanSessionContextValue | null>(null)

export function ScanSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<VisitorScanSession | null>(null)

  const clearSession = useCallback(() => {
    setSession((current) => {
      if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl)
      return null
    })
  }, [])

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
          photoSaved: next.photoSaved ?? false,
        }
      })
    },
    [],
  )

  const patchSession = useCallback(
    (
      patch: Partial<Pick<VisitorScanSession, 'submitPhase' | 'submitMessage' | 'consentAnswered' | 'photoSaved'>>,
    ) => {
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
    const open = hasActiveVisitorSession(session)
    document.documentElement.classList.toggle('scan-island-open', open)
    return () => document.documentElement.classList.remove('scan-island-open')
  }, [session])

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
      islandActive: hasActiveVisitorSession(session),
      beginSession,
      clearSession,
      markConsentAnswered,
      patchSession,
    }),
    [session, beginSession, clearSession, markConsentAnswered, patchSession],
  )

  return <ScanSessionContext.Provider value={value}>{children}</ScanSessionContext.Provider>
}

export function useScanSession(): ScanSessionContextValue {
  const ctx = useContext(ScanSessionContext)
  if (!ctx) throw new Error('useScanSession must be used within ScanSessionProvider')
  return ctx
}
