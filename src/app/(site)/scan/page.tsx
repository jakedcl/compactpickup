import type { Metadata } from 'next'
import ScanScreen from '@/components/ScanScreen'

export const metadata: Metadata = {
  title: 'Scan truck · Compact Pickup',
  description: 'Point your camera at a compact pickup and match it to the catalog.',
}

export default function ScanPage() {
  return <ScanScreen />
}
