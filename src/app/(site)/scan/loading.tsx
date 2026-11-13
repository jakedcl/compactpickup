import PageHeader from '@/components/ui/PageHeader'

export default function Loading() {
  return (
    <main className="screen">
      <div className="wrap narrow">
        <PageHeader kicker="Scanner" />
        <p role="status">Loading the scanner</p>
      </div>
    </main>
  )
}
