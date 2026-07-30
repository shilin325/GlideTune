import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDrag } from '@use-gesture/react'
import { DEFAULT_BPM, type Song } from '../types'

/** 将 BPM 限制在合理区间，返回一拍时长（ms） */
function beatDurationMs(bpm?: number) {
  const n = Number.isFinite(bpm) ? (bpm as number) : DEFAULT_BPM
  const clamped = Math.min(220, Math.max(40, n))
  return 60_000 / clamped
}

/** 水平滑动超过该阈值（px）才触发切歌 */
const SWIPE_THRESHOLD = 50
/** 判定为「点击」的最大位移（px） */
const TAP_MOVE_TOLERANCE = 12
/** 拖拽多少像素对应旋转一格 */
const DRAG_PER_STEP = 90
/** 封面卡片边长（px） */
const COVER_SIZE = 148
/** 平铺模式下当前曲放大封面 */
const FLAT_HERO_SIZE = 220
/** 平铺模式小封面 */
const FLAT_TILE_SIZE = 72
/** 相邻封面间隙系数：1 = 刚好贴边，>1 拉开间距 */
const GAP_RATIO = 1.42
/** 场景透视距离 */
const PERSPECTIVE = 1400

export type CoverLayout = 'orbit' | 'flat'

interface AlbumCoverProps {
  songs: Song[]
  currentIndex: number
  isPlaying: boolean
  canPrev: boolean
  canNext: boolean
  /** orbit = 三维环绕；flat = 平铺列表 */
  layout?: CoverLayout
  /** 当前曲实测/有效 BPM，优先于 song.bpm 用于节拍动效 */
  beatBpm?: number
  onPrev: () => boolean
  onNext: () => boolean
  onBoundary: (dir: 'left' | 'right') => void
  onSelect?: (index: number) => void
  /** 双击当前大封面：三维 / 平铺切换 */
  onToggleLayout?: () => void
}

/**
 * 三维圆柱环绕封面 / 捏合后的平铺列表：
 * - orbit：保持原有圆柱环绕布局与交互；双击当前封面切平铺
 * - flat：当前曲大封面 + 其余横向平铺；双击大封面回环绕，点小封面切歌
 */
