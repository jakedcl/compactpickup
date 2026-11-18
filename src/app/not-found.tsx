import type { Metadata } from 'next'
import Link from 'next/link'
import PageHeader from '@/components/ui/PageHeader'

export const metadata: Metadata = {
  title: 'This tape is blank · Compact Pickup',
  description: 'That page is not in the catalog.',
}

export default function NotFound() {
  return (
    <main className="screen">
      <div className="wrap narrow">
        <PageHeader kicker="404" title="This tape is blank" lede="That page is not in the catalog." />
        <Link href="/" className="btn btn-accent">
          Home
        </Link>
      </div>
    </main>
  )
}