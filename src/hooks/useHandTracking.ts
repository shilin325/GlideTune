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

type ProgressCb = (progress: number, label: string) => void

type InitState =
  | { status: 'idle' }
  | { status: 'pending'; promise: Promise<GestureRecognizer> }
  | { status: 'ready'; recognizer: GestureRecognizer }

let initState: InitState = { status: 'idle' }
/** 当前初始化进度监听（多处同时开启时共享） */
let progressListeners = new Set<ProgressCb>()

function emitProgress(progress: number, label: string) {
  const p = Math.max(0, Math.min(1, progress))
  progressListeners.forEach((cb) => cb(p, label))
}

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

/** 带进度的资源预取，便于浏览器缓存后再交给 MediaPipe */
async function fetchWithProgress(
  url: string,
  onChunk: (loaded: number, total: number) => void,
): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`资源加载失败 (${res.status})`)

  const total = Number(res.headers.get('content-length')) || 0
  const reader = res.body?.getReader()
  if (!reader) {
    await res.arrayBuffer()
    onChunk(1, 1)
    return
  }

  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    loaded += value.byteLength
    onChunk(loaded, total > 0 ? total : loaded)
  }
  if (total > 0) onChunk(total, total)
}

async function prefetchHandAssets() {
  const wasmBase = assetUrl('mediapipe/wasm')
  const modelUrl = assetUrl('mediapipe/models/gesture_recognizer.task')

  // wasm ~55%，模型 ~30%，剩余留给 init / 摄像头
  const assets: { url: string; weight: number; label: string }[] = [
    {
      url: `${wasmBase}/vision_wasm_internal.wasm`,
      weight: 0.5,
      label: '下载推理引擎…',
    },
    {
      url: `${wasmBase}/vision_wasm_internal.js`,
      weight: 0.05,
      label: '下载推理脚本…',
    },
    {
      url: modelUrl,
      weight: 0.3,
      label: '下载手势模型…',
    },
  ]

  let base = 0.02
  emitProgress(base, '准备加载手势资源…')

  for (const asset of assets) {
    try {
      await fetchWithProgress(asset.url, (loaded, total) => {
        const ratio = total > 0 ? Math.min(1, loaded / total) : 0.5
        emitProgress(base + ratio * asset.weight, asset.label)
      })
    } catch {
      // 预取失败不阻断：MediaPipe 仍会自行请求（可能无精细进度）
      emitProgress(base + asset.weight * 0.5, `${asset.label}（改用内置加载）`)
    }
    base += asset.weight
  }

  emitProgress(0.88, '初始化识别引擎…')
}

async function createRecognizer(): Promise<GestureRecognizer> {
  await prefetchHandAssets()

  const vision = await FilesetResolver.forVisionTasks(assetUrl('mediapipe/wasm'))
  emitProgress(0.92, '加载手势模型…')
  const modelAssetPath = assetUrl('mediapipe/models/gesture_recognizer.task')

  // 先 CPU：兼容性更好；GPU 在部分环境会因 WebGL context 创建失败
  try {
    const recognizer = await GestureRecognizer.createFromOptions(vision, {
      baseOptions: { modelAssetPath, delegate: 'CPU' },
      runningMode: 'VIDEO',
      numHands: 1,
    })
    emitProgress(0.96, '模型就绪')
    return recognizer
  } catch (cpuErr) {
    emitProgress(0.93, '尝试 GPU 加速…')
    try {
      const recognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: { modelAssetPath, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 1,
      })
      emitProgress(0.96, '模型就绪')
      return recognizer
    } catch {
      throw cpuErr
    }
  }
}

function getOrCreateRecognizer(): Promise<GestureRecognizer> {
  if (initState.status === 'ready') {
    emitProgress(0.97, '使用已缓存模型…')
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
  const staticHoldRef = useRef<{ gesture: HandGesture; frames: number }>({
    gesture: 'none',
    frames: 0,
  })
  const runIdRef = useRef(0)

  const [status, setStatus] = useState<HandTrackingStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [frame, setFrame] = useState<HandFrame | null>(null)
  const [loadProgress, setLoadProgress] = useState(0)
  const [loadLabel, setLoadLabel] = useState('')
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
      setLoadProgress(0)
      setLoadLabel('')
      return
    }

    const runId = ++runIdRef.current
    const isCancelled = () => runId !== runIdRef.current

    const onProgress: ProgressCb = (progress, label) => {
      if (isCancelled()) return
      setLoadProgress(progress)
      setLoadLabel(label)
    }
    progressListeners.add(onProgress)

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
      setLoadProgress(0.01)
      setLoadLabel('准备加载手势资源…')
      try {
        const recognizer = await getOrCreateRecognizer()
        if (isCancelled()) return
        recognizerRef.current = recognizer

        emitProgress(0.97, '请求摄像头权限…')
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

        emitProgress(0.99, '启动摄像头…')
        const video = await waitForVideo(() => videoRef.current, isCancelled)
        video.srcObject = stream
        video.muted = true
        try {
          await video.play()
        } catch (playErr) {
          const name = (playErr as DOMException)?.name
          if (isCancelled() || name === 'AbortError') return
          throw playErr
        }
        if (isCancelled()) return

        setLoadProgress(1)
        setLoadLabel('完成')
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
      } finally {
        progressListeners.delete(onProgress)
      }
    }

    void start()

    return () => {
      runIdRef.current += 1
      progressListeners.delete(onProgress)
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
    /** 0~1，首次加载模型/资源进度 */
    loadProgress,
    loadLabel,
  }
}
