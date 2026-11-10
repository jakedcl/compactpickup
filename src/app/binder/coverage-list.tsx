'use client'

import { APPROVED_TARGET } from '@/lib/binder/coverage'

export type CoverageItem = {
  truckId: string
  title: string
  maker: string
  approved: number
  fingerprinted: number
  needsFront: boolean
  needsSide: boolean
  missingFaces: string[]
  caughtUp: boolean
}

export function CoverageList({
  trucks,
  loading,
  error,
  showCaughtUp,
  onToggle,
  onShow,
  onRetry,
}: {
  trucks: CoverageItem[] | null
  loading: boolean
  error: string | null
  showCaughtUp: boolean
  onToggle: () => void
  onShow: (truckId: string) => void
  onRetry: () => void
}) {
  if (loading && !trucks) return <p>Loading the shooting list…</p>
  if (error) {
    return (
      <p className="binder-note is-bad" role="alert">
        {error}{' '}
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
      </p>
    )
  }
  if (!trucks) return <p>Loading the shooting list…</p>
  const visible = showCaughtUp ? trucks : trucks.filter((truck) => !truck.caughtUp)
  const need = trucks.filter((truck) => !truck.caughtUp).length

  return (
    <div>
      <div className="binder-tools">
        <p>
          {need} {need === 1 ? 'truck still needs shots' : 'trucks still need shots'}. Target {APPROVED_TARGET}{' '}
          approved.
        </p>
        <button type="button" className="btn" onClick={onToggle}>
          {showCaughtUp ? 'Hide finished' : 'Show finished'}
        </button>
      </div>
      {visible.length === 0 ? (
        <p>Every listed truck has a front, a side, its face tags, and {APPROVED_TARGET} approved photos.</p>
      ) : (
        <ul className="binder-coverage">
          {visible.map((truck) => (
            <li key={truck.truckId}>
              <h2>{truck.title}</h2>
              <p>
                {truck.maker ? `${truck.maker} · ` : ''}
                {truck.approved} approved, {truck.fingerprinted} fingerprinted
              </p>
              {!truck.caughtUp ? (
                <ul className="binder-chips">
                  {truck.needsFront ? <li>Needs front</li> : null}
                  {truck.needsSide ? <li>Needs side</li> : null}
                  {truck.missingFaces.map((label) => (
                    <li key={label}>Needs {label}</li>
                  ))}
                  {truck.approved < APPROVED_TARGET ? <li>Needs {APPROVED_TARGET - truck.approved} more</li> : null}
                </ul>
              ) : (
                <p>Caught up</p>
              )}
              <button type="button" className="btn" onClick={() => onShow(truck.truckId)}>
                Photos
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
