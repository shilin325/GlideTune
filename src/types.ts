/** 无元数据时的默认节拍（与节奏游戏一致） */
export const DEFAULT_BPM = 118

export interface Song {
  id: number
  title: string
  artist: string
  cover: string
  url: string
  /** 可选 BPM 提示；未提供时由播放时音频检测 */
  bpm?: number
  /** 本地上传原始文件；blob URL 失效时可重建 */
  localFile?: Blob
}

export type GestureAxis = 'x' | 'y' | null
