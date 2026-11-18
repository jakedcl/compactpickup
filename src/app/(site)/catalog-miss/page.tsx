import type { Metadata } from 'next'
import TapeBlank from '@/components/TapeBlank'

export const metadata: Metadata = {
  title: 'This tape is blank · Compact Pickup',
  description: 'That page is not in the catalog.',
}

export default function CatalogMissPage() {
  return <TapeBlank />
}