import SectionHeading from '@/components/ui/SectionHeading'
import {
  cleanText,
  displayEngines,
  engineColumns,
  specRows,
  type EngineSpec,
  type TruckSpecData,
} from '@/lib/truckDisplay'

function SpecValue({value}: {value: string | string[]}) {
  if (typeof value === 'string') return <>{value}</>
  return (
    <ul>
      {value.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

function engineCell(engine: EngineSpec, key: keyof EngineSpec) {
  if (key === 'hp') return typeof engine.hp === 'number' ? String(engine.hp) : ''
  return cleanText(engine[key]) ?? ''
}

export default function TruckSpecSheet({truck}: {truck: TruckSpecData}) {
  const rows = specRows(truck)
  const engines = displayEngines(truck.engines)
  const columns = engineColumns(engines)

  if (!rows.length && !engines.length) return null

  return (
    <section className="section">
      <SectionHeading title="Spec sheet" />
      {rows.length > 0 && (
        <dl className="spec-list">
          {rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>
                {row.value ? <SpecValue value={row.value} /> : null}
                {row.note ? <p className="spec-note">{row.note}</p> : null}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {engines.length > 0 && (
        <div className="section">
          <h3 className="section-heading">Engines</h3>
          <div className="table-wrap">
            <table className="spec-table">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {engines.map((engine, index) => (
                  <tr key={engine._key || `${engine.name ?? 'engine'}-${index}`}>
                    {columns.map((column) => (
                      <td key={column.key}>{engineCell(engine, column.key)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
