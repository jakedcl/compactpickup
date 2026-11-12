'use client'

import dynamic from 'next/dynamic'
import { useScanSession } from '@/components/scan/ScanSessionProvider'
import type { ScanCatalogTruck } from '@/lib/binder/scan-types'

const Scanner = dynamic(() => import('./scanner'), {
  ssr: false,
  loading: () => <p role="status">Loading the scanner</p>,
})

export default function ScannerSlot(props: {
  trucks: ScanCatalogTruck[]
  catalogStatus: 'ready' | 'error'
}) {
  const { scanEpoch } = useScanSession()
  return <Scanner key={scanEpoch} {...props} />
}
