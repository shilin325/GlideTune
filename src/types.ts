export interface Song {
  id: number
  title: string
  artist: string
  cover: string
  url: string
  /** 本地上传原始文件；blob URL 失效时可重建 */
  localFile?: Blob
}

export type GestureAxis = 'x' | 'y' | null
