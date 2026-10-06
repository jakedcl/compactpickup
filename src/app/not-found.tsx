import Link from 'next/link'
import PageHeader from '@/components/ui/PageHeader'

export default function NotFound() {
  return (
    <main className="screen">
      <div className="wrap narrow">
        <PageHeader kicker="404" title="This tape is blank" lede="That page is not in the catalog." />
        <Link href="/" className="btn btn-accent">Back to the shelf</Link>
      </div>
    </main>
  )
}
