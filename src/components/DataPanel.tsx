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
  title?: string | null
  summary?: string | null
  rows: DataPanelRow[]
}) {
  if (!rows.length) return null
  const keyBase = title ?? 'panel'

  return (
    <div className="data-panel">
      {title || summary ? (
        <div className="data-panel__head">
          {title ? <span className="data-panel__title">{title}</span> : null}
          {summary ? <span className="meta data-panel__summary">{summary}</span> : null}
        </div>
      ) : null}
      <dl className="spec-list data-panel__rows">
        {rows.map((row, index) => {
          if (row.fullWidth || !row.label) {
            return (
              <div key={`${keyBase}-full-${index}`} className="data-panel__full">
                <dd>{row.value}</dd>
              </div>
            )
          }
          return (
            <div key={`${keyBase}-${row.label}-${index}`}>
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
