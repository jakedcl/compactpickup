'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import SanityImage from '@/components/SanityImage'
import {
  ROUND,
  SECONDS,
  choicesFor,
  readBestStreak,
  writeBestStreak,
  type GameStill,
} from '@/lib/gameDeck'
import { prefersReducedMotion } from '@/lib/vhsSession'

export default function NameThatTruck({ stills }: { stills: GameStill[] }) {
  const deck = useMemo(() => stills.slice(0, ROUND), [stills])
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [roundBest, setRoundBest] = useState(0)
  const [best, setBest] = useState(0)
  const [phase, setPhase] = useState<'play' | 'reveal' | 'done'>('play')
  const [timeLeft, setTimeLeft] = useState(SECONDS)
  const [choices, setChoices] = useState<string[]>([])
  const [correct, setCorrect] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [flash, setFlash] = useState<'right' | 'wrong' | null>(null)
  const lock = useRef(false)
  const correctRef = useRef('')
  const [motion, setMotion] = useState(false)

  useEffect(() => {
    setBest(readBestStreak())
    setMotion(!prefersReducedMotion())
  }, [])

  useEffect(() => {
    if (phase !== 'play') return
    const dealt = choicesFor(stills, index)
    setCorrect(dealt?.correct ?? '')
    setChoices(dealt?.choices ?? [])
    setTimeLeft(SECONDS)
    setSelected(null)
    setFlash(null)
    lock.current = false
  }, [phase, index, stills])

  correctRef.current = correct

  function finishAnswer(choice: string | null) {
    if (lock.current || phase !== 'play') return
    lock.current = true
    const answer = correctRef.current
    const hit = choice != null && choice === answer
    setSelected(choice)
    setFlash(hit ? 'right' : 'wrong')
    setPhase('reveal')
    if (hit) {
      setScore((value) => value + 1)
      setStreak((value) => {
        const next = value + 1
        setRoundBest((peak) => Math.max(peak, next))
        setBest((current) => {
          const top = Math.max(current, next)
          if (top > current) writeBestStreak(top)
          return top
        })
        return next
      })
      return
    }
    setStreak(0)
  }

  useEffect(() => {
    if (phase !== 'play') return
    if (timeLeft <= 0) {
      finishAnswer(null)
      return
    }
    const timer = window.setTimeout(() => setTimeLeft((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
    // finishAnswer closes over the current question on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timeLeft])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (phase === 'play' && ['1', '2', '3', '4'].includes(event.key)) {
        const choice = choices[Number(event.key) - 1]
        if (!choice) return
        event.preventDefault()
        finishAnswer(choice)
      }
      if (phase === 'reveal' && (event.key === 'Enter' || event.key === 'n' || event.key === 'N')) {
        event.preventDefault()
        goNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function goNext() {
    if (index + 1 >= deck.length || index + 1 >= ROUND) {
      setPhase('done')
      return
    }
    setTimeLeft(SECONDS)
    setIndex((value) => value + 1)
    setPhase('play')
  }

  function replay() {
    lock.current = false
    setIndex(0)
    setScore(0)
    setStreak(0)
    setRoundBest(0)
    setPhase('play')
    setFlash(null)
    setSelected(null)
  }

  if (deck.length < 4) {
    return (
      <section className="game-page">
        <p className="kicker">Name that truck</p>
        <p className="state">Not enough stills to deal a round.</p>
        <Link href="/" className="btn">Back home</Link>
      </section>
    )
  }

  const still = deck[index]
  const years = still?.yearRange?.trim()
  const truckHref = still?.manufacturerSlug && still.truckSlug ? `/${still.manufacturerSlug}/${still.truckSlug}` : null
  const hit = selected != null && selected === correct

  if (phase === 'done') {
    return (
      <section className="game-page" aria-labelledby="game-score">
        <p className="kicker">Round over</p>
        <h1 id="game-score" className="display">{score} / {deck.length}</h1>
        <p className="lede">{score === deck.length ? 'A clean reel.' : `You named ${score} ${score === 1 ? 'truck' : 'trucks'}.`}</p>
        <dl className="game-stats">
          <div><dt>Best streak</dt><dd>{best}</dd></div>
          <div><dt>This round</dt><dd>{roundBest}</dd></div>
        </dl>
        <div className="quiz-actions">
          <button type="button" className="btn btn-accent" onClick={replay}>Play again</button>
          <Link href="/" className="btn">Exit</Link>
        </div>
      </section>
    )
  }

  return (
    <section className="game-page" aria-label="Name that truck">
      <div className="game-hud">
        <span>Q {index + 1} / {deck.length}</span>
        <span>Score {score}</span>
        <span>Streak {streak}</span>
        <span>Best {best}</span>
        <span>{timeLeft}s</span>
      </div>
      <div className="game-progress" aria-hidden="true">
        {deck.map((item, itemIndex) => (
          <span key={item.asset?._ref ?? itemIndex} className={itemIndex < index ? 'is-done' : itemIndex === index ? 'is-now' : ''} />
        ))}
      </div>
      <div className={`game-still${flash ? ` is-${flash}${motion ? ' is-motion' : ''}` : ''}`}>
        {still?.asset?._ref ? (
          <SanityImage
            image={still}
            alt=""
            sizes="(max-width: 800px) 100vw, 860px"
            fill
            cropRatio={0.625}
            eager
            className="sanity-cover"
          />
        ) : null}
      </div>
      <div className="game-choices">
        {choices.map((choice, choiceIndex) => {
          const right = phase === 'reveal' && choice === correct
          const wrong = phase === 'reveal' && choice === selected && choice !== correct
          const dim = phase === 'reveal' && !right && !wrong
          return (
            <button
              key={choice}
              type="button"
              className={`game-choice${right ? ' is-right' : ''}${wrong ? ' is-wrong' : ''}${dim ? ' is-dim' : ''}`}
              onClick={() => finishAnswer(choice)}
              disabled={phase !== 'play'}
            >
              <span className="game-key">{choiceIndex + 1}</span>
              {choice}
            </button>
          )
        })}
      </div>
      {phase === 'reveal' ? (
        <div className="game-reveal" role="status">
          <p className={hit ? 'quiz-note is-right' : 'quiz-note is-wrong'}>
            {hit ? 'Correct' : selected == null ? "Time's up" : 'Not that one'}
          </p>
          <h2 className="game-reveal-title">{still?.manufacturerName} {still?.truckTitle}</h2>
          {years ? <p className="game-years">{years}</p> : null}
          <div className="quiz-actions">
            {truckHref ? <Link href={truckHref} className="btn">Open the truck</Link> : null}
            <button type="button" className="btn btn-accent" onClick={goNext}>Next</button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
