'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import SanityImage from '@/components/SanityImage'
import {
  decadeLabel,
  filterChoices,
  filterTrucks,
  filtersActive,
  filtersToQuery,
  readFilters,
  type CatalogTruck,
  type TruckFilters,
} from '@/lib/catalog'
import '@/components/find.css'

const CARD_SIZES = '(max-width: 640px) 46vw, 280px'

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

function cardMeta(truck: CatalogTruck): string {
  return [truck.years, truck.drives.join(' / '), truck.engines.join(' ')].filter(Boolean).join(' · ')
}

function ChipGroup({
  legend,
  options,
  selected,
  onToggle,
  wide = false,
}: {
  legend: string
  options: Array<{ value: string; label: string }>
  selected: string[]
  onToggle: (value: string) => void
  wide?: boolean
}) {
  if (!options.length) return null
  return (
    <fieldset className={wide ? 'find-group find-group-wide' : 'find-group'}>
      <legend>{legend}</legend>
      <div className="find-chips">
        {options.map((option) => {
          const on = selected.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              className={on ? 'find-chip is-on' : 'find-chip'}
              aria-pressed={on}
              onClick={() => onToggle(option.value)}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

export default function BrowseDeck({ trucks }: { trucks: CatalogTruck[] }) {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const filters = useMemo(() => readFilters(params), [params])
  const [q, setQ] = useState(filters.q)
  const [sheet, setSheet] = useState(false)
  const [narrow, setNarrow] = useState(false)
  const skipQuery = useRef(false)
  const wantsFilters = useRef(params.get('filters') === 'open')
  const queryTimer = useRef<number | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const launchRef = useRef<HTMLButtonElement>(null)
  const doneRef = useRef<HTMLButtonElement>(null)
  const choices = useMemo(() => filterChoices(trucks), [trucks])
  const applied = useMemo(() => ({ ...filters, q }), [filters, q])
  const results = useMemo(() => filterTrucks(trucks, applied), [trucks, applied])
  const selectedCount = filters.maker.length + filters.decade.length + filters.drive.length + filters.engine.length + filters.market.length + filters.gear.length
  const sheetOpen = sheet && narrow

  useEffect(() => {
    setQ(filters.q)
  }, [filters.q])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 799px)')
    const sync = () => setNarrow(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (skipQuery.current) {
      skipQuery.current = false
      return
    }
    const current = readFilters(params)
    if (q.trim() === current.q.trim()) return
    queryTimer.current = window.setTimeout(() => {
      queryTimer.current = null
      const latest = readFilters(new URLSearchParams(window.location.search))
      router.replace(`${pathname}${filtersToQuery({ ...latest, q })}`, { scroll: false })
    }, 180)
    return () => {
      if (queryTimer.current) {
        window.clearTimeout(queryTimer.current)
        queryTimer.current = null
      }
    }
  }, [q, params, pathname, router])

  useEffect(() => {
    if (!wantsFilters.current) return
    wantsFilters.current = false
    if (window.matchMedia('(max-width: 799px)').matches) setSheet(true)
    const latest = readFilters(new URLSearchParams(window.location.search))
    router.replace(`${pathname}${filtersToQuery(latest)}`, { scroll: false })
  }, [pathname, router])

  useEffect(() => {
    if (!sheetOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    doneRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setSheet(false)
        launchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [sheetOpen])

  function write(next: TruckFilters) {
    router.replace(`${pathname}${filtersToQuery(next)}`, { scroll: false })
  }

  function flip(key: keyof Omit<TruckFilters, 'q'>, value: string) {
    write({ ...filters, q, [key]: toggleValue(filters[key], value) })
  }

  function clearAll() {
    skipQuery.current = true
    setQ('')
    router.replace(pathname, { scroll: false })
  }

  function closeSheet() {
    setSheet(false)
    launchRef.current?.focus()
  }

  function commitSearch(event?: { preventDefault: () => void }) {
    event?.preventDefault()
    const input = searchRef.current
    input?.blur()
    window.setTimeout(() => input?.blur(), 0)
    if (queryTimer.current) {
      window.clearTimeout(queryTimer.current)
      queryTimer.current = null
    }
    const latest = readFilters(new URLSearchParams(window.location.search))
    if (q.trim() === latest.q.trim()) return
    router.replace(`${pathname}${filtersToQuery({ ...latest, q })}`, { scroll: false })
  }

  const countLabel = results.length === 1 ? '1 truck' : `${results.length} trucks`

  return (
    <main className="screen">
      <div className="find-wrap">
        <Link href="/" className="find-back">Main Menu</Link>
        <h1 className="find-header">Find a truck</h1>
        <form className="find-search" role="search" action={pathname} onSubmit={commitSearch}>
          <label className="find-sr" htmlFor="truck-search">Search</label>
          <input
            ref={searchRef}
            id="truck-search"
            type="search"
            value={q}
            placeholder="Hilux, 4x4, 22R"
            autoComplete="off"
            enterKeyHint="search"
            onChange={(event) => setQ(event.target.value)}
            onFocus={() => setSheet(false)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitSearch(event)
            }}
          />
        </form>
        <div className="find-layout">
        <button
          ref={launchRef}
          type="button"
          className="find-filters-launch"
          aria-expanded={sheetOpen}
          aria-controls="truck-filters"
          onClick={() => setSheet(true)}
        >
          {selectedCount ? `Filters ${selectedCount}` : 'Filters'}
        </button>
        {sheetOpen ? (
          <button type="button" className="find-backdrop is-open" aria-label="Close filters" onClick={closeSheet} />
        ) : null}
        <div
          id="truck-filters"
          className={sheetOpen ? 'find-filters is-open' : 'find-filters'}
          role={sheetOpen ? 'dialog' : undefined}
          aria-modal={sheetOpen ? true : undefined}
          aria-label={sheetOpen ? 'Filters' : undefined}
        >
          <div className="find-sheet-bar">
            <span>Filters</span>
            <button ref={doneRef} type="button" className="find-done" onClick={closeSheet}>Done</button>
          </div>
          <ChipGroup
            legend="Manufacturer"
            wide
            selected={filters.maker}
            onToggle={(value) => flip('maker', value)}
            options={choices.makers.map((maker) => ({ value: maker.slug, label: maker.name }))}
          />
          <ChipGroup
            legend="Decade"
            selected={filters.decade}
            onToggle={(value) => flip('decade', value)}
            options={choices.decades.map((decade) => ({ value: String(decade), label: decadeLabel(decade) }))}
          />
          <ChipGroup
            legend="Drivetrain"
            selected={filters.drive}
            onToggle={(value) => flip('drive', value)}
            options={choices.drives.map((drive) => ({ value: drive, label: drive }))}
          />
          <ChipGroup
            legend="Engine"
            selected={filters.engine}
            onToggle={(value) => flip('engine', value)}
            options={choices.engines.map((engine) => ({ value: engine, label: engine }))}
          />
          <ChipGroup
            legend="Sold in"
            selected={filters.market}
            onToggle={(value) => flip('market', value)}
            options={choices.markets.map((market) => ({ value: market, label: market }))}
          />
          <ChipGroup
            legend="Transmission"
            selected={filters.gear}
            onToggle={(value) => flip('gear', value)}
            options={choices.gears.map((gear) => ({ value: gear, label: gear }))}
          />
        </div>
        <div className="find-results">
        <div className="find-toolbar">
          <p aria-live="polite">{countLabel}</p>
          {filtersActive(applied) ? (
            <button type="button" className="find-text-button" onClick={clearAll}>Clear</button>
          ) : null}
        </div>
        {trucks.length === 0 ? (
          <p className="find-empty">No trucks in the deck.</p>
        ) : results.length === 0 ? (
          <p className="find-empty">No trucks match.</p>
        ) : (
          <ul className="find-grid">
            {results.map((truck, index) => (
              <li key={truck.id}>
                <Link href={truck.href} className="find-card">
                  <span className="find-still">
                    {truck.image ? (
                      <SanityImage
                        image={truck.image}
                        alt={truck.alt}
                        sizes={CARD_SIZES}
                        fill
                        cropRatio={0.75}
                        eager={index < 2}
                        className="sanity-cover"
                      />
                    ) : (
                      <span className="find-still-empty">No still</span>
                    )}
                  </span>
                  <span className="find-card-copy">
                    <span className="find-maker">{truck.maker}</span>
                    <span className="find-title">{truck.title}</span>
                    {cardMeta(truck) ? <span className="find-meta">{cardMeta(truck)}</span> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        </div>
        </div>
      </div>
    </main>
  )
}
