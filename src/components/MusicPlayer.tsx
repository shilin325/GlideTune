import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SONGS } from '../data/songs'
import type { HandFrame, HandGesture } from '../hand/types'
import { useAudioPlayer } from '../hooks/useAudioPlayer'
import { useDetectedBpm } from '../hooks/useDetectedBpm'
import { useHandTracking } from '../hooks/useHandTracking'
import type { Song } from '../types'
import {
  hydrateStoredSong,
  listStoredUploadedSongs,
  saveUploadedSong,
} from '../utils/songStorage'
import { AlbumCover, type CoverLayout } from './AlbumCover'
import { Controls } from './Controls'
import { FavoritesDrawer } from './FavoritesDrawer'
import { FeatureIntro } from './FeatureIntro'
import { HandParticleLayer } from './HandParticleLayer'
import { ProgressBar } from './ProgressBar'
import { ShareCard, type ShareCardHandle } from './ShareCard'
import { RhythmGame } from './RhythmGame'
import { Toast } from './Toast'
import { UploadSongModal } from './UploadSongModal'

/**
 * 移动端风格音乐播放页
 * - 触摸手势：左右切歌
 * - 摄像头手势：MediaPipe 关键点 + 粒子特效；比耶分享
 * - 支持本地上传歌曲加入播放列表
 */
