'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { urlFor } from '@/lib/sanity'

interface TruckImageData {
  alt?: string
  caption?: string
  asset: {
    _ref: string
  }
  truckTitle: string
  yearRange?: string
  manufacturerName: string
  truckSlug: string
  manufacturerSlug: string
}

interface ImageCarouselProps {
  images: TruckImageData[]
  className?: string
}

// Function to shuffle array (Fisher-Yates algorithm)
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

export default function ImageCarousel({ images: allImages, className = '' }: ImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [images, setImages] = useState<TruckImageData[]>([])
  const [isAutoPlaying, setIsAutoPlaying] = useState(true)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)
  const [gameMode, setGameMode] = useState(false)
  const [score, setScore] = useState(0)
  const [questionsAnswered, setQuestionsAnswered] = useState(0)
  const [timeLeft, setTimeLeft] = useState(15)
  const [showAnswer, setShowAnswer] = useState(false)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [gameChoices, setGameChoices] = useState<string[]>([])
  const [correctAnswer, setCorrectAnswer] = useState('')

  // Game functions - defined before useEffect hooks that reference them
  const generateGameChoices = useCallback(() => {
    if (images.length < 4) return

    const currentTruck = images[currentIndex]
    const currentManufacturer = currentTruck.manufacturerName
    const correctName = currentTruck.truckTitle
    
    setCorrectAnswer(correctName)

    // Get all unique truck titles from the same manufacturer (excluding current one)
    const sameManufacturerTrucks = Array.from(new Set(
      images
        .filter((img, index) => 
          index !== currentIndex && 
          img.manufacturerName === currentManufacturer &&
          img.truckTitle !== correctName // Extra safety to avoid duplicates
        )
        .map(img => img.truckTitle)
    ))

    // Get all unique truck titles from other manufacturers
    const otherTrucks = Array.from(new Set(
      images
        .filter((img, index) => 
          index !== currentIndex && 
          img.manufacturerName !== currentManufacturer &&
          img.truckTitle !== correctName // Extra safety to avoid duplicates
        )
        .map(img => img.truckTitle)
    ))

    // Build wrong choices array ensuring no duplicates
    let wrongChoices: string[] = []
    
    // First, add same manufacturer trucks (shuffled)
    const shuffledSameManufacturer = [...sameManufacturerTrucks].sort(() => Math.random() - 0.5)
    wrongChoices = [...wrongChoices, ...shuffledSameManufacturer]
    
    // If we need more choices, add from other manufacturers (shuffled)
    if (wrongChoices.length < 3) {
      const shuffledOtherTrucks = [...otherTrucks].sort(() => Math.random() - 0.5)
      wrongChoices = [...wrongChoices, ...shuffledOtherTrucks]
    }

    // Take only first 3 unique wrong choices
    wrongChoices = wrongChoices.slice(0, 3)

    // Final safety check: remove any that match the correct answer
    wrongChoices = wrongChoices.filter(choice => choice !== correctName)

    // If we still don't have 3 unique wrong choices, pad with available options
    if (wrongChoices.length < 3) {
      const allOtherChoices = Array.from(new Set([...sameManufacturerTrucks, ...otherTrucks]))
        .filter(choice => choice !== correctName && !wrongChoices.includes(choice))
        .sort(() => Math.random() - 0.5)
      
      wrongChoices = [...wrongChoices, ...allOtherChoices].slice(0, 3)
    }

    // Combine correct answer with wrong choices and shuffle
    const allChoices = [correctName, ...wrongChoices].sort(() => Math.random() - 0.5)
    
    // Final verification: ensure all choices are unique
    const uniqueChoices = Array.from(new Set(allChoices))
    setGameChoices(uniqueChoices)
  }, [images, currentIndex])

  const nextImage = useCallback(() => {
    setImageLoaded(false)
    setCurrentIndex((prev) => (prev + 1) % images.length)
  }, [images.length])

  const prevImage = useCallback(() => {
    setImageLoaded(false)
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length)
  }, [images.length])

  const goToImage = useCallback((index: number) => {
    setImageLoaded(false)
    setCurrentIndex(index)
  }, [])

  const handleImageLoad = useCallback(() => {
    setImageLoaded(true)
  }, [])

  // Game functions
  const resetQuestion = useCallback(() => {
    setTimeLeft(15)
    setShowAnswer(false)
    setSelectedAnswer(null)
    setImageLoaded(false)
  }, [])

  const endGame = useCallback(() => {
    setGameMode(false)
    setIsAutoPlaying(true)
    setShowAnswer(false)
    setSelectedAnswer(null)
  }, [])

  const startGame = useCallback(() => {
    setGameMode(true)
    setScore(0)
    setQuestionsAnswered(0)
    setIsAutoPlaying(false)
    resetQuestion()
  }, [resetQuestion])

  const handleAnswer = useCallback((answer: string | null) => {
    setSelectedAnswer(answer)
    setShowAnswer(true)
    
    if (answer === correctAnswer) {
      setScore(score + 1)
    }
    setQuestionsAnswered(questionsAnswered + 1)

    // Move to next question after 2 seconds
    setTimeout(() => {
      if (questionsAnswered + 1 >= 10) {
        // End game after 10 questions
        endGame()
      } else {
        nextImage()
        resetQuestion()
      }
    }, 2000)
  }, [correctAnswer, score, questionsAnswered, endGame, nextImage, resetQuestion])

  useEffect(() => {
    if (!allImages?.length) return
    
    const shuffledImages = shuffleArray(allImages)
    setImages(shuffledImages)
    setCurrentIndex(0)
  }, [allImages])

  useEffect(() => {
    if (!isAutoPlaying || images.length <= 1 || gameMode) return

    const interval = setInterval(() => {
      setImageLoaded(false)
      setCurrentIndex((prev) => (prev + 1) % images.length)
    }, 4000) // Change image every 4 seconds

    return () => clearInterval(interval)
  }, [images.length, isAutoPlaying, gameMode])

  // Game timer effect
  useEffect(() => {
    if (!gameMode || showAnswer) return

    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000)
      return () => clearTimeout(timer)
    } else {
      // Time's up
      handleAnswer(null)
    }
  }, [gameMode, timeLeft, showAnswer, handleAnswer])

  // Generate game choices when entering game mode or changing image
  useEffect(() => {
    if (gameMode && images.length > 0) {
      generateGameChoices()
    }
  }, [gameMode, currentIndex, images, generateGameChoices])

  // Swipe detection
  const minSwipeDistance = 50

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null) // otherwise the swipe is fired even with usual touch events
    setTouchStart(e.targetTouches[0].clientX)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX)
  }

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd || gameMode) return
    
    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance

    if (isLeftSwipe && images.length > 1) {
      nextImage()
    }
    if (isRightSwipe && images.length > 1) {
      prevImage()
    }
  }

  if (!images.length) {
    return null
  }

  return (
    <div className={`vhs-carousel ${className}`}>
      <div className="bg-black/40 border border-white/30 p-4">
        <div className="mb-4">
          {gameMode ? (
            <div className="text-center">
              <h3 className="text-white text-lg font-mono uppercase tracking-wider mb-2">
                What Model Is This?
              </h3>
              <div className="flex justify-between items-center">
                <div className="text-yellow-400 text-sm font-mono">
                  Score: {score}/{questionsAnswered}
                </div>
                <div className="text-red-400 text-sm font-mono bg-black/50 px-2 py-1 border">
                  Time: {timeLeft}s
                </div>
                <button
                  onClick={endGame}
                  className="text-white/60 hover:text-white text-xs px-2 py-1 border border-white/30 hover:border-white/60 transition-colors"
                >
                  Exit Game
                </button>
              </div>
            </div>
          ) : (
            <div className="flex justify-between items-center">
              <div className="flex-1">
                <h3 className="text-white text-lg font-mono uppercase tracking-wider text-left min-h-[1.5em] flex items-center">
                  {imageLoaded ? (
                    images[currentIndex].manufacturerName === 'More...' 
                      ? images[currentIndex].truckTitle 
                      : `${images[currentIndex].manufacturerName} ${images[currentIndex].truckTitle}`
                  ) : (
                    // Keep showing previous truck name while new image loads
                    currentIndex > 0 ? (
                      images[currentIndex - 1]?.manufacturerName === 'More...' 
                        ? images[currentIndex - 1]?.truckTitle 
                        : `${images[currentIndex - 1]?.manufacturerName} ${images[currentIndex - 1]?.truckTitle}`
                    ) : (
                      images[images.length - 1]?.manufacturerName === 'More...' 
                        ? images[images.length - 1]?.truckTitle 
                        : `${images[images.length - 1]?.manufacturerName} ${images[images.length - 1]?.truckTitle}`
                    )
                  )}
                </h3>
              </div>
              <button
                onClick={startGame}
                className="vhs-game-button ml-4 px-3 py-1 text-xs font-mono uppercase tracking-wider"
              >
                Make it a Game
              </button>
            </div>
          )}
        </div>

        {/* Main Image Display */}
        <div 
          className="relative bg-black/20 border border-white/20 overflow-hidden"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <Link 
            href={`/${images[currentIndex].manufacturerSlug}/${images[currentIndex].truckSlug}`}
            className="block"
          >
            <div className="vhs-carousel-container">
              <Image
                src={urlFor(images[currentIndex]).quality(85).url()}
                alt={images[currentIndex].alt || ''}
                width={800}
                height={600}
                className="vhs-carousel-image"
                style={{
                  objectFit: 'contain',
                  width: '100%',
                  height: 'auto',
                  maxHeight: '400px',
                }}
                priority={currentIndex === 0}
                onLoad={handleImageLoad}
              />
            </div>
          </Link>

          {/* Navigation Arrows */}
          {images.length > 1 && (
            <>
              <button
                onClick={prevImage}
                className="vhs-carousel-nav vhs-carousel-nav-left"
                onMouseEnter={() => setIsAutoPlaying(false)}
                onMouseLeave={() => setIsAutoPlaying(true)}
              >
                ◀
              </button>
              <button
                onClick={nextImage}
                className="vhs-carousel-nav vhs-carousel-nav-right"
                onMouseEnter={() => setIsAutoPlaying(false)}
                onMouseLeave={() => setIsAutoPlaying(true)}
              >
                ▶
              </button>
            </>
          )}

          {/* Digital Camera Date Print - Hide in game mode */}
          {!gameMode && (
            <div className="absolute bottom-2 right-2 bg-black/90 px-3 py-1 border-l-2 border-orange-400">
              <span className="text-orange-400 text-xs font-mono font-bold tracking-widest digital-camera-date">
                {(() => {
                  const currentImage = images[currentIndex]
                  
                  // First, check the dedicated yearRange field from Sanity
                  if (currentImage.yearRange) {
                    return currentImage.yearRange
                  }
                  
                  // Fallback: Extract year range from truck title (e.g., "1995-2004", "1982-1993")
                  const yearRangeMatch = currentImage.truckTitle.match(/\b(19|20)\d{2}[-–—]\s*(19|20)\d{2}\b/)
                  if (yearRangeMatch) {
                    return yearRangeMatch[0].replace(/[-–—]\s*/, '-')
                  }
                  
                  // Extract single year and make a range (e.g., "2004" becomes "2004-2004")
                  const singleYearMatch = currentImage.truckTitle.match(/\b(19|20)\d{2}\b/)
                  if (singleYearMatch) {
                    return `${singleYearMatch[0]}-${singleYearMatch[0]}`
                  }
                  
                  // Final fallback
                  return '----'
                })()}
              </span>
            </div>
          )}

          {/* Image Caption Overlay - Only show if there's a caption */}
          {images[currentIndex].caption && (
            <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-white/90 text-xs p-3 text-center uppercase tracking-wider">
              {images[currentIndex].caption}
            </div>
          )}
        </div>

        {/* Game Mode: Multiple Choice */}
        {gameMode && gameChoices.length > 0 && (
          <div className="mt-4">
            <div className="grid grid-cols-1 gap-2">
              {gameChoices.map((choice, index) => (
                <button
                  key={index}
                  onClick={(e) => {
                    if (!showAnswer) {
                      // Remove focus to prevent sticky hover states
                      e.currentTarget.blur()
                      handleAnswer(choice)
                    }
                  }}
                  onTouchEnd={(e) => {
                    // Prevent sticky hover on touch devices
                    e.currentTarget.blur()
                  }}
                  disabled={showAnswer}
                  className={`vhs-game-choice ${
                    showAnswer && choice === correctAnswer ? 'vhs-game-choice-correct' :
                    showAnswer && choice === selectedAnswer && choice !== correctAnswer ? 'vhs-game-choice-wrong' :
                    showAnswer ? 'vhs-game-choice-disabled' :
                    'vhs-game-choice-active'
                  }`}
                >
                  <span className="text-yellow-400 mr-3 font-bold">{String.fromCharCode(65 + index)}.</span>
                  {choice}
                </button>
              ))}
            </div>
            {showAnswer && (
              <div className="mt-3 text-center text-sm font-mono">
                {selectedAnswer === correctAnswer ? (
                  <span className="text-green-400">✓ Correct!</span>
                ) : selectedAnswer === null ? (
                  <span className="text-red-400">⏰ Time&apos;s up!</span>
                ) : (
                  <span className="text-red-400">✗ Wrong! It was: {correctAnswer}</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Thumbnail Navigation - Hide in game mode */}
        {!gameMode && images.length > 1 && (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
            {images.map((image, index) => (
              <button
                key={index}
                onClick={() => goToImage(index)}
                className={`vhs-carousel-thumb ${
                  index === currentIndex ? 'vhs-carousel-thumb-active' : ''
                }`}
                onMouseEnter={() => setIsAutoPlaying(false)}
                onMouseLeave={() => setIsAutoPlaying(true)}
              >
                <Image
                  src={urlFor(image).width(80).height(60).quality(70).url()}
                  alt={image.alt || ''}
                  width={80}
                  height={60}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}

        {/* VHS-style Progress Indicator */}
        {images.length > 1 && (
          <div className="mt-3 flex justify-center">
            <div className="flex gap-1">
              {images.map((_, index) => (
                <div
                  key={index}
                  className={`w-2 h-1 transition-all duration-300 ${
                    index === currentIndex 
                      ? 'bg-white' 
                      : 'bg-white/30'
                  }`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
