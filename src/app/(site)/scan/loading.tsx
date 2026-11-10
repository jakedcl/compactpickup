import PageHeader from '@/components/ui/PageHeader'

export default function Loading() {
  return (
    <main className="screen">
      <div className="wrap narrow">
        <PageHeader
          kicker="Scanner"
          title="Scan a truck"
          lede="Take a photo of a compact pickup. The scanner names the closest model in the catalog."
        />
        <p role="status">Loading the scanner</p>
      </div>
    </main>
  )
}
