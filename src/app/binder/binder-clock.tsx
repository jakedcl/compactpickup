'use client'

import { useEffect, useState } from 'react'

export function BinderClock() {
  const [time, setTime] = useState('--:--:--')

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      const hh = String(now.getHours()).padStart(2, '0')
      const mm = String(now.getMinutes()).padStart(2, '0')
      const ss = String(now.getSeconds()).padStart(2, '0')
      setTime(`${hh}:${mm}:${ss}`)
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])

  return <span>{time}</span>
}
