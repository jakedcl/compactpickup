'use client'

import { useRef } from 'react'
import SanityImage from '@/components/SanityImage'
import type { SearchSuggestion } from '@/lib/catalog'

export default function SearchSuggest({
  suggestions,
  listId,
  activeIndex = -1,
  onPick,
  onHover,
}: {
  suggestions: SearchSuggestion[]
  listId: string
  activeIndex?: number
  onPick: (suggestion: SearchSuggestion) => void
  onHover?: (index: number) => void
}) {
  const lock = useRef(false)

  function pick(suggestion: SearchSuggestion) {
    if (lock.current) return
    lock.current = true
    onPick(suggestion)
    window.setTimeout(() => {
      lock.current = false
    }, 500)
  }

  if (!suggestions.length) return null

  return (
    <ul id={listId} className="find-hits" role="listbox">
      {suggestions.map((suggestion, index) => {
        const label = suggestion.kind === 'truck' ? suggestion.truck.title : suggestion.label
        const detail = suggestion.kind === 'truck'
          ? [suggestion.truck.maker, suggestion.truck.years].filter(Boolean).join(' · ')
          : 'Search'
        return (
          <li key={suggestion.id} role="presentation">
            <button
              type="button"
              id={`${listId}-${suggestion.id}`}
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? 'find-hit is-active' : 'find-hit'}
              onMouseEnter={() => onHover?.(index)}
              onPointerDown={(event) => {
                event.preventDefault()
                pick(suggestion)
              }}
              onClick={() => pick(suggestion)}
            >
              {suggestion.kind === 'truck' ? (
                <span className="find-hit-still">
                  {suggestion.truck.image ? (
                    <SanityImage
                      image={suggestion.truck.image}
                      alt=""
                      sizes="64px"
                      fill
                      cropRatio={0.75}
                      className="sanity-cover"
                    />
                  ) : (
                    <span className="find-still-empty">No still</span>
                  )}
                </span>
              ) : (
                <span className="find-hit-mark">{suggestion.detail}</span>
              )}
              <span>
                {label}
                {detail ? <small>{detail}</small> : null}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
