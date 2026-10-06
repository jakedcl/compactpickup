'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import SanityImage from '@/components/SanityImage'
import { EMPTY_FILTERS, filterTrucks, filtersToQuery, type CatalogTruck } from '@/lib/catalog'
import '@/components/find.css'

let catalogPromise: Promise<CatalogTruck[]> | null = null

function loadCatalog(): Promise<CatalogTruck[]> {
  if (!catalogPromise) {
    catalogPromise = fetch('/api/catalog').then(async (response) => {
      if (!response.ok) throw new Error('catalog')
      return response.json() as Promise<CatalogTruck[]>
    }).catch((error) => {
      catalogPromise = null
      throw error
    })
  }
  return catalogPromise
}

function typingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}

export default function SiteSearch() {
  const pathname = usePathname()
  const router = useRouter()
  const titleId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [trucks, setTrucks] = useState<CatalogTruck[] | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [attempt, setAttempt] = useState(0)
  const [active, setActive] = useState(0)
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    const openFind = () => {
      if (window.location.pathname === '/browse') {
        document.getElementById('truck-search')?.focus()
        return
      }
      setOpen(true)
    }
    window.addEventListener('cp-open-search', openFind)
    return () => window.removeEventListener('cp-open-search', openFind)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !typingTarget(event.target)) {
        if (window.location.pathname === '/game') return
        event.preventDefault()
        if (window.location.pathname === '/browse') {
          document.getElementById('truck-search')?.focus()
          return
        }
        setOpen(true)
      }
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    inputRef.current?.focus()
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  useEffect(() => {
    if (!open || trucks) return
    let cancelled = false
    setStatus('loading')
    loadCatalog().then((rows) => {
      if (cancelled) return
      setTrucks(rows)
      setStatus('ready')
    }).catch(() => {
      if (!cancelled) setStatus('error')
    })
    return () => {
      cancelled = true
    }
  }, [open, trucks, attempt])

  const hits = useMemo(() => {
    if (!trucks || !q.trim()) return []
    return filterTrucks(trucks, { ...EMPTY_FILTERS, q }).slice(0, 8)
  }, [trucks, q])

  useEffect(() => {
    setActive(0)
  }, [q])

  function retry() {
    catalogPromise = null
    setTrucks(null)
    setStatus('idle')
    setAttempt((value) => value + 1)
  }

  function close() {
    setOpen(false)
  }

  function onInputKey(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => Math.min(index + 1, Math.max(hits.length - 1, 0)))
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(index - 1, 0))
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const hit = hits[active]
      close()
      if (hit) router.push(hit.href)
      else router.push(`/browse${filtersToQuery({ ...EMPTY_FILTERS, q })}`)
    }
  }

  const browseHref = `/browse${filtersToQuery({ ...EMPTY_FILTERS, q })}`

  return (
    <>
      {open ? (
        <div className="find-dialog-backdrop" onMouseDown={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="find-dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id={titleId}>Find a truck</h2>
            <input
              ref={inputRef}
              value={q}
              placeholder="Hilux, 4x4, 22R"
              autoComplete="off"
              role="combobox"
              aria-expanded={hits.length > 0}
              aria-controls="find-hits"
              aria-autocomplete="list"
              aria-activedescendant={hits[active] ? `find-hit-${hits[active].id}` : undefined}
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={onInputKey}
            />
            {status === 'loading' || status === 'idle' ? <p className="find-empty">Loading trucks...</p> : null}
            {status === 'error' ? (
              <p className="find-empty">
                Signal lost.{' '}
                <button type="button" className="find-text-button" onClick={retry}>Retry</button>
              </p>
            ) : null}
            {status === 'ready' && !q.trim() ? (
              <p className="find-empty">Search trucks, engines, and chassis codes.</p>
            ) : null}
            {status === 'ready' && q.trim() && hits.length === 0 ? (
              <p className="find-empty">No trucks match.</p>
            ) : null}
            {hits.length > 0 ? (
              <ul id="find-hits" className="find-hits" role="listbox">
                {hits.map((truck, index) => (
                  <li key={truck.id} role="presentation">
                    <Link
                      id={`find-hit-${truck.id}`}
                      href={truck.href}
                      role="option"
                      aria-selected={index === active}
                      className={index === active ? 'find-hit is-active' : 'find-hit'}
                      onMouseEnter={() => setActive(index)}
                      onClick={close}
                    >
                      <span className="find-hit-still">
                        {truck.image ? (
                          <SanityImage
                            image={truck.image}
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
                      <span>
                        {truck.title}
                        <small>{[truck.maker, truck.years].filter(Boolean).join(' · ')}</small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
            {status === 'ready' && q.trim() ? (
              <Link href={browseHref} className="find-more" onClick={close}>See all</Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
