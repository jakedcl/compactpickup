import type { Metadata } from 'next'
import PageHeader from '@/components/ui/PageHeader'
import { getCatalog } from '@/lib/getCatalog'
import { toScanTruck, type ScanCatalogTruck } from '@/lib/binder/scan-types'
import ScannerSlot from './scanner-slot'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Scan a truck · Compact Pickup',
  description: 'Photograph a compact pickup and see the closest truck in the catalog.',
}

export default async function ScanPage() {
  let trucks: ScanCatalogTruck[] = []
  let catalogStatus: 'ready' | 'error' = 'ready'
  try {
    const catalog = await getCatalog()
    trucks = catalog
      .flatMap((truck) => {
        const option = toScanTruck(truck)
        return option ? [option] : []
      })
      .sort((a, b) => a.maker.localeCompare(b.maker) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
  } catch {
    catalogStatus = 'error'
  }
  return (
    <main className="screen">
      <div className="wrap narrow">
        <PageHeader
          kicker="Scanner"
          title="Scan a truck"
          lede="Take a photo of a compact pickup. The scanner names the closest model in the catalog."
        />
        <ScannerSlot trucks={trucks} catalogStatus={catalogStatus} />
      </div>
    </main>
  )
}
