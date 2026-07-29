import { useRef, useState } from 'react'
import { formatTime } from '../utils/format'

interface ProgressBarProps {
  currentTime: number
  duration: number
  onSeek: (time: number) => void
}

/** 可拖拽的播放进度条 */
export function ProgressBar({ currentTime, duration, onSeek }: ProgressBarProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const [dragTime, setDragTime] = useState(0)

  const ratio = duration > 0 ? (dragging ? dragTime : currentTime) / duration : 0
  const displayTime = dragging ? dragTime : currentTime

  const timeFromPointer = (clientX: number) => {
    const el = trackRef.current
    if (!el || duration <= 0) return 0
    const rect = el.getBoundingClientRect()
    const p = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return p * duration
  }

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    setDragging(true)
    const t = timeFromPointer(e.clientX)
    setDragTime(t)
    onSeek(t)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return
    e.preventDefault()
    const t = timeFromPointer(e.clientX)
    setDragTime(t)
    onSeek(t)
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging) return
    e.preventDefault()
    setDragging(false)
    onSeek(timeFromPointer(e.clientX))
  }

  return (
    <div className="w-full select-none px-1">
      <div
        ref={trackRef}
        className="group relative h-5 cursor-pointer touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-neutral-200">
          <div
            className="h-full rounded-full bg-neutral-800 transition-[width] duration-75"
            style={{ width: `${Math.max(0, Math.min(100, ratio * 100))}%` }}
          />
        </div>
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-900 shadow-md shadow-neutral-900/20 transition-transform group-active:scale-125"
          style={{ left: `${Math.max(0, Math.min(100, ratio * 100))}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-xs text-neutral-400">
        <span>{formatTime(displayTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  )
}
