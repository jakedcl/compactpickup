import PageHeader from '@/components/ui/PageHeader'

export default function Loading() {
  return (
    <main className="screen">
      <div className="wrap narrow">
        <PageHeader kicker="Scanner" />
        <div className="home-reel scan-panel">
          <p className="scan-device-wait" role="status">
            Loading the scanner
          </p>
        </div>
      </div>
    </main>
  )
}
