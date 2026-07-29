interface ControlsProps {
  isPlaying: boolean
  canPrev: boolean
  canNext: boolean
  liked: boolean
  likedCount?: number
  onTogglePlay: () => void
  onPrev: () => void
  onNext: () => void
  onToggleLike: () => void
  onOpenShare?: () => void
  onOpenFavorites?: () => void
}

export function Controls({
  isPlaying,
  canPrev,
  canNext,
  liked,
  likedCount = 0,
  onTogglePlay,
  onPrev,
  onNext,
  onToggleLike,
  onOpenShare,
  onOpenFavorites,
}: ControlsProps) {
  return (
    <div className="flex items-center justify-center gap-5 sm:gap-7">
      <button
        type="button"
        aria-label={liked ? '取消收藏' : '收藏'}
        onClick={onToggleLike}
        className={`flex h-10 w-10 items-center justify-center transition ${
          liked ? 'text-rose-500' : 'text-neutral-400 hover:text-neutral-600'
        }`}
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
          <path d="M12 21s-6.5-4.35-9-8.1C1.2 10.3 1.5 6.8 4.2 5.1 6.4 3.7 9 4.3 12 7c3-2.7 5.6-3.3 7.8-1.9 2.7 1.7 3 5.2 1.2 7.8C18.5 16.65 12 21 12 21z" />
        </svg>
      </button>

      <button
        type="button"
        aria-label="上一首"
        disabled={!canPrev}
        onClick={onPrev}
        className="flex h-11 w-11 items-center justify-center text-neutral-800 transition enabled:hover:text-black disabled:opacity-25"
      >
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
        </svg>
      </button>

      <button
        type="button"
        aria-label={isPlaying ? '暂停' : '播放'}
        onClick={onTogglePlay}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 text-white shadow-lg shadow-neutral-900/20 transition active:scale-95"
      >
        {isPlaying ? (
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 5h3v14H7V5zm7 0h3v14h-3V5z" />
          </svg>
        ) : (
          <svg className="ml-0.5 h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7L8 5z" />
          </svg>
        )}
      </button>

      <button
        type="button"
        aria-label="下一首"
        disabled={!canNext}
        onClick={onNext}
        className="flex h-11 w-11 items-center justify-center text-neutral-800 transition enabled:hover:text-black disabled:opacity-25"
      >
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16 6h2v12h-2V6zM6 18l8.5-6L6 6v12z" />
        </svg>
      </button>

      <button
        type="button"
        aria-label="分享歌曲"
        onClick={onOpenShare}
        className="flex h-10 w-10 items-center justify-center text-neutral-400 transition hover:text-neutral-700"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path
            d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <button
        type="button"
        aria-label="打开收藏歌单"
        onClick={onOpenFavorites}
        className="relative flex h-10 w-10 items-center justify-center text-neutral-400 transition hover:text-neutral-700"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" strokeLinecap="round" />
        </svg>
        {likedCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-medium text-white">
            {likedCount}
          </span>
        )}
      </button>
    </div>
  )
}
