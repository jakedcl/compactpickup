'use client'

import { useState } from 'react'
import { filterModels, type ModelChoice } from '@/lib/binder/model-search'
import { displayModelTitle } from '@/lib/makes'

export function ModelCombobox({
  trucks,
  make,
  value,
  onChange,
  label,
  hint,
  id,
  inputRef,
  disabled,
  placement = 'down',
}: {
  trucks: readonly ModelChoice[]
  make: string
  value: string
  onChange: (id: string) => void
  label: string
  hint?: string
  id: string
  inputRef?: { current: HTMLInputElement | null }
  disabled?: boolean
  /** Up overlays the rows above the field. Down overlays whatever follows it. */
  placement?: 'down' | 'up'
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const selected = trucks.find((truck) => truck.id === value) ?? null
  const selectedLabel = selected ? displayModelTitle(selected.maker, selected.title) : ''
  const matches = filterModels(trucks, make, query, value)
  const listId = `${id}-list`

  function pick(nextId: string) {
    onChange(nextId)
    setQuery('')
    setOpen(false)
    setHighlight(0)
  }

  return (
    <div
      className={`model-combo${placement === 'up' ? ' is-up' : ''}${open ? ' is-open' : ''}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <label htmlFor={id}>
        {label}
        {hint ? <span className="review-key">{hint}</span> : null}
      </label>
      <input
        id={id}
        ref={inputRef}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        value={open ? query : selectedLabel}
        placeholder={selectedLabel || 'Search models'}
        disabled={disabled}
        onFocus={() => {
          setOpen(true)
          setQuery('')
          const all = filterModels(trucks, make, '', value)
          const index = all.findIndex((truck) => truck.id === value)
          setHighlight(index >= 0 ? index : 0)
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
            setHighlight((index) => (matches.length === 0 ? 0 : Math.min(matches.length - 1, index + 1)))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setHighlight((index) => Math.max(0, index - 1))
          } else if (event.key === 'Enter') {
            event.preventDefault()
            const next = matches[highlight]
            if (next) pick(next.id)
          } else if (event.key === 'Escape') {
            event.preventDefault()
            setQuery('')
            setOpen(false)
            event.currentTarget.blur()
          }
        }}
      />
      {open ? (
        <ul id={listId} className="model-combo-list" role="listbox">
          {matches.length === 0 ? (
            <li className="model-combo-empty">No matching models</li>
          ) : (
            matches.map((truck, index) => (
              <li key={truck.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={truck.id === value}
                  className={index === highlight ? 'is-on' : undefined}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => pick(truck.id)}
                >
                  {displayModelTitle(truck.maker, truck.title)}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
