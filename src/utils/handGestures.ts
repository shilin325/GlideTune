import type { HandGestureName, HandLandmark, RecognizedGesture } from '../types/hand'

const SWIPE_DIST = 0.12
const SWIPE_COOLDOWN_MS = 700
const PINCH_THRESHOLD = 0.055

function dist(a: HandLandmark, b: HandLandmark) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.hypot(dx, dy)
}

export function palmCenter(landmarks: HandLandmark[]): HandLandmark {
  // 腕 + 中指根 近似掌心
  const wrist = landmarks[0]
  const middle = landmarks[9]
  return {
    x: (wrist.x + middle.x) / 2,
    y: (wrist.y + middle.y) / 2,
    z: (wrist.z + middle.z) / 2,
  }
}

/** 拇指尖与食指尖距离 → 捏合开合度 */
export function pinchOpenness(landmarks: HandLandmark[]): number {
  const d = dist(landmarks[4], landmarks[8])
  // 约 0.02 紧捏，0.15+ 张开
  return Math.max(0, Math.min(1, (d - 0.02) / 0.13))
}

export function isPinching(landmarks: HandLandmark[]): boolean {
  return dist(landmarks[4], landmarks[8]) < PINCH_THRESHOLD
}

/**
 * 基于掌心轨迹识别滑动，并与 MediaPipe 原生手势合并。
 * 使用短时历史缓冲，避免抖动误触。
 */
export class GestureController {
  private history: { x: number; y: number; t: number }[] = []
  private lastFireAt = 0
  private lastStatic: HandGestureName = 'None'
  private staticHoldFrames = 0

  reset() {
    this.history = []
    this.lastFireAt = 0
    this.lastStatic = 'None'
    this.staticHoldFrames = 0
  }

  /**
   * @returns 本帧应触发的控制手势（多数帧为 None）
   */
  update(
    landmarks: HandLandmark[],
    native: RecognizedGesture | null,
    now: number,
  ): HandGestureName {
    const palm = palmCenter(landmarks)
    this.history.push({ x: palm.x, y: palm.y, t: now })
    // 保留约 350ms 轨迹
    while (this.history.length > 1 && now - this.history[0].t > 350) {
      this.history.shift()
    }

    // 捏合优先用于连续音量，不走冷却的「一次性」触发
    if (isPinching(landmarks)) {
      return 'Pinch'
    }

    // 滑动检测
    if (this.history.length >= 3 && now - this.lastFireAt > SWIPE_COOLDOWN_MS) {
      const first = this.history[0]
      const last = this.history[this.history.length - 1]
      const dx = last.x - first.x
      const dy = last.y - first.y
      const adx = Math.abs(dx)
      const ady = Math.abs(dy)

      if (adx > SWIPE_DIST && adx > ady * 1.2) {
        this.lastFireAt = now
        this.history = []
        return dx > 0 ? 'Swipe_Right' : 'Swipe_Left'
      }
      if (ady > SWIPE_DIST && ady > adx * 1.2) {
        this.lastFireAt = now
        this.history = []
        return dy > 0 ? 'Swipe_Down' : 'Swipe_Up'
      }
    }

    // 静态手势需连续稳定若干帧再触发（防抖）
    const name = (native?.name as HandGestureName) || 'None'
    if (name === this.lastStatic && name !== 'None') {
      this.staticHoldFrames += 1
    } else {
      this.lastStatic = name
      this.staticHoldFrames = 1
    }

    if (
      this.staticHoldFrames >= 8 &&
      now - this.lastFireAt > SWIPE_COOLDOWN_MS &&
      (name === 'Closed_Fist' ||
        name === 'Open_Palm' ||
        name === 'Thumb_Up' ||
        name === 'Victory' ||
        name === 'ILoveYou')
    ) {
      this.lastFireAt = now
      this.staticHoldFrames = 0
      return name
    }

    return 'None'
  }
}

/** 手势 → 播放器控制语义说明（UI 展示用） */
export const GESTURE_HINTS: Record<string, string> = {
  Open_Palm: '张开手掌 · 播放/暂停',
  Closed_Fist: '握拳 · 暂停',
  Swipe_Left: '左滑 · 下一首',
  Swipe_Right: '右滑 · 上一首',
  Thumb_Up: '点赞 · 收藏',
  Victory: '比耶 · 分享歌曲',
  ILoveYou: '爱心手势',
  Pointing_Up: '指向上',
  None: '将手放入画面中央',
}
