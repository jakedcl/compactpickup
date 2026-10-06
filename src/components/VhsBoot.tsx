'use client'

import { useEffect, useRef, useState } from 'react'

type Phase = 'static' | 'lock' | 'title' | 'out'

function formatTimecode(ms: number) {
  const total = Math.floor(ms / 1000)
  const mm = Math.floor(total / 60)
  const ss = total % 60
  return `00:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

function StaticNoise() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const context = canvas.getContext('2d', { alpha: true })
    if (!context) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    canvas.width = 160
    canvas.height = 90

    const draw = () => {
      const image = context.createImageData(canvas.width, canvas.height)
      const data = image.data
      for (let i = 0; i < data.length; i += 16) {
        const v = 40 + Math.random() * 215
        data[i] = v
        data[i + 1] = v
        data[i + 2] = v
        data[i + 3] = Math.random() > 0.55 ? 170 : 0
      }
      context.putImageData(image, 0, 0)
    }

    draw()
    if (reduce) return

    let frame = 0
    let last = 0
    const loop = (time: number) => {
      if (time - last > 50) {
        draw()
        last = time
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [])

  return <canvas ref={ref} className="boot-noise" aria-hidden="true" />
}

export default function VhsBoot({ onDone }: { onDone: (viaKeyboard: boolean) => void }) {
  const [phase, setPhase] = useState<Phase>('static')
  const [elapsed, setElapsed] = useState(0)
  const skipRef = useRef<HTMLButtonElement>(null)
  const onDoneRef = useRef(onDone)
  const finished = useRef(false)

  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    skipRef.current?.focus()
    const started = performance.now()

    const end = (viaKeyboard: boolean) => {
      if (finished.current) return
      finished.current = true
      onDoneRef.current(viaKeyboard)
    }

    const clock = window.setInterval(() => {
      setElapsed(performance.now() - started)
    }, 200)
    const timers = [
      window.setTimeout(() => setPhase('lock'), 800),
      window.setTimeout(() => setPhase('title'), 1600),
      window.setTimeout(() => setPhase('out'), 3900),
      window.setTimeout(() => end(false), 4500),
    ]
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        end(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearInterval(clock)
      timers.forEach((timer) => window.clearTimeout(timer))
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <div
      className="boot-overlay"
      data-phase={phase}
      role="dialog"
      aria-modal="true"
      aria-labelledby="boot-title"
      onClick={() => {
        if (finished.current) return
        finished.current = true
        onDoneRef.current(false)
      }}
    >
      <StaticNoise />
      <div className="boot-bars" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="boot-roll" aria-hidden="true" />
      <div className="boot-scan" aria-hidden="true" />
      <div className="boot-vignette" aria-hidden="true" />

      <div className="boot-osd">
        <p className="boot-play">
          <span className="boot-play-mark" aria-hidden="true">▶</span>
          PLAY
          <span className="boot-sp">SP</span>
        </p>
        <p className={`boot-tracking ${phase === 'static' ? 'is-on' : ''}`} aria-hidden="true">TRACKING</p>
        <div className="boot-title-block">
          <p id="boot-title" className="boot-title">Compact Pickup</p>
          <p className="boot-deck">Field guide</p>
        </div>
        <p className="boot-tc">{formatTimecode(elapsed)}</p>
      </div>

      <button
        ref={skipRef}
        type="button"
        className="boot-skip"
        onClick={(event) => {
          event.stopPropagation()
          if (finished.current) return
          finished.current = true
          onDoneRef.current(event.detail === 0)
        }}
      >
        Skip
      </button>
      <p className="sr-only">Playback started. Press skip or escape to open the menu.</p>
    </div>
  )
}
