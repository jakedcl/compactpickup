'use client'

import type { ReactNode } from 'react'
import '@/app/(site)/scan/scan.css'
import ScanConsentIsland from './ScanConsentIsland'
import { ScanSessionProvider } from './ScanSessionProvider'

export default function SiteScanChrome({ children }: { children: ReactNode }) {
  return (
    <ScanSessionProvider>
      {children}
      <ScanConsentIsland />
    </ScanSessionProvider>
  )
}
