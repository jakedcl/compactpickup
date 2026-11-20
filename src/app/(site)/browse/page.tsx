import type { Metadata } from 'next'
import { Suspense } from 'react'
import BrowseDeck from '@/components/BrowseDeck'
import { getCatalog } from '@/lib/getCatalog'
import { buildShareMetadata } from '@/lib/metadata'
import '@/components/find.css'

export const revalidate = 3600

export const metadata: Metadata = buildShareMetadata({
  title: 'Find a truck · Compact Pickup',
  description: 'Search and filter compact and mid-size pickups by year, drivetrain, engine, and market.',
  path: '/browse',
})

function BrowseMessage({ message }: { message: string }) {
  return (
    <main className="screen">
      <div className="find-wrap">
        <h1 className="find-header">Find a truck</h1>
        <p className="find-empty">{message}</p>
      </div>
    </main>
  )
}

export default async function BrowsePage() {
  try {
    const trucks = await getCatalog()
    return (
      <Suspense fallback={<BrowseMessage message="Loading trucks..." />}>
        <BrowseDeck trucks={trucks} />
      </Suspense>
    )
  } catch {
    return <BrowseMessage message="Signal lost. Could not load the trucks." />
  }
}
