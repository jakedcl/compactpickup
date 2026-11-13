'use client'

import { useRef, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react'
import SanityImage from '@/components/SanityImage'
import type { SearchSuggestion } from '@/lib/catalog'
import {
  FIND_SUGGESTION_TAP_SLOP_PX,
  pointerMovedBeyondTapSlop,
} from '@/lib/find-search-gesture'

let suggestionPresses = 0

export function suggestionPressing() {
  return suggestionPresses > 0
}

function FindHitButton({
  suggestion,
  index,
  listId,
  activeIndex,
  onPick,
  onHover,
}: {
  suggestion: SearchSuggestion
  index: number
  listId: string
  activeIndex: number
  onPick: (suggestion: SearchSuggestion) => void
  onHover?: (index: number) => void
}) {
  const lock = useRef(false)
  const pointerStart = useRef<{ x: number; y: number } | null>(null)
  const scrollDrag = useRef(false)
  const touchPicked = useRef(false)

  const label = suggestion.kind === 'truck' ? suggestion.truck.title : suggestion.label
  const detail = suggestion.kind === 'truck'
    ? [suggestion.truck.maker, suggestion.truck.years].filter(Boolean).join(' · ')
  : 'Search'

  function commitPick() {
    if (lock.current) return
    lock.current = true
    suggestionPresses += 1
    onPick(suggestion)
    window.setTimeout(() => {
      lock.current = false
      suggestionPresses = Math.max(0, suggestionPresses - 1)
    }, 700)
  }

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (event.pointerType === 'mouse') {
      // Keep the combobox focused until click; avoids closing the list before pick.
      event.preventDefault()
    }
    pointerStart.current = { x: event.clientX, y: event.clientY }
    scrollDrag.current = false
    touchPicked.current = false
  }

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!pointerStart.current) return
    const dx = event.clientX - pointerStart.current.x
    const dy = event.clientY - pointerStart.current.y
    if (pointerMovedBeyondTapSlop(dx, dy, FIND_SUGGESTION_TAP_SLOP_PX)) scrollDrag.current = true
  }

  function onPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType === 'mouse') {
      pointerStart.current = null
      scrollDrag.current = false
      return
    }
    const shouldPick = pointerStart.current && !scrollDrag.current
    pointerStart.current = null
    scrollDrag.current = false
    if (!shouldPick) return
    touchPicked.current = true
    event.preventDefault()
    event.stopPropagation()
    commitPick()
  }

  function onPointerCancel() {
    pointerStart.current = null
    scrollDrag.current = false
  }

  function onClick(event: ReactMouseEvent<HTMLButtonElement>) {
    if (touchPicked.current) {
      touchPicked.current = false
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (event.detail === 0) return
    event.preventDefault()
    event.stopPropagation()
    commitPick()
  }

  return (
    <button
      type="button"
      id={`${listId}-${suggestion.id}`}
      role="option"
      aria-selected={index === activeIndex}
      className={index === activeIndex ? 'find-hit is-active' : 'find-hit'}
      onMouseEnter={() => onHover?.(index)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClick={onClick}
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
  )
}

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
  if (!suggestions.length) return null

  return (
    <ul id={listId} className="find-hits" role="listbox">
      {suggestions.map((suggestion, index) => (
        <li key={suggestion.id} role="presentation">
          <FindHitButton
            suggestion={suggestion}
            index={index}
            listId={listId}
            activeIndex={activeIndex}
            onPick={onPick}
            onHover={onHover}
          />
        </li>
      ))}
    </ul>
  )
}
