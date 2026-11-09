import DataPanel from '@/components/DataPanel'
import SectionHeading from '@/components/ui/SectionHeading'
import {specRows, type TruckSpecData} from '@/lib/truckDisplay'

function SpecValue({value}: {value: string | string[]}) {
  if (typeof value === 'string') return <>{value}</>
  return (
    <div className="spec-value-lines">
      {value.map((item) => (
        <div key={item}>{item}</div>
      ))}
    </div>
  )
}

export default function TruckSpecSheet({truck}: {truck: TruckSpecData}) {
  const rows = specRows(truck)
  if (!rows.length) return null

  return (
    <section className="section">
      <SectionHeading title="Spec sheet" />
      <DataPanel
        title="Spec sheet"
        rows={rows.map((row) => ({
          label: row.label,
          value: (
            <>
              {row.value ? <SpecValue value={row.value} /> : null}
              {row.note ? <p className="spec-note">{row.note}</p> : null}
              {row.detail ? <p className="spec-note">{row.detail}</p> : null}
            </>
          ),
        }))}
      />
    </section>
  )
}
