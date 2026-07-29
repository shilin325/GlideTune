/** 归一化关键点（0~1，相对视频画面；x 已镜像以匹配自拍预览） */
export interface HandLandmark {
  x: number
  y: number
  z: number
}

export type HandGestureName =
  | 'None'
  | 'Closed_Fist'
  | 'Open_Palm'
  | 'Pointing_Up'
  | 'Thumb_Down'
  | 'Thumb_Up'
  | 'Victory'
  | 'ILoveYou'
  | 'Swipe_Left'
  | 'Swipe_Right'
  | 'Swipe_Up'
  | 'Swipe_Down'
  | 'Pinch'

export interface RecognizedGesture {
  name: HandGestureName
  score: number
}

export interface HandFrame {
  landmarks: HandLandmark[]
  /** MediaPipe 内置手势（若有） */
  nativeGesture: RecognizedGesture | null
  /** 综合判定后的控制手势（含滑动/捏合） */
  controlGesture: HandGestureName
  /** 掌心位置（归一化） */
  palm: HandLandmark
  /** 捏合开合度 0~1，1 为完全张开 */
  pinchOpenness: number
  timestamp: number
}

export type HandControlAction =
  | { type: 'play_pause' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'volume'; delta: number }
  | { type: 'like' }
  | { type: 'menu' }

/** MediaPipe Hands 21 点连接边（用于骨架绘制） */
export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]

/** 指尖索引：拇指、食指、中指、无名指、小指 */
export const FINGERTIP_INDICES = [4, 8, 12, 16, 20] as const
