import type { Song } from '../types'

interface FavoritesDrawerProps {
  open: boolean
  songs: Song[]
  currentSongId: number
  onClose: () => void
  onOpen: () => void
  onSelect: (songId: number) => void
  onUnlike: (songId: number) => void
}

/** 右侧收藏歌单抽屉 */
export function FavoritesDrawer({
  open,
  songs,
  currentSongId,
  onClose,
  onOpen,
  onSelect,
  onUnlike,
}: FavoritesDrawerProps) {
  return (
    <>
      {/* 右侧边缘入口 */}
      <button
        type="button"
        onClick={onOpen}
        aria-label="打开收藏歌单"
        className={`fixed right-0 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-1 rounded-l-2xl border border-r-0 border-neutral-200/80 bg-white/90 px-2 py-4 text-neutral-600 shadow-lg shadow-neutral-900/10 backdrop-blur-md transition hover:bg-white hover:text-neutral-900 ${
          open ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
      >
        <svg className="h-4 w-4 text-rose-500" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 21s-6.5-4.35-9-8.1C1.2 10.3 1.5 6.8 4.2 5.1 6.4 3.7 9 4.3 12 7c3-2.7 5.6-3.3 7.8-1.9 2.7 1.7 3 5.2 1.2 7.8C18.5 16.65 12 21 12 21z" />
        </svg>
        <span
          className="text-[10px] font-medium tracking-wide"
          style={{ writingMode: 'vertical-rl' }}
        >
          收藏歌单
        </span>
        {songs.length > 0 && (
          <span className="mt-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-neutral-900 px-1 text-[10px] text-white">
            {songs.length}
          </span>
        )}
      </button>

      {/* 遮罩 */}
      <button
        type="button"
        aria-label="关闭收藏歌单"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* 抽屉面板 */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-[min(86vw,340px)] flex-col bg-white shadow-2xl shadow-neutral-900/20 transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!open}
      >
        <header className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">收藏歌单</h2>
            <p className="mt-0.5 text-xs text-neutral-400">
              {songs.length > 0 ? `${songs.length} 首收藏` : '还没有收藏歌曲'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          {songs.length === 0 ? (
            <div className="flex h-full min-h-[220px] flex-col items-center justify-center px-6 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-400">
                <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M12 21s-6.5-4.35-9-8.1C1.2 10.3 1.5 6.8 4.2 5.1 6.4 3.7 9 4.3 12 7c3-2.7 5.6-3.3 7.8-1.9 2.7 1.7 3 5.2 1.2 7.8C18.5 16.65 12 21 12 21z" />
                </svg>
              </div>
              <p className="text-sm text-neutral-500">点赞手势或爱心按钮可收藏歌曲</p>
            </div>
          ) : (
            <ul className="space-y-1">
              {songs.map((song, index) => {
                const active = song.id === currentSongId
                return (
                  <li key={song.id}>
                    <div
                      className={`group flex items-center gap-3 rounded-2xl px-2 py-2 transition ${
                        active ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(song.id)
                          onClose()
                        }}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <span
                          className={`w-5 shrink-0 text-center text-xs tabular-nums ${
                            active ? 'text-white/50' : 'text-neutral-300'
                          }`}
                        >
                          {index + 1}
                        </span>
                        <img
                          src={song.cover}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded-xl object-cover"
                          draggable={false}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{song.title}</span>
                          <span
                            className={`mt-0.5 block truncate text-xs ${
                              active ? 'text-white/55' : 'text-neutral-400'
                            }`}
                          >
                            {song.artist}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={`取消收藏 ${song.title}`}
                        onClick={() => onUnlike(song.id)}
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
                          active
                            ? 'text-rose-300 hover:bg-white/10'
                            : 'text-rose-400 hover:bg-rose-50'
                        }`}
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 21s-6.5-4.35-9-8.1C1.2 10.3 1.5 6.8 4.2 5.1 6.4 3.7 9 4.3 12 7c3-2.7 5.6-3.3 7.8-1.9 2.7 1.7 3 5.2 1.2 7.8C18.5 16.65 12 21 12 21z" />
                        </svg>
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>
    </>
  )
}
