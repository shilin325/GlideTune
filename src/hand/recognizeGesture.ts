import type { HandFrame, HandGesture, Landmark } from './types'
import { FINGERTIP_INDICES } from './types'

/** 水平滑动位移阈值（归一化坐标，约画面宽度比例） */
const SWIPE_DISTANCE_X = 0.2
/** 垂直滑动位移阈值（分享换色等） */
const SWIPE_DISTANCE_Y = 0.12
/** 滑动最小速度（归一化单位 / 秒） */
const SWIPE_MIN_SPEED = 0.32
/** 主轴优势：主导轴位移需明显大于另一轴 */
const SWIPE_AXIS_RATIO = 1.2
/** 滑动冷却 */
const SWIPE_COOLDOWN_MS = 650
/** 轨迹窗口 */
const HISTORY_MS = 320
const PINCH_THRESHOLD = 0.055
/** MediaPipe 静态手势最低置信度 */
export const STATIC_SCORE_MIN = 0.55

/** MediaPipe GestureRecognizer 标签 → 内部枚举 */
const RAW_MAP: Record<string, HandGesture> = {
  None: 'none',
  Closed_Fist: 'closed_fist',
  Open_Palm: 'open_palm',
  Pointing_Up: 'pointing_up',
  Thumb_Up: 'thumb_up',
  Thumb_Down: 'thumb_down',
  Victory: 'victory',
  ILoveYou: 'iloveyou',
}

export function mapRawGesture(label: string | undefined): HandGesture {
  if (!label) return 'none'
  return RAW_MAP[label] ?? 'none'
}

export function palmCenter(landmarks: Landmark[]): Landmark {
  const wrist = landmarks[0]
  const middleMcp = landmarks[9]
  return {
    x: (wrist.x + middleMcp.x) / 2,
    y: (wrist.y + middleMcp.y) / 2,
    z: (wrist.z + middleMcp.z) / 2,
  }
}

export function fingertipPoints(landmarks: Landmark[]): Landmark[] {
  return FINGERTIP_INDICES.map((i) => landmarks[i])
}

/** 拇指尖(4) 与 食指尖(8) 的归一化距离 */
export function pinchDistance(landmarks: Landmark[]): number {
  const a = landmarks[4]
  const b = landmarks[8]
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.hypot(dx, dy)
}

/**
 * 滑动检测：跟踪掌心短时轨迹，超过阈值触发一次。
 */
export class SwipeTracker {
  private history: { x: number; y: number; t: number }[] = []
  private lastFire = 0

  reset() {
    this.history = []
    this.lastFire = 0
  }

  update(palm: Landmark, now: number): HandGesture | null {
    this.history.push({ x: palm.x, y: palm.y, t: now })
    while (this.history.length > 1 && now - this.history[0].t > HISTORY_MS) {
      this.history.shift()
    }

    if (this.history.length < 3) return null
    if (now - this.lastFire < SWIPE_COOLDOWN_MS) return null

    const first = this.history[0]
    const last = this.history[this.history.length - 1]
    const dt = Math.max(16, last.t - first.t) / 1000
    const dx = last.x - first.x
    const dy = last.y - first.y
    const adx = Math.abs(dx)
    const ady = Math.abs(dy)
    const speedX = adx / dt
    const speedY = ady / dt

    // 水平滑动
    if (adx >= SWIPE_DISTANCE_X && adx > ady * SWIPE_AXIS_RATIO && speedX >= SWIPE_MIN_SPEED) {
      this.lastFire = now
      this.history = []
      // 镜像画面：手向屏幕右侧移动 → swipe_right
      return dx > 0 ? 'swipe_right' : 'swipe_left'
    }

    // 垂直滑动（y 向下增大）
    if (ady >= SWIPE_DISTANCE_Y && ady > adx * SWIPE_AXIS_RATIO && speedY >= SWIPE_MIN_SPEED) {
      this.lastFire = now
      this.history = []
      return dy > 0 ? 'swipe_down' : 'swipe_up'
    }

    return null
  }
}

/**
 * 综合静态分类 + 捏合 + 滑动
 */
export function resolveGesture(opts: {
  rawLabel: string | undefined
  landmarks: Landmark[]
  swipe: HandGesture | null
  score?: number
}): { gesture: HandGesture; pinchAmount: number } {
  const dist = pinchDistance(opts.landmarks)
  const pinchAmount = Math.max(0, Math.min(1, 1 - dist / 0.18))

  if (opts.swipe) {
    return { gesture: opts.swipe, pinchAmount }
  }

  if (dist < PINCH_THRESHOLD) {
    return { gesture: 'pinch', pinchAmount }
  }

  const score = opts.score ?? 1
  if (score < STATIC_SCORE_MIN) {
    return { gesture: 'none', pinchAmount }
  }

  return { gesture: mapRawGesture(opts.rawLabel), pinchAmount }
}

export function buildHandFrame(
  landmarks: Landmark[],
  rawLabel: string | undefined,
  gesture: HandGesture,
  pinchAmount: number,
  timestamp: number,
): HandFrame {
  return {
    landmarks,
    rawGesture: rawLabel ?? 'None',
    gesture,
    palm: palmCenter(landmarks),
    fingertips: fingertipPoints(landmarks),
    pinchAmount,
    timestamp,
  }
}
