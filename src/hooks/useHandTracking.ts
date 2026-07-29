import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FilesetResolver,
  GestureRecognizer,
  type GestureRecognizerResult,
} from '@mediapipe/tasks-vision'
import {
  buildHandFrame,
  resolveGesture,
  SwipeTracker,
} from '../hand/recognizeGesture'
import type { HandFrame, HandGesture, Landmark } from '../hand/types'

/** 转成绝对 URL，避免 MediaPipe Worker 相对路径解析失败 */
function assetUrl(path: string) {
  const base = import.meta.env.BASE_URL || '/'
  const joined = `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\//, '')}`
  return new URL(joined, window.location.origin).href
}

export type HandTrackingStatus = 'idle' | 'loading' | 'ready' | 'error' | 'denied'

/** 静态手势连续稳定帧数（灵敏度恢复，约 5 帧） */
const STATIC_HOLD_FRAMES = 5

interface UseHandTrackingOptions {
  enabled: boolean
  /** 识别到有效手势时回调（内部带冷却，避免连发） */
  onGesture?: (gesture: HandGesture, frame: HandFrame) => void
}

type InitState =
  | { status: 'idle' }
  | { status: 'pending'; promise: Promise<GestureRecognizer> }
  | { status: 'ready'; recognizer: GestureRecognizer }

let initState: InitState = { status: 'idle' }

function errorMessage(e: unknown): string {
  if (!e) return '手势识别初始化失败'
  if (typeof e === 'string') return e
  if (e instanceof Error && e.message) return e.message
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const msg = (e as { message?: unknown }).message
    if (typeof msg === 'string' && msg) return msg
  }
  try {
    return String(e)
  } catch {
    return '手势识别初始化失败'
  }
}

