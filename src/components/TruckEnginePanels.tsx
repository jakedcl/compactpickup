import DataPanel from '@/components/DataPanel'
import SectionHeading from '@/components/ui/SectionHeading'
import {
  cleanText,
  displayEngines,
  engineDetailRows,
  engineHeaderSummary,
  type TruckSpecData,
} from '@/lib/truckDisplay'

export default function TruckEnginePanels({truck}: {truck: TruckSpecData}) {
  const engines = displayEngines(truck.engines)
  if (!engines.length) return null

  return (
    <section className="section">
      <SectionHeading title="Engines" />
      <div className="engine-panels">
        {engines.map((engine, index) => {
          const name = cleanText(engine.name) || `Engine ${index + 1}`
          const rows = engineDetailRows(engine).map((row) => ({
            label: row.label,
            value: row.value,
          }))
          return (
            <DataPanel
              key={engine._key || `${name}-${index}`}
              title={name}
              summary={engineHeaderSummary(engine)}
              rows={rows}
            />
          )
        })}
      </div>
    </section>
  )
}
