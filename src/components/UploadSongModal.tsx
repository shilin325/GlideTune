import { useEffect, useRef, useState } from 'react'
import defaultCoverUrl from '../assets/default-cover.svg'
import type { Song } from '../types'
import { isMp3OrWavFile, toAudioBlob } from '../utils/audioFile'

/** 由 Vite 打包的默认封面，避免 public 路径 / 编码问题 */
export const DEFAULT_COVER = defaultCoverUrl

interface UploadSongModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (song: Omit<Song, 'id'>) => void
}

/** 上传本地音频与封面，加入播放列表（仅 MP3 / WAV） */
export function UploadSongModal({ open, onClose, onSubmit }: UploadSongModalProps) {
  const coverInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [coverPreview, setCoverPreview] = useState(DEFAULT_COVER)
  const [coverUrl, setCoverUrl] = useState(DEFAULT_COVER)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioFile, setAudioFile] = useState<Blob | null>(null)
  const [audioName, setAudioName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const coverObjectUrl = useRef<string | null>(null)
  const audioObjectUrl = useRef<string | null>(null)

  const resetForm = () => {
    setTitle('')
    setArtist('')
    setCoverPreview(DEFAULT_COVER)
    setCoverUrl(DEFAULT_COVER)
    setAudioUrl(null)
    setAudioFile(null)
    setAudioName('')
    setError(null)
    if (coverObjectUrl.current) {
      URL.revokeObjectURL(coverObjectUrl.current)
      coverObjectUrl.current = null
    }
    // 未提交的音频预览需释放；提交成功后会先清空 ref，避免误删列表中的地址
    if (audioObjectUrl.current) {
      URL.revokeObjectURL(audioObjectUrl.current)
      audioObjectUrl.current = null
    }
    if (coverInputRef.current) coverInputRef.current.value = ''
    if (audioInputRef.current) audioInputRef.current.value = ''
  }

  useEffect(() => {
    if (!open) return
    resetForm()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    return () => {
      if (coverObjectUrl.current) URL.revokeObjectURL(coverObjectUrl.current)
      if (audioObjectUrl.current) URL.revokeObjectURL(audioObjectUrl.current)
    }
  }, [])

  if (!open) return null

  const onPickCover = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('请选择图片作为封面')
      return
    }
    if (coverObjectUrl.current) URL.revokeObjectURL(coverObjectUrl.current)
    const url = URL.createObjectURL(file)
    coverObjectUrl.current = url
    setCoverPreview(url)
    setCoverUrl(url)
    setError(null)
  }

  const onPickAudio = (file: File | undefined) => {
    if (!file) return
    if (!isMp3OrWavFile(file)) {
      setError('仅支持 MP3 或 WAV 文件')
      return
    }
    if (audioObjectUrl.current) URL.revokeObjectURL(audioObjectUrl.current)
    const blob = toAudioBlob(file, file.name)
    const url = URL.createObjectURL(blob)
    audioObjectUrl.current = url
    setAudioUrl(url)
    setAudioFile(blob)
    setAudioName(file.name)
    if (!title.trim()) {
      const base = file.name.replace(/\.[^.]+$/, '')
      setTitle(base || '未命名歌曲')
    }
    setError(null)
  }

  const handleSubmit = () => {
    if (!audioUrl || !audioFile) {
      setError('请先上传音频文件')
      return
    }
    const finalTitle = title.trim() || audioName.replace(/\.[^.]+$/, '') || '未命名歌曲'
    const finalArtist = artist.trim() || '本地上传'

    // 提交后由播放列表持有音频 URL / File，避免卸载时被 revoke
    audioObjectUrl.current = null
    if (coverUrl !== DEFAULT_COVER) coverObjectUrl.current = null

    onSubmit({
      title: finalTitle,
      artist: finalArtist,
      cover: coverUrl || DEFAULT_COVER,
      url: audioUrl,
      localFile: audioFile,
    })
    onClose()
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/45 px-5 backdrop-blur-sm animate-fade-in">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="关闭上传"
        onClick={onClose}
      />

      <div className="relative w-[min(92vw,380px)] overflow-hidden rounded-3xl bg-white shadow-2xl shadow-neutral-900/20">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-neutral-900">上传歌曲</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {/* 封面 */}
          <div>
            <p className="mb-2 text-xs font-medium text-neutral-600">专辑封面</p>
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              className="group relative mx-auto flex h-36 w-36 items-center justify-center overflow-hidden rounded-2xl bg-neutral-100 ring-1 ring-neutral-200"
            >
              <img
                src={coverPreview}
                alt="封面预览"
                className="h-full w-full object-cover"
                draggable={false}
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/35 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
                更换封面
              </span>
            </button>
            <p className="mt-2 text-center text-[11px] text-neutral-400">
              未上传时使用默认封面
            </p>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onPickCover(e.target.files?.[0])}
            />
          </div>

          {/* 音频 */}
          <div>
            <p className="mb-2 text-xs font-medium text-neutral-600">音频文件</p>
            <button
              type="button"
              onClick={() => audioInputRef.current?.click()}
              className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-3 text-left transition hover:border-neutral-400 hover:bg-neutral-100"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-neutral-600 shadow-sm">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12 16V4M8 8l4-4 4 4M4 20h16" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-neutral-800">
                  {audioName || '选择音频文件'}
                </span>
                <span className="mt-0.5 block text-[11px] text-neutral-400">
                  仅支持 MP3 / WAV
                </span>
              </span>
            </button>
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/mpeg,audio/wav,audio/x-wav,audio/wave,.mp3,.wav"
              className="hidden"
              onChange={(e) => onPickAudio(e.target.files?.[0])}
            />
          </div>

          {/* 元信息 */}
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-neutral-600">歌曲名</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="未命名歌曲"
                className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-neutral-400"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-neutral-600">艺人</span>
              <input
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="本地上传"
                className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-neutral-400"
              />
            </label>
          </div>

          {error && <p className="text-center text-xs text-rose-500">{error}</p>}
        </div>

        <div className="grid grid-cols-2 border-t border-neutral-100">
          <button
            type="button"
            onClick={onClose}
            className="py-3.5 text-sm text-neutral-500 transition hover:bg-neutral-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="border-l border-neutral-100 py-3.5 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
          >
            加入列表
          </button>
        </div>
      </div>
    </div>
  )
}
