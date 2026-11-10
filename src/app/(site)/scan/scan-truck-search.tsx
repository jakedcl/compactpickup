'use client'

import { useMemo, useState } from 'react'
import type { ScanCatalogTruck } from '@/lib/binder/scan-types'

export const SCAN_CUSTOM_TRUCK_ID = '__custom__'

type Pick =
  | { kind: 'catalog'; truck: ScanCatalogTruck }
  | { kind: 'custom'; text: string }

export function ScanTruckSearch({
  trucks,
  disabled,
  onPick,
}: {
  trucks: readonly ScanCatalogTruck[]
  disabled?: boolean
  onPick: (pick: Pick) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const listId = 'scan-truck-suggest'

  const catalogMatches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const scoped = q
      ? trucks.filter((truck) => `${truck.maker} ${truck.title} ${truck.years} ${truck.slug}`.toLowerCase().includes(q))
      : [...trucks]
    return scoped
      .sort((a, b) => `${a.maker} ${a.title}`.localeCompare(`${b.maker} ${b.title}`))
      .slice(0, 11)
  }, [trucks, query])

  const trimmed = query.trim()
  const showCustom = trimmed.length > 0
  const options = useMemo(() => {
    const rows: Array<
      | { type: 'custom'; label: string; text: string }
      | { type: 'truck'; truck: ScanCatalogTruck; label: string }
    > = []
    if (showCustom) {
      rows.push({ type: 'custom', text: trimmed, label: `Not in our list yet: “${trimmed}”` })
    }
    for (const truck of catalogMatches) {
      rows.push({
        type: 'truck',
        truck,
        label: `${truck.maker} ${truck.title}${truck.years ? ` · ${truck.years}` : ''}`,
      })
    }
    return rows
  }, [catalogMatches, showCustom, trimmed])

  function choose(index: number) {
    const row = options[index]
    if (!row) return
    if (row.type === 'custom') onPick({ kind: 'custom', text: row.text })
    else onPick({ kind: 'catalog', truck: row.truck })
    setQuery('')
    setOpen(false)
    setHighlight(0)
  }

  return (
    <div
      className={`scan-typeahead${open ? ' is-open' : ''}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <label htmlFor="scan-truck-query" className="scan-label">
        Which truck was it?
        <input
          id="scan-truck-query"
          className="scan-field"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          disabled={disabled}
          value={query}
          placeholder="Type make or model"
          autoComplete="off"
          enterKeyHint="search"
          onFocus={() => {
            setOpen(true)
            setHighlight(0)
          }}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
            setHighlight(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setOpen(true)
              setHighlight((index) => (options.length === 0 ? 0 : Math.min(options.length - 1, index + 1)))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setHighlight((index) => Math.max(0, index - 1))
            } else if (event.key === 'Enter') {
              event.preventDefault()
              choose(highlight)
            } else if (event.key === 'Escape') {
              event.preventDefault()
              setQuery('')
              setOpen(false)
            }
          }}
        />
      </label>
      {open && options.length > 0 ? (
        <ul id={listId} className="scan-typeahead-list" role="listbox">
          {options.map((row, index) => (
            <li key={row.type === 'custom' ? 'custom' : row.truck.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlight}
                className={index === highlight ? 'is-on' : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => choose(index)}
              >
                {row.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
