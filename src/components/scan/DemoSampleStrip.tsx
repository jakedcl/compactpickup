import type { DemoSample } from '@/lib/scan/demo-samples'

/** One-tap sample photos for trying the scanner without a photo of your own. */
export default function DemoSampleStrip({
  samples,
  disabled,
  onPick,
}: {
  samples: DemoSample[]
  disabled: boolean
  onPick: (sample: DemoSample) => void
}) {
  return (
    <div className="demo-strip" role="tabpanel" aria-labelledby="scan-tab-demo">
      <p className="demo-strip-intro">
        No truck photo handy? Pick a sample. It goes through the same scanner, on your device.
      </p>
      <ul className="demo-samples">
        {samples.map((sample) => (
          <li key={sample.id}>
            <button type="button" className="demo-sample" disabled={disabled} onClick={() => onPick(sample)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sample.src} alt="" loading="lazy" decoding="async" />
              <span className="demo-sample-label">{sample.label}</span>
            </button>
          </li>
        ))}
      </ul>
      <details className="demo-credits">
        <summary>Photo credits</summary>
        <ul>
          {samples.map((sample) => (
            <li key={sample.id}>
              <a href={sample.credit.sourceUrl} target="_blank" rel="noopener noreferrer">
                {sample.credit.title}
              </a>
              , {sample.credit.author}, {sample.credit.license}
              {sample.credit.note ? ` (${sample.credit.note})` : ''}
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
