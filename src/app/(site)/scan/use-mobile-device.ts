'use client'

import { useEffect, useState } from 'react'

export type DeviceKind = 'unknown' | 'mobile' | 'desktop'

function readMobileDevice(): boolean {
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData
  if (typeof uaData?.mobile === 'boolean') return uaData.mobile

  const coarsePointer = window.matchMedia('(pointer: coarse) and (hover: none)').matches
  const ua = navigator.userAgent
  const uaMobile = /iPhone|iPad|iPod|Android/i.test(ua)
  const ipadDesktopUa = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  if (coarsePointer && (uaMobile || ipadDesktopUa)) return true
  return uaMobile || ipadDesktopUa
}

/** Client-only device class. Returns `unknown` until after mount to avoid hydration mismatch. */
export function useMobileDevice(): DeviceKind {
  const [kind, setKind] = useState<DeviceKind>('unknown')
  useEffect(() => {
    setKind(readMobileDevice() ? 'mobile' : 'desktop')
  }, [])
  return kind
}
