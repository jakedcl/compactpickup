import type {ReactNode} from 'react'

export type DataPanelRow = {
  label?: string | null
  value: ReactNode
  note?: string | null
  fullWidth?: boolean
}

export default function DataPanel({
  title,
  summary,
  rows,
}: {
  title: string
  summary?: string | null
  rows: DataPanelRow[]
}) {
  if (!rows.length) return null

  return (
    <div className="data-panel">
      <div className="data-panel__head">
        <span className="data-panel__title">{title}</span>
        {summary ? <span className="meta data-panel__summary">{summary}</span> : null}
      </div>
      <dl className="spec-list data-panel__rows">
        {rows.map((row, index) => {
          if (row.fullWidth || !row.label) {
            return (
              <div key={`${title}-full-${index}`} className="data-panel__full">
                <dd>{row.value}</dd>
              </div>
            )
          }
          return (
            <div key={`${title}-${row.label}-${index}`}>
              <dt>{row.label}</dt>
              <dd>
                {row.value}
                {row.note ? <p className="spec-note">{row.note}</p> : null}
              </dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}
