import {
  cleanText,
  displayEngines,
  engineColumns,
  specRows,
  type EngineSpec,
  type TruckSpecData,
} from '@/lib/truckDisplay'

function SpecValue({value}: {value: string | string[]}) {
  if (typeof value === 'string') {
    return <span className="text-sm text-white/90">{value}</span>
  }

  return (
    <ul className="space-y-1">
      {value.map((item) => (
        <li key={item} className="flex items-start text-sm text-white/90">
          <span className="text-yellow-400 mr-2">▶</span>
          <span>{item}</span>
        </li>
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
    <section className="w-full bg-black/20 border border-white/20 p-6 mb-6">
      <h2 className="text-lg font-bold text-white mb-3 uppercase tracking-wider border-b border-white/20 pb-2">
        Spec Sheet
      </h2>

      {rows.length > 0 && (
        <dl className="divide-y divide-white/15">
          {rows.map((row) => (
            <div key={row.label} className="grid grid-cols-1 sm:grid-cols-[9.5rem_1fr] gap-x-3 gap-y-1 py-2">
              <dt className="text-yellow-400 uppercase tracking-wider text-xs">{row.label}</dt>
              <dd>
                <SpecValue value={row.value} />
              </dd>
            </div>
          ))}
        </dl>
      )}

      {engines.length > 0 && (
        <div className={rows.length ? 'mt-5' : undefined}>
          <h3 className="text-base font-bold text-white mb-2 uppercase tracking-wide">Engines</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="text-yellow-400 uppercase tracking-wider border-b border-white/30">
                  {columns.map((column) => (
                    <th key={column.key} className="py-2 pr-3 font-normal align-bottom">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {engines.map((engine, index) => (
                  <tr key={engine._key || `${engine.name ?? 'engine'}-${index}`} className="border-b border-white/10 align-top">
                    {columns.map((column) => (
                      <td key={column.key} className="py-2 pr-3 text-white/90">
                        {engineCell(engine, column.key)}
                      </td>
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
