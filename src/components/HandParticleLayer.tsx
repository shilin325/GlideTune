import { useEffect, useRef } from 'react'
import { ParticleSystem } from '../hand/particleSystem'
import type { HandFrame, HandGesture } from '../hand/types'
import type { HandTrackingStatus } from '../hooks/useHandTracking'

const PLAY_GESTURE_LABEL: Record<HandGesture, string> = {
  none: '',
  open_palm: '张开手掌 · 播放/暂停',
  closed_fist: '握拳 · 暂停',
  pointing_up: '',
  thumb_up: '点赞 · 收藏',
  thumb_down: '踩 · 取消收藏',
  victory: '比耶 · 分享歌曲',
  iloveyou: '',
  swipe_left: '左滑 · 下一首',
  swipe_right: '右滑 · 上一首',
  swipe_up: '',
  swipe_down: '',
  pinch: '捏合 · 环绕/平铺切换',
}

const SHARE_GESTURE_LABEL: Record<HandGesture, string> = {
  none: '',
  open_palm: '',
  closed_fist: '',
  pointing_up: '',
  thumb_up: '点赞 · 保存图片',
  thumb_down: '点踩 · 取消分享',
  victory: '',
  iloveyou: '',
  swipe_left: '',
  swipe_right: '',
  swipe_up: '上滑 · 下一配色',
  swipe_down: '下滑 · 上一配色',
  pinch: '',
}

interface HandParticleLayerProps {
  videoRef: React.RefObject<HTMLVideoElement>
  frame: HandFrame | null
  frameRef: React.MutableRefObject<HandFrame | null>
  status: HandTrackingStatus
  error: string | null
  enabled: boolean
  lastGesture: HandGesture | null
  onToggle: () => void
  /** 分享卡打开时，提示切换为取消/保存 */
  shareMode?: boolean
  /** 手势刚触发时通知粒子爆发 */
  burstGesture: { gesture: HandGesture; at: number } | null
}

/**
 * 全屏粒子 / 骨架可视化层
 * - 隐藏 video 供 MediaPipe 推理
 * - Canvas 实时绘制关键点连线 + 粒子拖尾
 */
export function HandParticleLayer({
  videoRef,
  frame,
  frameRef,
  status,
  error,
  enabled,
  lastGesture,
  onToggle,
  shareMode = false,
  burstGesture,
}: HandParticleLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const systemRef = useRef(new ParticleSystem())
  const lastBurstAt = useRef(0)

  // 手势爆发粒子
  useEffect(() => {
    if (!burstGesture || burstGesture.at === lastBurstAt.current) return
    lastBurstAt.current = burstGesture.at
    const canvas = canvasRef.current
    const f = frameRef.current
    if (!canvas || !f) return
    systemRef.current.onGestureBurst(
      burstGesture.gesture,
      f.palm,
      canvas.width,
      canvas.height,
    )
  }, [burstGesture, frameRef])

  // 渲染循环
  useEffect(() => {
    if (!enabled) {
      systemRef.current.clear()
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx && canvasRef.current) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
      }
      return
    }

    let raf = 0
    let last = performance.now()

    const resize = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    window.addEventListener('resize', resize)

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) {
        const w = canvas.clientWidth
        const h = canvas.clientHeight
        const f = frameRef.current
        systemRef.current.update(f, w, h, dt)
        systemRef.current.draw(ctx, f, w, h)
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [enabled, frameRef])

  const labels = shareMode ? SHARE_GESTURE_LABEL : PLAY_GESTURE_LABEL
  const label = lastGesture ? labels[lastGesture] : ''

  return (
    <>
      {/* 供推理用的摄像头画面（镜像小窗预览） */}
      <video
        ref={videoRef}
        className={`pointer-events-none fixed bottom-4 right-4 z-30 h-24 w-32 rounded-xl border border-white/15 object-cover shadow-lg transition ${
          enabled && status === 'ready' ? 'opacity-70' : 'opacity-0'
        }`}
        style={{ transform: 'scaleX(-1)' }}
        playsInline
        muted
        autoPlay
      />

      <canvas
        ref={canvasRef}
        className={`pointer-events-none fixed inset-0 z-[15] transition-opacity duration-300 ${
          enabled ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* 控制条 */}
      <div className="fixed left-4 top-4 z-40 flex max-w-[min(92vw,320px)] flex-col gap-2">
        <button
          type="button"
          onClick={onToggle}
          className={`rounded-full border px-3.5 py-2 text-left text-xs font-medium backdrop-blur-md transition ${
            enabled
              ? 'border-neutral-800/20 bg-neutral-900 text-white'
              : 'border-neutral-300/80 bg-white/75 text-neutral-700 shadow-sm hover:bg-white'
          }`}
        >
          {enabled ? '关闭手势交互' : '开启手势交互'}
        </button>

        {enabled && (
          <div className="rounded-2xl border border-white/10 bg-black/55 px-3 py-2 text-[11px] leading-relaxed text-white/70 backdrop-blur-md">
            <div className="mb-1 flex items-center gap-2">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  status === 'ready'
                    ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                    : status === 'loading'
                      ? 'animate-pulse bg-amber-300'
                      : 'bg-rose-400'
                }`}
              />
              <span>
                {status === 'loading' && '加载 MediaPipe 模型…'}
                {status === 'ready' && (frame ? '追踪中 · 21 关键点' : '等待手部入镜')}
                {status === 'denied' && '摄像头未授权'}
                {status === 'error' && '初始化失败'}
              </span>
            </div>
            {error && <p className="text-rose-300/90">{error}</p>}
            {label && (
              <p className="mt-0.5 text-cyan-200/90 animate-fade-in">{label}</p>
            )}
            {!error && status === 'ready' && (
              <p className="mt-1 text-white/40">
                {shareMode
                  ? '分享中：上下滑换色 · 点赞保存 · 点踩取消'
                  : '左/右滑切歌 · 张开播放 · 握拳暂停 · 点赞收藏 · 比耶分享'}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  )
}
