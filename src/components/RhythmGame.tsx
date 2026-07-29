import { useEffect, useMemo, useRef, useState } from 'react'
import {
  applyHit,
  emptyScore,
  generateChart,
  isNoteVisible,
  judgeTiming,
  noteProgress,
} from '../game/rhythmEngine'
import {
  FALL_DURATION,
  GOOD_WINDOW,
  LANE_COUNT,
  type NoteJudgement,
  type RhythmNote,
  type RhythmScore,
} from '../game/rhythmTypes'
import type { HandFrame } from '../hand/types'

interface RhythmGameProps {
  open: boolean
  songId: number
  songTitle: string
  currentTime: number
  duration: number
  isPlaying: boolean
  frameRef: React.MutableRefObject<HandFrame | null>
  handReady: boolean
  onClose: () => void
  onRequestPlay: () => void
}

const NOTE_COLORS = ['#292524', '#44403c', '#57534e', '#1c1917']
const HIT_FLASH: Record<Exclude<NoteJudgement, 'miss'>, string> = {
  perfect: '#f43f5e',
  good: '#0d9488',
}

/**
 * 打地鼠式下落音符：
 * - 音符随音乐时间轴下落
 * - 用镜像后的手掌/食指位置「砸」判定线上的方块
 */
export function RhythmGame({
  open,
  songId,
  songTitle,
  currentTime,
  duration,
  isPlaying,
  frameRef,
  handReady,
  onClose,
  onRequestPlay,
}: RhythmGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const notesRef = useRef<RhythmNote[]>([])
  const scoreRef = useRef<RhythmScore>(emptyScore())
  const timeRef = useRef(currentTime)
  const playingRef = useRef(isPlaying)
  const floatTexts = useRef<{ text: string; x: number; y: number; life: number; color: string }[]>([])
  const hitFx = useRef<{ lane: number; life: number; color: string }[]>([])
  const lastHitAt = useRef(0)

  const [score, setScore] = useState<RhythmScore>(emptyScore())
  const [hint, setHint] = useState('张开手掌对准下落方块击打')

  const chartKey = useMemo(() => `${songId}-${Math.floor(duration || 90)}`, [songId, duration])

  useEffect(() => {
    timeRef.current = currentTime
  }, [currentTime])
  useEffect(() => {
    playingRef.current = isPlaying
  }, [isPlaying])

  // 开局 / 换歌重置谱面
  useEffect(() => {
    if (!open) return
    notesRef.current = generateChart(songId, duration || 90)
    scoreRef.current = emptyScore()
    setScore(emptyScore())
    floatTexts.current = []
    hitFx.current = []
    setHint(handReady ? '手移到判定线上方击打方块' : '请开启摄像头手势后开始')
  }, [open, chartKey, songId, duration, handReady])

  // 主循环：绘制 + 碰撞
  useEffect(() => {
    if (!open) return
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let uiAcc = 0

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const { clientWidth: w, clientHeight: h } = wrap
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const laneCenterX = (lane: number, w: number) => {
      const pad = 28
      const usable = w - pad * 2
      const laneW = usable / LANE_COUNT
      return pad + laneW * (lane + 0.5)
    }

    const tryHit = (lane: number, nowAudio: number, cx: number, cy: number, hitY: number) => {
      const notes = notesRef.current
      let best: RhythmNote | null = null
      let bestAbs = Infinity
      for (const n of notes) {
        if (n.status !== 'active' || n.lane !== lane) continue
        const d = Math.abs(nowAudio - n.hitTime)
        if (d > GOOD_WINDOW) continue
        if (d < bestAbs) {
          bestAbs = d
          best = n
        }
      }
      if (!best) return

      const judgement = judgeTiming(nowAudio - best.hitTime)
      if (!judgement || judgement === 'miss') return

      best.status = 'hit'
      best.judgement = judgement
      scoreRef.current = applyHit(scoreRef.current, judgement)
      lastHitAt.current = performance.now()
      navigator.vibrate?.(judgement === 'perfect' ? [12, 20, 12] : 10)

      const color = HIT_FLASH[judgement]
      hitFx.current.push({ lane, life: 1, color })
      floatTexts.current.push({
        text: judgement === 'perfect' ? 'PERFECT' : 'GOOD',
        x: cx,
        y: Math.min(cy, hitY) - 18,
        life: 1,
        color,
      })
    }

    const loop = () => {
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      const hitY = h * 0.78
      const noteH = 52
      const noteW = Math.min(72, (w - 56) / LANE_COUNT - 12)
      const t = timeRef.current

      // 漏接
      for (const n of notesRef.current) {
        if (n.status !== 'active') continue
        if (t - n.hitTime > GOOD_WINDOW) {
          n.status = 'missed'
          n.judgement = 'miss'
          scoreRef.current = applyHit(scoreRef.current, 'miss')
          floatTexts.current.push({
            text: 'MISS',
            x: laneCenterX(n.lane, w),
            y: hitY - 10,
            life: 1,
            color: '#a8a29e',
          })
        }
      }

      // 手部命中（镜像：摄像头自拍左右对调）
      const frame = frameRef.current
      let handX = -1
      let handY = -1
      if (frame?.landmarks?.length) {
        const tip = frame.fingertips[1] ?? frame.palm
        handX = (1 - tip.x) * w
        handY = tip.y * h
        const pad = 28
        const usable = w - pad * 2
        const laneW = usable / LANE_COUNT
        const lane = Math.max(0, Math.min(LANE_COUNT - 1, Math.floor((handX - pad) / laneW)))
        // 手在判定带附近才可击打
        if (Math.abs(handY - hitY) < noteH * 1.35) {
          tryHit(lane, t, handX, handY, hitY)
        }
      }

      // 绘制
      ctx.clearRect(0, 0, w, h)

      // 背景轨道
      const pad = 28
      const usable = w - pad * 2
      const laneW = usable / LANE_COUNT
      for (let i = 0; i < LANE_COUNT; i++) {
        const x = pad + laneW * i
        ctx.fillStyle = i % 2 === 0 ? 'rgba(28,25,23,0.04)' : 'rgba(28,25,23,0.02)'
        ctx.fillRect(x, 0, laneW, h)
        ctx.strokeStyle = 'rgba(28,25,23,0.06)'
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
        ctx.stroke()
      }

      // 判定线
      const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 220)
      ctx.fillStyle = `rgba(28,25,23,${0.12 + pulse * 0.08})`
      ctx.fillRect(pad, hitY - 3, usable, 6)
      ctx.fillStyle = 'rgba(244,63,94,0.35)'
      ctx.fillRect(pad, hitY - 1, usable, 2)

      // 音符
      for (const n of notesRef.current) {
        if (n.status === 'missed') continue
        if (n.status === 'hit') continue
        if (!isNoteVisible(t, n.hitTime) && !(t < n.hitTime - FALL_DURATION)) continue

        const p = noteProgress(t, n.hitTime)
        if (p < -0.02 || p > 1.25) continue
        const cx = laneCenterX(n.lane, w)
        const y = p * hitY
        const scale = n.status === 'active' ? 1 : 0.85

        ctx.save()
        ctx.translate(cx, y)
        ctx.scale(scale, scale)
        ctx.fillStyle = NOTE_COLORS[n.lane % NOTE_COLORS.length]
        roundRect(ctx, -noteW / 2, -noteH / 2, noteW, noteH, 14)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.14)'
        roundRect(ctx, -noteW / 2 + 6, -noteH / 2 + 6, noteW - 12, 10, 6)
        ctx.fill()
        ctx.restore()
      }

      // 击打光效
      hitFx.current = hitFx.current.filter((fx) => {
        fx.life -= 0.06
        if (fx.life <= 0) return false
        const cx = laneCenterX(fx.lane, w)
        ctx.beginPath()
        ctx.arc(cx, hitY, 28 + (1 - fx.life) * 36, 0, Math.PI * 2)
        ctx.strokeStyle = fx.color
        ctx.globalAlpha = fx.life * 0.85
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.globalAlpha = 1
        return true
      })

      // 飘字
      floatTexts.current = floatTexts.current.filter((ft) => {
        ft.life -= 0.03
        ft.y -= 0.7
        if (ft.life <= 0) return false
        ctx.globalAlpha = Math.max(0, ft.life)
        ctx.fillStyle = ft.color
        ctx.font = '700 15px "DM Sans", system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(ft.text, ft.x, ft.y)
        ctx.globalAlpha = 1
        return true
      })

      // 手部光标
      if (handX >= 0) {
        ctx.beginPath()
        ctx.arc(handX, handY, 22, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(244,63,94,0.22)'
        ctx.fill()
        ctx.beginPath()
        ctx.arc(handX, handY, 8, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(244,63,94,0.9)'
        ctx.fill()
      }

      uiAcc += 1
      if (uiAcc % 8 === 0) {
        setScore({ ...scoreRef.current })
      }

      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [open, frameRef])

  if (!open) return null

  const accuracy =
    score.perfect + score.good + score.miss === 0
      ? 100
      : Math.round(((score.perfect * 1 + score.good * 0.6) / (score.perfect + score.good + score.miss)) * 100)

  return (
    <div className="absolute inset-0 z-[45] flex flex-col bg-[#f4f4f5]/95 backdrop-blur-md animate-fade-in">
      <header className="relative z-10 flex items-start justify-between gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-neutral-400">Rhythm Strike</p>
          <h2 className="mt-0.5 max-w-[50vw] truncate text-sm font-semibold text-neutral-900">
            {songTitle}
          </h2>
          <p className="mt-1 text-[11px] text-neutral-500">{hint}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums text-neutral-900">{score.score}</p>
          <p className="text-[11px] text-neutral-500">
            combo {score.combo} · {accuracy}%
          </p>
          <p className="mt-0.5 text-[10px] text-neutral-400">
            P {score.perfect} · G {score.good} · M {score.miss}
          </p>
        </div>
      </header>

      <div ref={wrapRef} className="relative min-h-0 flex-1 touch-none">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        {/* 触摸兜底：点按轨道击打 */}
        <div className="absolute inset-x-0 bottom-[18%] z-10 grid h-24 grid-cols-4 px-7">
          {Array.from({ length: LANE_COUNT }, (_, lane) => (
            <button
              key={lane}
              type="button"
              aria-label={`击打第 ${lane + 1} 轨`}
              className="h-full"
              onPointerDown={(e) => {
                e.preventDefault()
                const t = timeRef.current
                const notes = notesRef.current
                let best: RhythmNote | null = null
                let bestAbs = Infinity
                for (const n of notes) {
                  if (n.status !== 'active' || n.lane !== lane) continue
                  const d = Math.abs(t - n.hitTime)
                  if (d > GOOD_WINDOW) continue
                  if (d < bestAbs) {
                    bestAbs = d
                    best = n
                  }
                }
                if (!best) return
                const judgement = judgeTiming(t - best.hitTime)
                if (!judgement || judgement === 'miss') return
                best.status = 'hit'
                best.judgement = judgement
                scoreRef.current = applyHit(scoreRef.current, judgement)
                setScore({ ...scoreRef.current })
                const wrap = wrapRef.current
                const w = wrap?.clientWidth ?? 300
                const h = wrap?.clientHeight ?? 500
                const pad = 28
                const usable = w - pad * 2
                const laneW = usable / LANE_COUNT
                const cx = pad + laneW * (lane + 0.5)
                const color = HIT_FLASH[judgement]
                hitFx.current.push({ lane, life: 1, color })
                floatTexts.current.push({
                  text: judgement === 'perfect' ? 'PERFECT' : 'GOOD',
                  x: cx,
                  y: h * 0.78 - 20,
                  life: 1,
                  color,
                })
                navigator.vibrate?.(10)
              }}
            />
          ))}
        </div>
      </div>

      <footer className="z-10 flex items-center justify-between gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-neutral-200 bg-white/90 px-4 py-2 text-xs font-medium text-neutral-600 shadow-sm"
        >
          退出游戏
        </button>
        <p className="flex-1 text-center text-[11px] text-neutral-400">
          {handReady ? '手势命中 · 也可点按底部轨道' : '未开摄像头时可点按轨道'}
        </p>
        <button
          type="button"
          onClick={onRequestPlay}
          className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-medium text-white shadow-sm"
        >
          {isPlaying ? '演奏中' : '开始音乐'}
        </button>
      </footer>
    </div>
  )
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}
