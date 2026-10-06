'use client'

import PageHeader from '@/components/ui/PageHeader'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="screen">
      <div className="wrap narrow">
        <PageHeader kicker="Signal lost" title="Something dropped out" lede="The page did not finish loading." />
        <button type="button" className="btn btn-accent" onClick={() => reset()}>Try again</button>
      </div>
    </main>
  )
}
