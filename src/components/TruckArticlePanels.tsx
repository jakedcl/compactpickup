import DataPanel from '@/components/DataPanel'
import SectionHeading from '@/components/ui/SectionHeading'
import type {ContentPanelRow} from '@/lib/contentSections'

function ArticlePanelSection({
  title,
  rows,
}: {
  title: string
  rows: ContentPanelRow[]
}) {
  if (!rows.length) return null
  return (
    <section className="section">
      <SectionHeading title={title} />
      <DataPanel
        title={title}
        rows={rows.map((row) => ({
          label: row.label,
          value: row.value,
          fullWidth: row.fullWidth,
        }))}
      />
    </section>
  )
}

export default function TruckArticlePanels({
  trims,
  cabBed,
  drivetrain,
  highlights,
}: {
  trims: ContentPanelRow[]
  cabBed: ContentPanelRow[]
  drivetrain: ContentPanelRow[]
  highlights: ContentPanelRow[]
}) {
  return (
    <>
      <ArticlePanelSection title="Trims" rows={trims} />
      <ArticlePanelSection title="Cab and bed" rows={cabBed} />
      <ArticlePanelSection title="Drivetrain" rows={drivetrain} />
      {highlights.length > 0 ? (
        <section className="section">
          <SectionHeading title="Highlights" />
          <DataPanel
            title="Highlights"
            rows={highlights.map((row) => ({
              label: row.label,
              value: row.value,
            }))}
          />
        </section>
      ) : null}
    </>
  )
}
