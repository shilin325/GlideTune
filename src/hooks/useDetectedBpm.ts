import { useEffect, useState } from 'react'
import { DEFAULT_BPM } from '../types'
import {
  detectBpmForSource,
  fallbackBpm,
  getCachedBpm,
} from '../utils/detectBpm'

/**
 * 根据当前曲目音频检测 BPM，供封面节拍动效 / 节奏游戏使用。
 * 检测中先用 hint（若有）或 DEFAULT_BPM，完成后切换为实测值。
 */
export function useDetectedBpm(
  song:
    | {
        id: number
        url: string
        bpm?: number
        localFile?: Blob
      }
    | null
    | undefined,
) {
  const cacheKey = song ? `song-${song.id}:${song.url}` : ''
  const initial =
    (song && getCachedBpm(cacheKey)) ?? fallbackBpm(song?.bpm) ?? DEFAULT_BPM

  const [bpm, setBpm] = useState(initial)
  const [ready, setReady] = useState(() => Boolean(song && getCachedBpm(cacheKey)))

  useEffect(() => {
    if (!song) return

    const key = `song-${song.id}:${song.url}`
    const cached = getCachedBpm(key)
    if (cached != null) {
      setBpm(cached)
      setReady(true)
      return
    }

    setBpm(fallbackBpm(song.bpm))
    setReady(false)

    const ac = new AbortController()
    void detectBpmForSource(
      key,
      { url: song.url, localFile: song.localFile },
      ac.signal,
    )
      .then((detected) => {
        if (ac.signal.aborted) return
        setBpm(detected)
        setReady(true)
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        console.warn('BPM 检测失败，使用默认值', err)
        setBpm(fallbackBpm(song.bpm))
        setReady(false)
      })

    return () => ac.abort()
  }, [song?.id, song?.url, song?.bpm, song?.localFile])

  return { bpm, ready }
}
