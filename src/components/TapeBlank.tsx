import Link from 'next/link'
import PageHeader from '@/components/ui/PageHeader'

/** Shared copy for catalog 404s (server-rendered). */
export default function TapeBlank() {
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