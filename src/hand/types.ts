/** MediaPipe 归一化关键点 (0~1，原点左上) */
export interface Landmark {
  x: number
  y: number
  z: number
}

/** 识别出的高层手势（含滑动等动态手势） */
export type HandGesture =
  | 'none'
  | 'open_palm'
  | 'closed_fist'
  | 'pointing_up'
  | 'thumb_up'
  | 'thumb_down'
  | 'victory'
  | 'iloveyou'
  | 'swipe_left'
  | 'swipe_right'
  | 'swipe_up'
  | 'swipe_down'
  | 'pinch'

export interface HandFrame {
  landmarks: Landmark[]
  /** MediaPipe GestureRecognizer 原始分类 */
  rawGesture: string
  /** 综合判定后的手势 */
  gesture: HandGesture
  /** 手掌中心（归一化） */
  palm: Landmark
  /** 指尖关键点索引对应坐标 */
  fingertips: Landmark[]
  /** 捏合程度 0~1（拇指指尖与食指指尖距离反比） */
  pinchAmount: number
  timestamp: number
}

export interface HandGestureEvent {
  gesture: HandGesture
  frame: HandFrame
}

/** 指尖 landmark 索引：拇指、食指、中指、无名指、小指 */
export const FINGERTIP_INDICES = [4, 8, 12, 16, 20] as const

/** 手部骨架连线（MediaPipe Hands 拓扑） */
export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]
