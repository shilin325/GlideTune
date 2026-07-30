import { useCallback, useEffect, useRef, useState } from 'react'
import type { Song } from '../types'
import { toAudioBlob } from '../utils/audioFile'

interface UseAudioPlayerOptions {
  songs: Song[]
  initialIndex?: number
}

/** play() 被新的 load/play 打断时浏览器抛 AbortError，属预期 */
function isPlayAbortError(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError'
}

function waitForCanPlay(audio: HTMLAudioElement, isStale: () => boolean, timeoutMs = 12000) {
  if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
    return Promise.resolve()
  }
  return new Promise<void>((resolve, reject) => {
    let done = false
    const finish = (fn: () => void) => {
      if (done) return
      done = true
      window.clearTimeout(timer)
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('error', onError)
      fn()
    }
    const onCanPlay = () => finish(() => resolve())
    const onError = () =>
      finish(() => reject(audio.error ?? new Error('音频加载失败')))
    const timer = window.setTimeout(() => {
      finish(() => reject(new Error('音频加载超时')))
    }, timeoutMs)

    audio.addEventListener('canplay', onCanPlay)
    audio.addEventListener('error', onError)
    if (isStale()) finish(() => resolve())
  })
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
  /** goTo 已自行 load/play，跳过紧随其后的 index effect */
  const skipIndexEffectRef = useRef(false)
  /** 换源过程中忽略 pause 事件，避免 UI 被打成「已暂停」 */
  const switchingRef = useRef(false)
  /** 递增令牌：丢弃过期的 play / canplay 重试 */
  const playTokenRef = useRef(0)

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

  const resolveSongUrl = useCallback((song: Song): string => {
    if (!song.localFile) return song.url
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
   * 同步换源。同一首歌同一 URL 不重复 load，防止打断 play()。
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

      switchingRef.current = true
      playTokenRef.current += 1
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

  /** 发起播放；若被 load 打断或尚未缓冲好，等 canplay 再试一次（绝不二次 force load） */
  const playAudio = useCallback(async (token: number) => {
    const audio = audioRef.current
    if (!audio) return false
    const isStale = () => token !== playTokenRef.current

    const markPlaying = () => {
      switchingRef.current = false
      setIsPlaying(true)
      isPlayingRef.current = true
    }

    const tryPlay = async () => {
      if (isStale()) return false
      await audio.play()
      return !isStale()
    }

    try {
      if (await tryPlay()) {
        markPlaying()
        return true
      }
      return false
    } catch (err) {
      if (isStale()) return false
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        switchingRef.current = false
        throw err
      }

      // AbortError / 尚未缓冲：等 canplay 后重试
      try {
        await waitForCanPlay(audio, isStale)
        if (isStale()) return false
        if (await tryPlay()) {
          markPlaying()
          return true
        }
        return false
      } catch (err2) {
        switchingRef.current = false
        if (isStale() || isPlayAbortError(err2)) return false
        throw err2
      }
    }
  }, [])

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
        if (list.length === 0) {
          setIsPlaying(false)
          isPlayingRef.current = false
          return idx
        }
        // 首尾相接：播完最后一首回到第一首
        return (idx + 1) % list.length
      })
    }
    const onPlay = () => {
      switchingRef.current = false
      setIsPlaying(true)
      isPlayingRef.current = true
    }
    const onPause = () => {
      // 换源 / 主动 play 过程中 load 会触发 pause，不能当成用户暂停
      if (userPlayLockRef.current || switchingRef.current) return
      setIsPlaying(false)
      isPlayingRef.current = false
    }
    const onError = () => {
      if (switchingRef.current || userPlayLockRef.current) return
      console.error('audio element error', audio.error)
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('durationchange', onLoaded)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('error', onError)

    return () => {
      audio.pause()
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('durationchange', onLoaded)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('error', onError)
      audioRef.current = null
      loadedSongIdRef.current = null
      loadedUrlRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 切歌换源；播放中则继续（播完自动下一首等）
  useEffect(() => {
    if (!currentSong) return
    if (userPlayLockRef.current) return
    if (skipIndexEffectRef.current) {
      skipIndexEffectRef.current = false
      return
    }

    loadSong(currentSong)
    const token = playTokenRef.current
    if (isPlayingRef.current) {
      void playAudio(token)
        .then((ok) => {
          if (!ok && playTokenRef.current === token) {
            setIsPlaying(false)
            isPlayingRef.current = false
          }
        })
        .catch((err) => {
          if (isPlayAbortError(err)) return
          console.error('autoplay/continue failed', err, audioRef.current?.error)
          if (playTokenRef.current === token) {
            setIsPlaying(false)
            isPlayingRef.current = false
          }
        })
    } else {
      // 仅预加载时尽快结束 switching，避免卡住 pause 屏蔽
      window.setTimeout(() => {
        if (playTokenRef.current === token) switchingRef.current = false
      }, 0)
    }
  }, [currentIndex, currentSong?.id, loadSong, playAudio])

  const play = useCallback(async () => {
    const audio = audioRef.current
    const song = songsRef.current[currentIndexRef.current]
    if (!audio || !song) return false

    userPlayLockRef.current = true
    switchingRef.current = true

    /**
     * 重要：必须在用户点击的同步调用栈里立刻调用 audio.play()。
     * 若先 await canplay，会丢失用户手势，被浏览器以 NotAllowedError 拦截。
     */
    try {
      const alreadyLoaded =
        loadedSongIdRef.current === song.id &&
        loadedUrlRef.current === resolveSongUrl(song)

      if (!alreadyLoaded) {
        loadSong(song)
      } else {
        // 已加载：刷新 token，避免旧重试干扰
        playTokenRef.current += 1
      }
      const token = playTokenRef.current

      // 同步发起 play（不要在此前 await）
      const ok = await playAudio(token)
      if (ok) return true

      // 本地文件 MIME/损坏：重建 blob 后再试（仍尽量同步 play）
      if (song.localFile) {
        loadSong(song, { force: true, recreate: true })
        const retryToken = playTokenRef.current
        const ok2 = await playAudio(retryToken)
        if (ok2) return true
      }

      setIsPlaying(false)
      isPlayingRef.current = false
      return false
    } catch (err) {
      console.error('audio.play failed', err, audio.error)
      setIsPlaying(false)
      isPlayingRef.current = false
      return false
    } finally {
      userPlayLockRef.current = false
      switchingRef.current = false
    }
  }, [loadSong, playAudio, resolveSongUrl])

  const pause = useCallback(() => {
    userPlayLockRef.current = false
    switchingRef.current = false
    playTokenRef.current += 1
    audioRef.current?.pause()
    setIsPlaying(false)
    isPlayingRef.current = false
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
      skipIndexEffectRef.current = true
      loadSong(song)
      const token = playTokenRef.current
      setCurrentIndex(index)
      setIsPlaying(autoPlay)
      isPlayingRef.current = autoPlay

      const audio = audioRef.current
      if (!audio) return true

      if (!autoPlay) {
        switchingRef.current = false
        audio.pause()
      } else {
        // 同步 play，保留点击/手势用户激活；失败则 canplay 重试
        void playAudio(token)
          .then((ok) => {
            if (!ok && playTokenRef.current === token) {
              setIsPlaying(false)
              isPlayingRef.current = false
            }
          })
          .catch((err) => {
            if (isPlayAbortError(err)) return
            console.error('goTo autoplay failed', err, audio.error)
            if (playTokenRef.current === token) {
              setIsPlaying(false)
              isPlayingRef.current = false
            }
          })
      }
      return true
    },
    [loadSong, playAudio],
  )

  const next = useCallback(() => {
    const len = songsRef.current.length
    if (len === 0) return false
    return goTo((currentIndex + 1) % len)
  }, [currentIndex, goTo])

  const prev = useCallback(() => {
    const len = songsRef.current.length
    if (len === 0) return false
    return goTo((currentIndex - 1 + len) % len)
  }, [currentIndex, goTo])

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