export function AlbumCover({
  songs,
  currentIndex,
  isPlaying,
  canPrev,
  canNext,
  layout = 'orbit',
  beatBpm,
  onPrev,
  onNext,
  onBoundary,
  onSelect,
  onToggleLayout,
}: AlbumCoverProps) {
  const count = songs.length
  const angleStep = count > 0 ? 360 / count : 0
  const radius = useMemo(() => {
    if (count < 2) return COVER_SIZE
    // 按封面宽度计算贴边半径，再乘间隙系数，保证专辑之间留白
    const fitRadius = COVER_SIZE / 2 / Math.tan(Math.PI / count)
    return Math.round(fitRadius * GAP_RATIO)
  }, [count])

  const [dragAngle, setDragAngle] = useState(0)
  const [animating, setAnimating] = useState(false)
  const [bounce, setBounce] = useState(false)

  const axisRef = useRef<'x' | 'y' | null>(null)
  const animTimer = useRef<number | null>(null)
  const skipIndexAnim = useRef(false)
  const flatListRef = useRef<HTMLDivElement>(null)

  const baseAngle = -currentIndex * angleStep
  const rotation = baseAngle + dragAngle
  const isFlat = layout === 'flat'

  const snapHome = useCallback((withTransition = true) => {
    if (withTransition) {
      setAnimating(true)
      if (animTimer.current) window.clearTimeout(animTimer.current)
      animTimer.current = window.setTimeout(() => setAnimating(false), 420)
    }
    setDragAngle(0)
  }, [])

  useEffect(() => {
    setDragAngle(0)
    if (skipIndexAnim.current) {
      skipIndexAnim.current = false
      setAnimating(false)
      return
    }
    setAnimating(true)
    if (animTimer.current) window.clearTimeout(animTimer.current)
    animTimer.current = window.setTimeout(() => setAnimating(false), 420)
    return () => {
      if (animTimer.current) window.clearTimeout(animTimer.current)
    }
  }, [currentIndex])

  useEffect(() => {
    if (!isFlat) return
    const el = flatListRef.current?.querySelector<HTMLElement>(`[data-song-index="${currentIndex}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [currentIndex, isFlat])

  const bind = useDrag(
    ({
      first,
      last,
      movement: [mx, my],
      velocity: [vx],
      event,
      tap,
    }) => {
      if (event.cancelable) event.preventDefault()

      if (first) {
        axisRef.current = null
        setAnimating(false)
      }

      // 轴锁定：纵滑忽略，仅横滑旋转切歌
      if (!axisRef.current) {
        if (Math.abs(mx) > 14 && Math.abs(mx) > Math.abs(my)) axisRef.current = 'x'
        else if (Math.abs(my) > 14 && Math.abs(my) > Math.abs(mx)) axisRef.current = 'y'
      }

      const axis = axisRef.current

      if (axis === 'y') {
        return
      }

      if (axis === 'x') {
        let visual = mx
        const atLeftEdge = !canPrev && mx > 0
        const atRightEdge = !canNext && mx < 0
        if (atLeftEdge || atRightEdge) {
          visual = mx * 0.28
        }
        setDragAngle((visual / DRAG_PER_STEP) * angleStep)
      }

      if (last) {
        if (tap || (Math.abs(mx) < TAP_MOVE_TOLERANCE && Math.abs(my) < TAP_MOVE_TOLERANCE)) {
          snapHome()
          return
        }

        if (axis === 'x') {
          const shouldSwitch =
            Math.abs(mx) >= SWIPE_THRESHOLD || Math.abs(vx) > 0.45

          if (shouldSwitch) {
            // 右滑（mx>0）上一首；左滑（mx<0）下一首
            if (mx > 0) {
              if (!canPrev) {
                onBoundary('left')
                setBounce(true)
                window.setTimeout(() => setBounce(false), 350)
                snapHome()
              } else {
                setAnimating(true)
                setDragAngle(angleStep)
                window.setTimeout(() => {
                  skipIndexAnim.current = true
                  onPrev()
                  setDragAngle(0)
                  setAnimating(false)
                }, 340)
                return
              }
            } else {
              if (!canNext) {
                onBoundary('right')
                setBounce(true)
                window.setTimeout(() => setBounce(false), 350)
                snapHome()
              } else {
                setAnimating(true)
                setDragAngle(-angleStep)
                window.setTimeout(() => {
                  skipIndexAnim.current = true
                  onNext()
                  setDragAngle(0)
                  setAnimating(false)
                }, 340)
                return
              }
            }
          }
        }

        snapHome()
      }
    },
    {
      filterTaps: true,
      threshold: 4,
      pointer: { touch: true },
      eventOptions: { passive: false },
      preventScroll: true,
    },
  )

  if (count === 0) return null

  const current = songs[currentIndex]

  // —— 平铺模式（独立布局，不影响环绕 DOM）——
  if (isFlat) {
    return (
      <div className="relative flex w-full flex-1 flex-col items-center justify-center overflow-visible animate-fade-in">
        <div
          className="relative flex w-full flex-col items-center justify-center gap-4"
          style={{
            minHeight: Math.max(FLAT_HERO_SIZE + FLAT_TILE_SIZE + 72, 320),
          }}
        >
          {current && (
            <button
              type="button"
              onDoubleClick={(e) => {
                e.preventDefault()
                onToggleLayout?.()
              }}
              className="relative shrink-0 cursor-pointer overflow-hidden bg-neutral-200 shadow-2xl shadow-neutral-900/25 outline outline-2 outline-white/90"
              style={{
                width: FLAT_HERO_SIZE,
                height: FLAT_HERO_SIZE,
              }}
              aria-label={`双击切换布局 · ${current.title}`}
            >
              <img
                src={current.cover}
                alt={`${current.title} cover`}
                className="h-full w-full object-cover will-change-transform"
                draggable={false}
                style={
                  isPlaying
                    ? {
                        animation: `cover-beat ${beatDurationMs(beatBpm ?? current.bpm)}ms ease-out infinite`,
                      }
                    : undefined
                }
              />
              {isPlaying && (
                <span className="absolute bottom-2 right-2 rounded-full bg-neutral-900/75 px-2 py-0.5 text-[10px] font-medium tracking-wide text-white">
                  NOW
                </span>
              )}
            </button>
          )}

          <div
            ref={flatListRef}
            className="flex w-full max-w-md gap-2.5 overflow-x-auto px-3 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {songs.map((song, i) => {
              const active = i === currentIndex
              return (
                <button
                  key={song.id}
                  type="button"
                  data-song-index={i}
                  onClick={() => onSelect?.(i)}
                  aria-label={`播放 ${song.title}`}
                  aria-current={active ? 'true' : undefined}
                  className={`relative shrink-0 overflow-hidden bg-neutral-200 transition-all duration-300 ${
                    active
                      ? 'scale-105 shadow-lg shadow-neutral-900/20 outline outline-2 outline-neutral-900'
                      : 'opacity-80 outline outline-1 outline-white/40 hover:opacity-100'
                  }`}
                  style={{ width: FLAT_TILE_SIZE, height: FLAT_TILE_SIZE }}
                >
                  <img
                    src={song.cover}
                    alt=""
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                </button>
              )
            })}
          </div>
        </div>

        <p className="pointer-events-none mt-1 text-center text-[11px] tracking-wide text-neutral-400">
          双击大封面/捏合返回环绕 · 点小封面切歌
        </p>
      </div>
    )
  }

  // —— 三维环绕：与原布局一致（勿在父级加 transform，避免压扁 3D）——
  const stageHeight = Math.max(COVER_SIZE + 80, Math.round(radius * 1.15))

  return (
    <div className="relative flex w-full flex-1 flex-col items-center justify-center overflow-visible">
      <div
        {...bind()}
        onDoubleClick={() => onToggleLayout?.()}
        className={`relative w-full touch-none select-none overflow-visible ${bounce ? 'animate-shake' : ''}`}
        style={{
          height: stageHeight,
          perspective: `${PERSPECTIVE}px`,
          perspectiveOrigin: '50% 42%',
          touchAction: 'none',
        }}
      >
        {/* 地面柔光，衬托环绕深度 */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 rounded-full bg-neutral-900/[0.06] blur-2xl"
          style={{
            width: radius * 2.4,
            height: COVER_SIZE * 0.5,
            marginTop: COVER_SIZE * 0.4,
          }}
        />

        <div
          className="absolute left-1/2 top-1/2"
          style={{
            width: COVER_SIZE,
            height: COVER_SIZE,
            marginLeft: -COVER_SIZE / 2,
            marginTop: -COVER_SIZE / 2,
            transformStyle: 'preserve-3d',
            transform: `translateZ(${-radius * 0.18}px) rotateY(${rotation}deg)`,
            transition: animating
              ? 'transform 0.36s cubic-bezier(0.22, 1, 0.36, 1)'
              : 'none',
          }}
        >
          {songs.map((song, i) => {
            const isActive = i === currentIndex
            const theta = i * angleStep

            return (
              <div
                key={song.id}
                className="absolute left-0 top-0"
                style={{
                  width: COVER_SIZE,
                  height: COVER_SIZE,
                  transformStyle: 'preserve-3d',
                  transform: `rotateY(${theta}deg) translateZ(${radius}px) scale(${isActive ? 1.08 : 0.92})`,
                }}
              >
                <CoverFace
                  src={song.cover}
                  alt={`${song.title} cover`}
                  active={isActive}
                  playing={isPlaying}
                  bpm={isActive ? beatBpm ?? song.bpm : song.bpm}
                  side="front"
                />
                <CoverFace
                  src={song.cover}
                  alt=""
                  active={false}
                  playing={false}
                  side="back"
                />
              </div>
            )
          })}
        </div>
      </div>

      <p className="pointer-events-none mt-1 text-center text-[11px] tracking-wide text-neutral-400">
        左右滑环绕切换 · 双击切换布局
      </p>
    </div>
  )
}

function CoverFace({
  src,
  alt,
  active,
  playing,
  bpm,
  side,
}: {
  src: string
  alt: string
  active: boolean
  playing: boolean
  bpm?: number
  side: 'front' | 'back'
}) {
  const beat = active && playing
  return (
    <div
      className="absolute inset-0 overflow-hidden bg-neutral-200"
      style={{
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        transform: side === 'back' ? 'rotateY(180deg)' : undefined,
        boxShadow: active
          ? '0 24px 50px rgba(15, 23, 42, 0.28)'
          : '0 14px 32px rgba(15, 23, 42, 0.14)',
        outline: active ? '2px solid rgba(255,255,255,0.9)' : '1px solid rgba(255,255,255,0.35)',
      }}
    >
      <img
        src={src}
        alt={alt}
        className="h-full w-full object-cover will-change-transform"
        draggable={false}
        style={
          beat
            ? {
                animation: `cover-beat ${beatDurationMs(bpm)}ms ease-out infinite`,
              }
            : undefined
        }
      />
      {side === 'front' && !active && (
        <div className="pointer-events-none absolute inset-0 bg-black/15" />
      )}
      {side === 'back' && (
        <div className="pointer-events-none absolute inset-0 bg-black/25" />
      )}
    </div>
  )
}