export function MusicPlayer() {
  const [playlist, setPlaylist] = useState<Song[]>(() => [...SONGS])
  const [uploadOpen, setUploadOpen] = useState(false)
  const nextIdRef = useRef(SONGS.reduce((max, s) => Math.max(max, s.id), 0) + 1)

  const {
    currentSong,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    likedIds,
    play,
    togglePlay,
    pause,
    seek,
    next,
    prev,
    goTo,
    toggleLike,
  } = useAudioPlayer({ songs: playlist })

  const { bpm: beatBpm } = useDetectedBpm(currentSong)

  const [shareOpen, setShareOpen] = useState(false)
  const [favoritesOpen, setFavoritesOpen] = useState(false)
  const [gameOpen, setGameOpen] = useState(false)
  const [coverLayout, setCoverLayout] = useState<CoverLayout>('orbit')
  const [toast, setToast] = useState<string | null>(null)
  const [handEnabled, setHandEnabled] = useState(false)
  const [lastGesture, setLastGesture] = useState<HandGesture | null>(null)
  const [burstGesture, setBurstGesture] = useState<{
    gesture: HandGesture
    at: number
  } | null>(null)

  const toastTimer = useRef<number | null>(null)
  const gestureLabelTimer = useRef<number | null>(null)
  const isPlayingRef = useRef(isPlaying)
  const likedIdsRef = useRef(likedIds)
  const currentSongRef = useRef(currentSong)
  const shareOpenRef = useRef(false)
  const gameOpenRef = useRef(false)
  const shareCardRef = useRef<ShareCardHandle>(null)
  const playlistRef = useRef(playlist)

  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])
  useEffect(() => {
    likedIdsRef.current = likedIds
  }, [likedIds])
  useEffect(() => {
    currentSongRef.current = currentSong
  }, [currentSong])
  useEffect(() => {
    shareOpenRef.current = shareOpen
  }, [shareOpen])
  useEffect(() => {
    gameOpenRef.current = gameOpen
  }, [gameOpen])
  useEffect(() => {
    playlistRef.current = playlist
  }, [playlist])

  // 启动时从 IndexedDB 恢复上传歌曲
  useEffect(() => {
    let cancelled = false
    void listStoredUploadedSongs()
      .then((rows) => {
        if (cancelled || rows.length === 0) return
        const uploaded = rows.map(hydrateStoredSong)
        setPlaylist((prev) => {
          const ids = new Set(prev.map((s) => s.id))
          const fresh = uploaded.filter((s) => !ids.has(s.id))
          if (fresh.length === 0) return prev
          const next = [...prev, ...fresh]
          playlistRef.current = next
          const maxId = next.reduce((m, s) => Math.max(m, s.id), 0)
          nextIdRef.current = Math.max(nextIdRef.current, maxId + 1)
          return next
        })
      })
      .catch((err) => {
        console.warn('恢复上传歌曲失败', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const showToast = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 1600)
  }, [])

  const openRhythmGame = useCallback(() => {
    setShareOpen(false)
    setFavoritesOpen(false)
    setUploadOpen(false)
    setGameOpen(true)
    setHandEnabled(true)
    showToast('音符游戏 · 用手击打下落方块')
    if (!isPlayingRef.current) {
      void play()
    }
  }, [play, showToast])

  const openShare = useCallback(() => {
    setShareOpen(true)
    showToast('分享歌曲 · 上下滑换色')
  }, [showToast])

  const onBoundary = useCallback(
    (dir: 'left' | 'right') => {
      navigator.vibrate?.(20)
      showToast(dir === 'left' ? '已经是第一首了' : '已经是最后一首了')
    },
    [showToast],
  )

  const toggleCoverLayout = useCallback(() => {
    setCoverLayout((prev) => {
      const nextLayout = prev === 'orbit' ? 'flat' : 'orbit'
      showToast(nextLayout === 'flat' ? '平铺列表 · 当前封面放大' : '环绕模式')
      return nextLayout
    })
  }, [showToast])

  const handleUpload = useCallback(
    (draft: Omit<Song, 'id'>) => {
      const id = nextIdRef.current
      nextIdRef.current += 1
      const song: Song = { id, ...draft }
      const nextList = [...playlistRef.current, song]
      playlistRef.current = nextList
      setPlaylist(nextList)
      // 传入最新列表并同步换源，避免 setTimeout / songsRef 竞态；不自动播放
      goTo(nextList.length - 1, false, nextList)
      showToast(`已加入播放列表 · ${song.title}`)
      void saveUploadedSong(song).catch((err) => {
        console.warn('上传歌曲持久化失败', err)
        showToast('已加入列表，但本地保存失败')
      })
    },
    [goTo, showToast],
  )

  /** 摄像头手势 → 播放器动作（分享卡：上下滑换色 / 点赞保存 / 点踩取消） */
  const handleHandGesture = useCallback(
    (gesture: HandGesture, frame: HandFrame) => {
      setLastGesture(gesture)
      setBurstGesture({ gesture, at: frame.timestamp })
      if (gestureLabelTimer.current) window.clearTimeout(gestureLabelTimer.current)
      gestureLabelTimer.current = window.setTimeout(() => setLastGesture(null), 1800)

      // 游戏模式：交给下落音符命中逻辑，不触发切歌/收藏
      if (gameOpenRef.current) return

      // 分享模式
      if (shareOpenRef.current) {
        if (gesture === 'thumb_down') {
          shareCardRef.current?.cancel()
          showToast('已取消')
        } else if (gesture === 'thumb_up') {
          const ok = shareCardRef.current?.save()
          if (ok) showToast('图片已保存')
          else showToast('图片尚未就绪')
        } else if (gesture === 'swipe_up') {
          shareCardRef.current?.cycleColor(1)
          showToast('下一配色')
        } else if (gesture === 'swipe_down') {
          shareCardRef.current?.cycleColor(-1)
          showToast('上一配色')
        }
        return
      }

      const song = currentSongRef.current
      if (!song) return

      switch (gesture) {
        case 'open_palm': {
          // 在切换前记录状态：play() 成功后 isPlayingRef 已是 true，不能事后再读
          const wasPlaying = isPlayingRef.current
          void togglePlay().then((ok) => {
            if (!ok) showToast('无法播放该音频')
            else showToast(wasPlaying ? '暂停' : '播放')
          })
          break
        }
        case 'closed_fist':
          pause()
          showToast('已暂停')
          break
        case 'swipe_left':
          if (next()) showToast('下一首')
          break
        case 'swipe_right':
          if (prev()) showToast('上一首')
          break
        case 'thumb_up': {
          const liked = likedIdsRef.current.has(song.id)
          if (!liked) toggleLike(song.id)
          showToast('已收藏')
          break
        }
        case 'thumb_down': {
          const liked = likedIdsRef.current.has(song.id)
          if (liked) toggleLike(song.id)
          showToast('已取消收藏')
          break
        }
        case 'victory':
          openShare()
          break
        case 'pinch':
          toggleCoverLayout()
          break
        default:
          break
      }
    },
    [
      togglePlay,
      pause,
      next,
      prev,
      showToast,
      toggleLike,
      openShare,
      toggleCoverLayout,
    ],
  )

  const { videoRef, status, error, frame, frameRef, loadProgress, loadLabel } =
    useHandTracking({
      enabled: handEnabled,
      onGesture: handleHandGesture,
    })

  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [])

  const likedSongs = useMemo(
    () => playlist.filter((song) => likedIds.has(song.id)),
    [likedIds, playlist],
  )

  const playLikedSong = useCallback(
    (songId: number) => {
      const index = playlistRef.current.findIndex((song) => song.id === songId)
      if (index >= 0) goTo(index)
    },
    [goTo],
  )

  if (!currentSong) return null

  const liked = likedIds.has(currentSong.id)

  return (
    <div className="relative flex min-h-[100dvh] w-full items-center justify-center overflow-hidden bg-[#f4f4f5] font-display text-neutral-900">
      {/* 当前封面淡色氛围光 */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40 transition-opacity duration-700"
        style={{
          backgroundImage: `url(${currentSong.cover})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(64px) saturate(1.05)',
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/85 via-[#f4f4f5]/92 to-[#ececef]" />

      <FeatureIntro />

      {/* 摄像头手势粒子层 */}
      <HandParticleLayer
        videoRef={videoRef}
        frame={frame}
        frameRef={frameRef}
        status={status}
        error={error}
        enabled={handEnabled}
        lastGesture={lastGesture}
        burstGesture={burstGesture}
        shareMode={shareOpen}
        loadProgress={loadProgress}
        loadLabel={loadLabel}
        onToggle={() => setHandEnabled((v) => !v)}
      />

      <div className="relative z-10 flex h-[100dvh] w-full max-w-xl flex-col px-4 pb-12 pt-12 sm:max-w-2xl sm:px-6 sm:pb-14">
        <header className="relative shrink-0 text-center">
          <button
            type="button"
            onClick={openRhythmGame}
            aria-label="打开音符游戏"
            className="absolute left-0 top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-full border border-neutral-200/80 bg-white/80 px-3 py-1.5 text-xs font-medium text-neutral-600 shadow-sm backdrop-blur-md transition hover:bg-white hover:text-neutral-900"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="4" y="4" width="6" height="6" rx="1.5" />
              <rect x="14" y="4" width="6" height="6" rx="1.5" />
              <rect x="9" y="14" width="6" height="6" rx="1.5" />
            </svg>
            游戏
          </button>
          <p className="text-[11px] uppercase tracking-[0.28em] text-neutral-400">
            GlideTune · {currentIndex + 1}/{playlist.length}
          </p>
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            aria-label="上传歌曲"
            className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-full border border-neutral-200/80 bg-white/80 px-3 py-1.5 text-xs font-medium text-neutral-600 shadow-sm backdrop-blur-md transition hover:bg-white hover:text-neutral-900"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            上传
          </button>
        </header>

        <AlbumCover
          songs={playlist}
          currentIndex={currentIndex}
          isPlaying={isPlaying}
          canPrev={playlist.length > 1}
          canNext={playlist.length > 1}
          layout={coverLayout}
          beatBpm={beatBpm}
          onPrev={() => prev()}
          onNext={() => next()}
          onBoundary={onBoundary}
          onSelect={(index) => goTo(index)}
          onToggleLayout={toggleCoverLayout}
        />

        <footer className="mt-auto shrink-0 space-y-4 pt-4">
          <Controls
            isPlaying={isPlaying}
            canPrev={playlist.length > 1}
            canNext={playlist.length > 1}
            liked={liked}
            likedCount={likedSongs.length}
            onTogglePlay={() => {
              // 在点击同步栈里直接调 play()，保留用户手势（勿先 await 其它异步）
              if (isPlaying) {
                pause()
                return
              }
              void play().then((ok) => {
                if (!ok) showToast('无法播放该音频')
              })
            }}
            onPrev={() => {
              prev()
            }}
            onNext={() => {
              next()
            }}
            onToggleLike={() => {
              toggleLike(currentSong.id)
              showToast(liked ? '已取消收藏' : '已收藏')
            }}
            onOpenShare={openShare}
            onOpenFavorites={() => setFavoritesOpen(true)}
          />

          <div className="space-y-1 text-center">
            <h1
              key={`title-${currentSong.id}`}
              className="truncate text-lg font-semibold tracking-tight text-neutral-900 animate-fade-in"
            >
              {currentSong.title}
            </h1>
            <p
              key={`artist-${currentSong.id}`}
              className="truncate text-sm text-neutral-500 animate-fade-in"
            >
              {currentSong.artist}
            </p>
          </div>

          <ProgressBar currentTime={currentTime} duration={duration} onSeek={seek} />

          <div className="flex justify-center gap-1.5 pt-1">
            {playlist.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-label={`播放 ${s.title}`}
                onClick={() => goTo(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === currentIndex ? 'w-5 bg-neutral-800' : 'w-1.5 bg-neutral-300 hover:bg-neutral-400'
                }`}
              />
            ))}
          </div>
        </footer>
      </div>

      <footer className="pointer-events-none absolute inset-x-0 bottom-3 z-10 px-4 text-center sm:bottom-4">
        <p className="text-[11px] tracking-wide text-neutral-400">
          <span className="text-neutral-500/80">Authors</span>
          <span className="mx-2 text-neutral-300">·</span>
          <span className="text-neutral-500">shilinzhu</span>
          <span className="mx-1.5 text-neutral-300">,</span>
          <span className="text-neutral-500">winniexin</span>
          <span className="mx-1.5 text-neutral-300">,</span>
          <span className="text-neutral-500">lewinzhou</span>
        </p>
      </footer>

      <FavoritesDrawer
        open={favoritesOpen}
        songs={likedSongs}
        currentSongId={currentSong.id}
        onOpen={() => setFavoritesOpen(true)}
        onClose={() => setFavoritesOpen(false)}
        onSelect={playLikedSong}
        onUnlike={(songId) => {
          toggleLike(songId)
          showToast('已取消收藏')
        }}
      />

      <UploadSongModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSubmit={handleUpload}
      />

      <Toast message={toast} />
      <ShareCard
        ref={shareCardRef}
        open={shareOpen}
        song={currentSong}
        onClose={() => setShareOpen(false)}
      />

      <RhythmGame
        open={gameOpen}
        songId={currentSong.id}
        songTitle={currentSong.title}
        bpm={beatBpm}
        currentTime={currentTime}
        duration={duration}
        isPlaying={isPlaying}
        frameRef={frameRef}
        handReady={handEnabled && status === 'ready'}
        onClose={() => setGameOpen(false)}
        onRequestPlay={() => {
          if (!isPlaying) void play()
        }}
      />
    </div>
  )
}
