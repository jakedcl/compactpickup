type VhsProgressBarProps = {
  label: string
  value: number
  visible?: boolean
}

/** Accessible progress meter styled for the VHS scan UI. */
export default function VhsProgressBar({ label, value, visible = true }: VhsProgressBarProps) {
  if (!visible) return null
  const now = Math.round(Math.min(100, Math.max(0, value)))
  return (
    <div className="vhs-progress">
      <p className="vhs-progress-label">{label}</p>
      <div
        className="vhs-progress-track"
        role="progressbar"
        aria-valuenow={now}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="vhs-progress-fill" style={{ width: `${now}%` }} />
      </div>
    </div>
  )
}
