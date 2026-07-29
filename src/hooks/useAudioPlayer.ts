import { useCallback, useEffect, useRef, useState } from 'react'
import type { Song } from '../types'
import { toAudioBlob } from '../utils/audioFile'

interface UseAudioPlayerOptions {
  songs: Song[]
  initialIndex?: number
}

/**
 * 基于原生 <audio> 的播放器核心：
 * - 播放 / 暂停 / 上一首 / 下一首
 * - 进度与音量控制
 * - 切歌时重置进度
 * - 支持动态播放列表与本地 blob 音频
 */
export function useAudioPlayer({ songs, initialIndex = 0 }: UseAudioPlayerOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const songsRef = useRef(songs)
  const currentIndexRef = useRef(initialIndex)
  const loadedSongIdRef = useRef<number | null>(null)
  const loadedUrlRef = useRef<string | null>(null)
  const isPlayingRef = useRef(false)
  /** 用户主动 play 进行中，避免 effect 再次 load() 打断 */
  const userPlayLockRef = useRef(false)

  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(0.7)
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set())
  const [coverKey, setCoverKey] = useState(0)

  // 渲染期同步，避免 goTo / play 读到旧列表
  songsRef.current = songs
  currentIndexRef.current = currentIndex
  isPlayingRef.current = isPlaying

  useEffect(() => {
    if (songs.length === 0) return
    if (currentIndex > songs.length - 1) {
      setCurrentIndex(songs.length - 1)
    }
  }, [songs, currentIndex])

  const currentSong = songs[currentIndex]

  /** 确保本地曲有可用 blob URL（失效时用 localFile 重建） */
  const resolveSongUrl = useCallback((song: Song): string => {
    if (!song.localFile) return song.url
    // 已有 url 时先沿用；仅在明确需要重建时由调用方传入 forceRecreate
    return song.url
  }, [])

  const recreateLocalUrl = useCallback((song: Song): string => {
    if (!song.localFile) return song.url
    if (song.url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(song.url)
      } catch {
        /* ignore */
      }
    }
    const blob = toAudioBlob(song.localFile)
    const url = URL.createObjectURL(blob)
    song.url = url
    return url
  }, [])

  /**
   * 同步换源。用 loadedUrlRef 判断，避免依赖 audio.src 在部分浏览器上的空值/规范化问题。
   * 同一首歌同一 URL 不重复 load，防止打断 play()。
   */
  const loadSong = useCallback(
    (song: Song, options?: { force?: boolean; recreate?: boolean }) => {
      const audio = audioRef.current
      if (!audio) return

      let url = resolveSongUrl(song)
      if (options?.recreate && song.localFile) {
        url = recreateLocalUrl(song)
      }

      if (
        !options?.force &&
        !options?.recreate &&
        loadedSongIdRef.current === song.id &&
        loadedUrlRef.current === url
      ) {
        return
      }

      loadedSongIdRef.current = song.id
      loadedUrlRef.current = url
      audio.src = url
      audio.load()
      setCurrentTime(0)
      setDuration(0)
      setCoverKey((k) => k + 1)
    },
    [recreateLocalUrl, resolveSongUrl],
  )

  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
    audio.volume = volume
    audioRef.current = audio

    const onTimeUpdate = () => setCurrentTime(audio.currentTime)
    const onLoaded = () => setDuration(audio.duration || 0)
    const onEnded = () => {
      setCurrentIndex((idx) => {
        const list = songsRef.current
        if (idx >= list.length - 1) {
          setIsPlaying(false)
          return idx
        }
        return idx + 1
      })
    }
    const onPlay = () => setIsPlaying(true)
    const onPause = () => {
      if (!userPlayLockRef.current) setIsPlaying(false)
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)

    return () => {
      audio.pause()
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audioRef.current = null
      loadedSongIdRef.current = null
      loadedUrlRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 切歌换源；播放中则继续（上一首/下一首/播完）
  useEffect(() => {
    if (!currentSong) return
    // 用户正在点播放时不要再 load，否则会 AbortError
    if (userPlayLockRef.current) return

    loadSong(currentSong)
    if (isPlayingRef.current) {
      const audio = audioRef.current
      if (!audio) return
      void audio.play().catch((err) => {
        console.error('autoplay/continue failed', err, audio.error)
        setIsPlaying(false)
      })
    }
  }, [currentIndex, currentSong?.id, loadSong])

  const play = useCallback(async () => {
    const audio = audioRef.current
    const song = songsRef.current[currentIndexRef.current]
    if (!audio || !song) return false

    userPlayLockRef.current = true

    /**
     * 重要：必须在用户点击的同步调用栈里立刻调用 audio.play()。
     * 若先 await canplay，会丢失用户手势，被浏览器以 NotAllowedError 拦截。
     */
    const attempt = async (opts?: { force?: boolean; recreate?: boolean }) => {
      loadSong(song, opts)

      if (!audio.paused && !audio.error && loadedSongIdRef.current === song.id) {
        setIsPlaying(true)
        return
      }

      // 同步发起 play（不要在此前 await）
      const playPromise = audio.play()
      await playPromise
      setIsPlaying(true)
    }

    try {
      await attempt()
      return true
    } catch (err) {
      console.warn('audio.play first attempt failed', err, audio.error)
      const name = err instanceof DOMException ? err.name : ''

      // AbortError：被并发 load 打断；NotSupported：MIME/blob 问题 → 重建后同步再 play 一次
      try {
        loadSong(song, {
          force: true,
          recreate: Boolean(song.localFile) && (name === 'NotSupportedError' || Boolean(audio.error)),
        })
        await audio.play()
        setIsPlaying(true)
        return true
      } catch (err2) {
        console.error('audio.play retry failed', err2, audio.error)
      }

      setIsPlaying(false)
      return false
    } finally {
      userPlayLockRef.current = false
    }
  }, [loadSong])

  const pause = useCallback(() => {
    userPlayLockRef.current = false
    audioRef.current?.pause()
    setIsPlaying(false)
  }, [])

  const togglePlay = useCallback(async () => {
    if (isPlaying) {
      pause()
      return true
    }
    return play()
  }, [isPlaying, pause, play])

  const seek = useCallback((time: number) => {
    const audio = audioRef.current
    if (!audio || !Number.isFinite(time)) return
    audio.currentTime = Math.max(0, Math.min(time, audio.duration || time))
    setCurrentTime(audio.currentTime)
  }, [])

  const setVolume = useCallback((v: number) => {
    const next = Math.max(0, Math.min(1, v))
    setVolumeState(next)
    if (audioRef.current) audioRef.current.volume = next
  }, [])

  const changeVolumeBy = useCallback((delta: number) => {
    setVolumeState((v) => {
      const next = Math.max(0, Math.min(1, v + delta))
      if (audioRef.current) audioRef.current.volume = next
      return next
    })
  }, [])

  const goTo = useCallback(
    (index: number, autoPlay = true, listOverride?: Song[]) => {
      if (listOverride) songsRef.current = listOverride
      const list = songsRef.current
      if (index < 0 || index >= list.length) return false

      const song = list[index]
      userPlayLockRef.current = false
      loadSong(song)
      setCurrentIndex(index)
      setIsPlaying(autoPlay)

      const audio = audioRef.current
      if (!audio) return true

      if (!autoPlay) {
        audio.pause()
      } else {
        // 同步 play，保留点击进度点等用户手势
        void audio.play().catch((err) => {
          console.error('goTo autoplay failed', err, audio.error)
          setIsPlaying(false)
        })
      }
      return true
    },
    [loadSong],
  )

  const next = useCallback(() => goTo(currentIndex + 1), [currentIndex, goTo])
  const prev = useCallback(() => goTo(currentIndex - 1), [currentIndex, goTo])

  const toggleLike = useCallback((songId: number) => {
    setLikedIds((prev) => {
      const next = new Set(prev)
      if (next.has(songId)) next.delete(songId)
      else next.add(songId)
      return next
    })
  }, [])

  return {
    currentSong,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    volume,
    likedIds,
    coverKey,
    play,
    pause,
    togglePlay,
    seek,
    setVolume,
    changeVolumeBy,
    next,
    prev,
    goTo,
    toggleLike,
  }
}