async function createRecognizer(): Promise<GestureRecognizer> {
  const vision = await FilesetResolver.forVisionTasks(assetUrl('mediapipe/wasm'))
  const modelAssetPath = assetUrl('mediapipe/models/gesture_recognizer.task')

  // 先 CPU：兼容性更好；GPU 在部分环境会因 WebGL context 创建失败
  try {
    return await GestureRecognizer.createFromOptions(vision, {
      baseOptions: { modelAssetPath, delegate: 'CPU' },
      runningMode: 'VIDEO',
      numHands: 1,
    })
  } catch (cpuErr) {
    try {
      return await GestureRecognizer.createFromOptions(vision, {
        baseOptions: { modelAssetPath, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 1,
      })
    } catch {
      throw cpuErr
    }
  }
}

function getOrCreateRecognizer(): Promise<GestureRecognizer> {
  if (initState.status === 'ready') {
    return Promise.resolve(initState.recognizer)
  }
  if (initState.status === 'pending') {
    return initState.promise
  }

  const promise = createRecognizer()
    .then((recognizer) => {
      initState = { status: 'ready', recognizer }
      return recognizer
    })
    .catch((err) => {
      initState = { status: 'idle' }
      throw err
    })

  initState = { status: 'pending', promise }
  return promise
}

function disposeRecognizer() {
  if (initState.status === 'ready') {
    try {
      initState.recognizer.close()
    } catch {
      /* ignore */
    }
    initState = { status: 'idle' }
    return
  }
  if (initState.status === 'pending') {
    const pending = initState.promise
    initState = { status: 'idle' }
    // 初始化完成后立刻关掉，避免泄漏 / 与下次 init 冲突
    void pending
      .then((r) => {
        try {
          r.close()
        } catch {
          /* ignore */
        }
      })
      .catch(() => {})
  }
}

async function waitForVideo(
  getVideo: () => HTMLVideoElement | null,
  isCancelled: () => boolean,
  timeoutMs = 5000,
): Promise<HTMLVideoElement> {
  const startAt = performance.now()
  while (performance.now() - startAt < timeoutMs) {
    if (isCancelled()) throw new DOMException('The operation was aborted.', 'AbortError')
    const video = getVideo()
    if (video) return video
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
  }
  throw new Error('找不到摄像头 video 元素，请刷新页面重试')
}

/**
 * 摄像头 + MediaPipe GestureRecognizer：
 * - 实时 21 点手部关键点
 * - 静态手势分类（握拳 / 张开 / 点赞等）
 * - 叠加滑动 / 捏合动态识别
 */
export function useHandTracking({ enabled, onGesture }: UseHandTrackingOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const recognizerRef = useRef<GestureRecognizer | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef(0)
  const swipeRef = useRef(new SwipeTracker())
  const onGestureRef = useRef(onGesture)
  const lastStaticRef = useRef<HandGesture>('none')
  const lastEmitAtRef = useRef(0)
  /** 静态手势连续稳定帧计数，降低误触 */
  const staticHoldRef = useRef<{ gesture: HandGesture; frames: number }>({
    gesture: 'none',
    frames: 0,
  })
  const runIdRef = useRef(0)

  const [status, setStatus] = useState<HandTrackingStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [frame, setFrame] = useState<HandFrame | null>(null)
  const frameRef = useRef<HandFrame | null>(null)
  const lastUiPushRef = useRef(0)
  const hadHandRef = useRef(false)

  useEffect(() => {
    onGestureRef.current = onGesture
  }, [onGesture])

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    swipeRef.current.reset()
    frameRef.current = null
    lastStaticRef.current = 'none'
    staticHoldRef.current = { gesture: 'none', frames: 0 }
    hadHandRef.current = false
    setFrame(null)
  }, [])

  const tryEmit = useCallback((gesture: HandGesture, next: HandFrame) => {
    if (gesture === 'none') return
    const now = next.timestamp
    const isSwipe = gesture.startsWith('swipe_')
    // 捏合用于布局切换，冷却略长，避免连触发
    const gap = gesture === 'pinch' ? 1200 : isSwipe ? 650 : 850
    if (now - lastEmitAtRef.current < gap) return
    if (!isSwipe && lastStaticRef.current === gesture && now - lastEmitAtRef.current < 1100) {
      return
    }
    lastEmitAtRef.current = now
    if (!isSwipe) lastStaticRef.current = gesture
    onGestureRef.current?.(gesture, next)
  }, [])

  useEffect(() => {
    if (!enabled) {
      runIdRef.current += 1
      stopCamera()
      recognizerRef.current = null
      disposeRecognizer()
      setStatus('idle')
      setError(null)
      return
    }

    const runId = ++runIdRef.current
    const isCancelled = () => runId !== runIdRef.current

    const loop = () => {
      if (isCancelled()) return
      const video = videoRef.current
      const recognizer = recognizerRef.current

      if (video && recognizer && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const now = performance.now()
        let result: GestureRecognizerResult | undefined
        try {
          result = recognizer.recognizeForVideo(video, now)
        } catch {
          result = undefined
        }

        if (result?.landmarks?.[0]?.length) {
          const landmarks = result.landmarks[0] as Landmark[]
          const category = result.gestures?.[0]?.[0]
          const rawLabel = category?.categoryName
          const score = typeof category?.score === 'number' ? category.score : 0
          const palm = {
            x: (landmarks[0].x + landmarks[9].x) / 2,
            y: (landmarks[0].y + landmarks[9].y) / 2,
            z: (landmarks[0].z + landmarks[9].z) / 2,
          }
          const swipe = swipeRef.current.update(palm, now)
          const { gesture, pinchAmount } = resolveGesture({
            rawLabel,
            landmarks,
            swipe,
            score,
          })
          const next = buildHandFrame(landmarks, rawLabel, gesture, pinchAmount, now)
          const prevGesture = frameRef.current?.gesture ?? 'none'
          frameRef.current = next

          const shouldPushUi =
            !hadHandRef.current ||
            gesture !== prevGesture ||
            (gesture === 'pinch' && now - lastUiPushRef.current > 100)
          if (shouldPushUi) {
            lastUiPushRef.current = now
            setFrame(next)
          }
          hadHandRef.current = true

          if (swipe) {
            staticHoldRef.current = { gesture: 'none', frames: 0 }
            tryEmit(swipe, next)
          } else if (gesture === 'none') {
            staticHoldRef.current = { gesture: 'none', frames: 0 }
            lastStaticRef.current = 'none'
          } else if (staticHoldRef.current.gesture === gesture) {
            staticHoldRef.current.frames += 1
            // 捏合稍快触发（约 3 帧），其它静态手势保持原阈值
            const need = gesture === 'pinch' ? 3 : STATIC_HOLD_FRAMES
            if (staticHoldRef.current.frames === need) {
              tryEmit(gesture, next)
            }
          } else {
            staticHoldRef.current = { gesture, frames: 1 }
          }
        } else {
          swipeRef.current.reset()
          frameRef.current = null
          lastStaticRef.current = 'none'
          staticHoldRef.current = { gesture: 'none', frames: 0 }
          if (hadHandRef.current) {
            hadHandRef.current = false
            setFrame(null)
          }
        }
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    const start = async () => {
      setStatus('loading')
      setError(null)
      try {
        const recognizer = await getOrCreateRecognizer()
        if (isCancelled()) return
        recognizerRef.current = recognizer

        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('当前环境不支持摄像头（需要 HTTPS 或 localhost）')
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        })
        if (isCancelled()) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream

        const video = await waitForVideo(() => videoRef.current, isCancelled)
        video.srcObject = stream
        video.muted = true
        try {
          await video.play()
        } catch (playErr) {
          const name = (playErr as DOMException)?.name
          // 被清理中断时忽略；其它播放错误仍提示
          if (isCancelled() || name === 'AbortError') return
          throw playErr
        }
        if (isCancelled()) return

        setStatus('ready')
        rafRef.current = requestAnimationFrame(loop)
      } catch (e) {
        if (isCancelled()) return
        const err = e as DOMException
        if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
          setStatus('denied')
          setError('摄像头权限被拒绝，请在浏览器中允许摄像头')
        } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
          setStatus('error')
          setError('未检测到摄像头设备')
        } else if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError') {
          setStatus('error')
          setError('摄像头被其它应用占用，请关闭后重试')
        } else {
          setStatus('error')
          setError(errorMessage(e))
          recognizerRef.current = null
          disposeRecognizer()
        }
      }
    }

    void start()

    return () => {
      // 使进行中的 start/loop 失效；保留已创建的 Recognizer 供 Strict Mode 二次挂载复用
      runIdRef.current += 1
      stopCamera()
    }
  }, [enabled, stopCamera, tryEmit])

  useEffect(() => {
    return () => {
      runIdRef.current += 1
      stopCamera()
      recognizerRef.current = null
      disposeRecognizer()
    }
  }, [stopCamera])

  return {
    videoRef,
    status,
    error,
    frame,
    frameRef,
  }
}
