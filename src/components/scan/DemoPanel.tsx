import type { CropInfo } from '@/lib/clip/browser'
import { rawScanScorePercent, scanGuessCardTitle, type ScanMatch, type ScanState } from '@/lib/binder/scan-types'
import { sampleVerdict, type DemoSample } from '@/lib/scan/demo-samples'
import { explainScan, formatStageMs } from '@/lib/scan/explain'

export type DemoTimings = {
  fingerprintMs: number
  matchMs: number
  /** True when the models were downloaded during this scan, so the times include that wait. */
  coldStart: boolean
}

function boxShare(crop: CropInfo): string | null {
  const box = crop.detection
  if (!box) return null
  return `${Math.round((box.x1 - box.x0) * (box.y1 - box.y0) * 100)}%`
}

/** "How it decided": the numbers behind a demo scan. Everything here comes from the real scan. */
export default function DemoPanel({
  sample,
  crop,
  timings,
  state,
  matches,
  visible,
  threshold,
  minMargin,
  pipeline,
}: {
  sample: DemoSample
  crop: CropInfo | null
  timings: DemoTimings | null
  state: ScanState
  matches: ScanMatch[]
  visible: ScanMatch[]
  threshold?: number
  minMargin?: number
  pipeline: string
}) {
  const verdict = sampleVerdict(sample, state, visible)
  const explanation =
    threshold !== undefined && minMargin !== undefined
      ? explainScan({ state, matches, threshold, minMargin })
      : null
  const share = crop ? boxShare(crop) : null
  const visibleIds = new Set(visible.map((match) => match.id))
  return (
    <section className="demo-panel" aria-label="How it decided">
      <h2 className="demo-panel-title">How it decided</h2>
      <p className={`demo-verdict is-${verdict.tone}`}>{verdict.text}</p>
      <p className="demo-why">{sample.why}</p>

      <ol className="demo-stages">
        <li style={{ ['--i' as string]: 0 }}>
          <span className="demo-stage-name">1 · Find the truck</span>
          <span className="demo-stage-ms">{crop ? formatStageMs(crop.detectMs) : '—'}</span>
          <span className="demo-stage-note">
            {crop?.detection
              ? `Found a ${crop.detection.label} (score ${crop.detection.score.toFixed(2)})${share ? `, ${share} of the photo` : ''}, cropped with 15% padding.`
              : crop
                ? 'No vehicle box passed the rule, so the whole photo was used.'
                : ''}
          </span>
        </li>
        <li style={{ ['--i' as string]: 1 }}>
          <span className="demo-stage-name">2 · Fingerprint</span>
          <span className="demo-stage-ms">{timings ? formatStageMs(timings.fingerprintMs) : '—'}</span>
          <span className="demo-stage-note">The crop becomes 768 numbers, on your device.</span>
        </li>
        <li style={{ ['--i' as string]: 2 }}>
          <span className="demo-stage-name">3 · Compare</span>
          <span className="demo-stage-ms">{timings ? formatStageMs(timings.matchMs) : '—'}</span>
          <span className="demo-stage-note">
            Only the numbers are sent. The server finds the closest approved photos and scores each truck by its best 3.
          </span>
        </li>
      </ol>
      {timings?.coldStart ? (
        <p className="demo-fine">The first scan includes downloading the models. Scan again to see the warm times.</p>
      ) : null}

      {matches.length > 0 ? (
        <>
          <ol className="demo-bars" aria-label="Closest trucks">
            {matches.map((match, index) => {
              const pct = rawScanScorePercent(match.score)
              return (
                <li key={match.id} className={visibleIds.has(match.id) ? '' : 'is-hidden-guess'}>
                  <span className="demo-bar-name">{scanGuessCardTitle(match.maker, match.title)}</span>
                  <span className="demo-bar-score">{match.score.toFixed(3)}</span>
                  <span className="demo-bar-track" aria-hidden="true">
                    <span
                      className="demo-bar-fill"
                      style={{ ['--w' as string]: `${pct}%`, ['--i' as string]: index }}
                    />
                  </span>
                </li>
              )
            })}
          </ol>
          <p className="demo-fine">
            Numbers are raw cosine similarity. Bars use the 0.70 to 0.95 scale shown as percent on the guess cards. Dimmed
            rows were not shown as guesses.
          </p>
        </>
      ) : null}

      {explanation ? <p className="demo-explain">{explanation.sentence}</p> : null}
      <p className="demo-fine">
        Pipeline <code>{pipeline}</code>
      </p>
      <p className="demo-fine">
        Photo:{' '}
        <a href={sample.credit.sourceUrl} target="_blank" rel="noopener noreferrer">
          {sample.credit.title}
        </a>
        , {sample.credit.author}, {sample.credit.license}
        {sample.credit.note ? ` (${sample.credit.note})` : ''}.
      </p>
    </section>
  )
}
