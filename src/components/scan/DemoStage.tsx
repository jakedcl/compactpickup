import type { CropInfo } from '@/lib/clip/browser'

export type DemoStagePhase = 'detecting' | 'boxed' | 'fingerprinting' | 'done'

function boxStyle(rect: { x0: number; y0: number; x1: number; y1: number }) {
  return {
    left: `${rect.x0 * 100}%`,
    top: `${rect.y0 * 100}%`,
    width: `${(rect.x1 - rect.x0) * 100}%`,
    height: `${(rect.y1 - rect.y0) * 100}%`,
  }
}

/**
 * The sample photo with the scanner's work drawn on it: a tracking line while it detects,
 * the crop box once it has found the truck, and a pulsing grid while it fingerprints.
 */
export default function DemoStage({
  src,
  crop,
  phase,
}: {
  src: string
  crop: CropInfo | null
  phase: DemoStagePhase
}) {
  const tag = crop?.detection
    ? `${crop.detection.label.toUpperCase()} ${crop.detection.score.toFixed(2)}`
    : null
  const caption =
    phase === 'detecting'
      ? 'Looking for the truck…'
      : crop && !crop.rect
        ? 'No truck box found, so the whole photo is used.'
        : phase === 'fingerprinting'
          ? 'Turning the crop into 768 numbers…'
          : 'Truck found. The crop is what gets fingerprinted.'
  return (
    <div className="demo-stage" data-phase={phase}>
      <div className="demo-frame">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Sample photo being scanned" />
        {crop?.rect ? (
          <div className="demo-box" style={boxStyle(crop.rect)}>
            {tag ? <span className="demo-box-tag">{tag}</span> : null}
          </div>
        ) : crop ? (
          <div className="demo-box is-whole" />
        ) : null}
        {phase === 'detecting' || phase === 'fingerprinting' ? (
          <div className="demo-scanline" aria-hidden="true" />
        ) : null}
      </div>
      <p className="demo-stage-caption" role="status">
        {caption}
      </p>
    </div>
  )
}
