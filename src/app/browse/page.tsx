import { Suspense } from 'react'
import Link from 'next/link'
import BrowseDeck from '@/components/BrowseDeck'
import { getCatalog } from '@/lib/getCatalog'
import '@/components/find.css'

export const revalidate = 3600

export const metadata = {
  title: 'Find a truck · Compact Pickup',
  description: 'Search and filter compact and mid-size pickups by year, drivetrain, engine, and market.',
}

function ShelfMessage({ message }: { message: string }) {
  return (
    <main className="vhs-screen">
      <div className="find-wrap">
        <Link href="/" className="find-back">Main Menu</Link>
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
      <Suspense fallback={<ShelfMessage message="Loading the shelf..." />}>
        <BrowseDeck trucks={trucks} />
      </Suspense>
    )
  } catch {
    return <ShelfMessage message="Signal lost. Could not load the shelf." />
  }
}
