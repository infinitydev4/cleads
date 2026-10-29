"use client"

import { useEffect, useState, useRef } from "react"

interface StatsCounterProps {
  end: number
  duration: number
  suffix?: string
  prefix?: string
}

export function StatsCounter({ end, duration, suffix = "", prefix = "" }: StatsCounterProps) {
  const [count, setCount] = useState(0)
  const countRef = useRef<number>(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const startTime = Date.now()
    const endTime = startTime + duration

    const updateCounter = () => {
      const now = Date.now()
      const remaining = Math.max(endTime - now, 0)
      const progress = 1 - remaining / duration

      countRef.current = Math.floor(progress * end)
      setCount(countRef.current)

      if (remaining > 0) {
        timerRef.current = setTimeout(updateCounter, 16)
      } else {
        setCount(end)
      }
    }

    updateCounter()

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [end, duration])

  return (
    <div className="text-4xl font-bold">
      {prefix}
      {count}
      {suffix}
    </div>
  )
}

