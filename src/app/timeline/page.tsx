import type { Metadata } from 'next'
import PageHeader from '@/components/ui/PageHeader'
import TruckTimelineCard, { type TimelineTruck } from '@/components/TruckTimelineCard'
import { getTimelineTrucks } from '@/lib/getContent'
import { truckSortYear } from '@/lib/truckDisplay'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Timeline · Compact Pickup',
  description: 'Every truck with a still, in the order they showed up.',
}

function decadeLabel(truck: TimelineTruck): string {
  const firstYear = truckSortYear(truck)
  if (firstYear === 9999) return 'Unknown'
  return `${Math.floor(firstYear / 10) * 10}s`
}

function groupTimeline(data: TimelineTruck[]) {
  const sorted = [...data].sort((a, b) => truckSortYear(a) - truckSortYear(b) || a.title.localeCompare(b.title))
  const grouped = sorted.reduce((acc: { [key: string]: TimelineTruck[] }, truck) => {
    const decade = decadeLabel(truck)
    if (!acc[decade]) acc[decade] = []
    acc[decade].push(truck)
    return acc
  }, {})

  return Object.entries(grouped)
    .map(([decade, trucks]) => ({ decade, trucks }))
    .sort((a, b) => a.decade.localeCompare(b.decade))
}

export default async function TimelinePage() {
  let trucks: TimelineTruck[] = []
  let failed = false
  try {
    trucks = await getTimelineTrucks()
  } catch {
    failed = true
  }

  const timelineData = failed ? [] : groupTimeline(trucks)

  return (
    <main className="screen">
      <div className="wrap">
        <PageHeader kicker="Catalog" title="Timeline" lede="Every truck with a still, in the order they showed up." />
        {failed ? <p className="state">Signal lost. Could not load the timeline.</p> : null}
        {!failed && timelineData.length === 0 ? <p className="state">No trucks in the timeline yet.</p> : null}
        {timelineData.map((group) => (
          <section key={group.decade} className="section">
            <h2 className="section-heading">{group.decade}</h2>
            <ul className="card-grid">
              {group.trucks.map((truck) => (
                <li key={truck._id}>
                  <TruckTimelineCard truck={truck} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  )
}
