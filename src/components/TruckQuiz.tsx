'use client'

import { useCallback, useEffect, useState } from 'react'
import SanityImage from '@/components/SanityImage'
import type { SanityImageValue } from '@/lib/sanityImage'

const QUESTIONS = 10
const SECONDS = 15

export type QuizImage = SanityImageValue & {
  truckTitle: string
  manufacturerName: string
}

type Phase = 'lobby' | 'play' | 'done'

function choicesFor(images: QuizImage[], index: number): { correct: string; choices: string[] } | null {
  if (images.length < 4) return null
  const current = images[index]
  if (!current) return null
  const correct = current.truckTitle
  const same = [...new Set(images.filter((image, i) => i !== index && image.manufacturerName === current.manufacturerName && image.truckTitle !== correct).map((image) => image.truckTitle))]
  const other = [...new Set(images.filter((image, i) => i !== index && image.manufacturerName !== current.manufacturerName && image.truckTitle !== correct).map((image) => image.truckTitle))]
  const pool = [...same, ...other].filter((choice, i, list) => choice !== correct && list.indexOf(choice) === i)
  const wrong = pool.sort(() => Math.random() - 0.5).slice(0, 3)
  if (wrong.length < 1) return null
  const choices = [correct, ...wrong].sort(() => Math.random() - 0.5)
  return { correct, choices: [...new Set(choices)] }
}

export default function TruckQuiz({ images, onExit }: { images: QuizImage[]; onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>('lobby')
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [answered, setAnswered] = useState(0)
  const [timeLeft, setTimeLeft] = useState(SECONDS)
  const [showAnswer, setShowAnswer] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [choices, setChoices] = useState<string[]>([])
  const [correct, setCorrect] = useState('')

  const deal = useCallback((at: number) => {
    const next = choicesFor(images, at)
    if (!next) {
      setChoices([])
      setCorrect('')
      return
    }
    setCorrect(next.correct)
    setChoices(next.choices)
  }, [images])

  useEffect(() => {
    if (phase === 'play') deal(index)
  }, [phase, index, deal])

  useEffect(() => {
    if (phase !== 'play' || showAnswer) return
    if (timeLeft <= 0) return
    const timer = window.setTimeout(() => setTimeLeft((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [phase, timeLeft, showAnswer])

  function start() {
    setScore(0)
    setAnswered(0)
    setIndex(0)
    setTimeLeft(SECONDS)
    setShowAnswer(false)
    setSelected(null)
    setPhase('play')
  }

  function answer(choice: string | null) {
    if (showAnswer || phase !== 'play') return
    setSelected(choice)
    setShowAnswer(true)
    const nextScore = choice === correct ? score + 1 : score
    const nextCount = answered + 1
    if (choice === correct) setScore(nextScore)
    setAnswered(nextCount)
    window.setTimeout(() => {
      if (nextCount >= QUESTIONS) {
        setPhase('done')
        setShowAnswer(false)
        return
      }
      setIndex((value) => (value + 1) % images.length)
      setTimeLeft(SECONDS)
      setShowAnswer(false)
      setSelected(null)
    }, 1400)
  }

  useEffect(() => {
    if (phase === 'play' && timeLeft === 0 && !showAnswer) answer(null)
    // answer is recreated each render; the guard stops a second call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, phase, showAnswer])

  const still = images[index]

  if (phase === 'lobby') {
    return (
      <section className="quiz" aria-labelledby="quiz-title">
        <p className="kicker">Arcade</p>
        <h2 id="quiz-title" className="display">Name that truck</h2>
        <p className="lede">Ten stills. Fifteen seconds each. Four names.</p>
        {images.length < 4 ? <p className="state">Not enough stills to deal a round.</p> : null}
        <div className="quiz-actions">
          <button type="button" className="btn btn-accent" onClick={start} disabled={images.length < 4}>Start</button>
          <button type="button" className="btn" onClick={onExit}>Back to the reel</button>
        </div>
      </section>
    )
  }

  if (phase === 'done') {
    return (
      <section className="quiz" aria-labelledby="quiz-score">
        <p className="kicker">Round over</p>
        <h2 id="quiz-score" className="display">{score} / {QUESTIONS}</h2>
        <p className="lede">
          {score === QUESTIONS ? 'A clean reel.' : `You named ${score} ${score === 1 ? 'truck' : 'trucks'}.`}
        </p>
        <div className="quiz-actions">
          <button type="button" className="btn btn-accent" onClick={start}>Play again</button>
          <button type="button" className="btn" onClick={onExit}>Back to the reel</button>
        </div>
      </section>
    )
  }

  return (
    <section className="quiz" aria-label="Name that truck">
      <div className="quiz-hud">
        <span>Q {Math.min(answered + 1, QUESTIONS)} / {QUESTIONS}</span>
        <span>Score {score}</span>
        <span>{timeLeft}s</span>
      </div>
      <div className="quiz-meter" aria-hidden="true">
        <span style={{ width: `${(timeLeft / SECONDS) * 100}%` }} />
      </div>
      {still?.asset?._ref ? (
        <div className="quiz-still">
          <SanityImage
            image={still}
            alt=""
            sizes="(max-width: 800px) 100vw, 860px"
            fill
            cropRatio={0.625}
            className="sanity-cover"
          />
        </div>
      ) : null}
      <div className="quiz-choices">
        {choices.map((choice) => {
          const right = showAnswer && choice === correct
          const wrong = showAnswer && choice === selected && choice !== correct
          const dim = showAnswer && !right && !wrong
          return (
            <button
              key={choice}
              type="button"
              className={`quiz-choice${right ? ' is-right' : ''}${wrong ? ' is-wrong' : ''}${dim ? ' is-dim' : ''}`}
              onClick={() => answer(choice)}
              disabled={showAnswer}
            >
              {choice}
            </button>
          )
        })}
      </div>
      {showAnswer ? (
        <p className={selected === correct ? 'quiz-note is-right' : 'quiz-note is-wrong'} role="status">
          {selected === correct ? 'Correct' : selected === null ? "Time's up" : `It was ${correct}`}
        </p>
      ) : null}
      <div className="quiz-actions">
        <button type="button" className="btn" onClick={onExit}>Exit</button>
      </div>
    </section>
  )
}
