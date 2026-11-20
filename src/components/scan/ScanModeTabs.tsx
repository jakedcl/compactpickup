export type ScanMode = 'own' | 'demo'

/** Switches between scanning the visitor's own photo and the built-in demo samples. */
export default function ScanModeTabs({
  mode,
  onChange,
  disabled = false,
}: {
  mode: ScanMode
  onChange: (mode: ScanMode) => void
  disabled?: boolean
}) {
  const tabs: Array<{ id: ScanMode; label: string }> = [
    { id: 'own', label: 'Your photo' },
    { id: 'demo', label: 'Demo' },
  ]
  return (
    <div className="scan-tabs" role="tablist" aria-label="Scanner mode">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`scan-tab-${tab.id}`}
          aria-selected={mode === tab.id}
          className={`scan-tab${mode === tab.id ? ' is-active' : ''}`}
          disabled={disabled}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
