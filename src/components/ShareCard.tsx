import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { Song } from '../types'

const CARD_W = 720
const CARD_H = 960
const COVER = 520
const PAD = 100

interface CardTheme {
  id: string
  name: string
  /** 色板展示色 */
  swatch: string
  from: string
  to: string
  title: string
  artist: string
  brand: string
  glow: string
}

const CARD_THEMES: CardTheme[] = [
  {
    id: 'ink',
    name: '墨黑',
    swatch: '#1a1a1f',
    from: '#1a1a1f',
    to: '#0c0c10',
    title: '#ffffff',
    artist: 'rgba(255,255,255,0.55)',
    brand: 'rgba(255,255,255,0.28)',
    glow: 'rgba(255,255,255,0.04)',
  },
  {
    id: 'ocean',
    name: '海青',
    swatch: '#0e7490',
    from: '#164e63',
    to: '#083344',
    title: '#ecfeff',
    artist: 'rgba(207,250,254,0.65)',
    brand: 'rgba(165,243,252,0.35)',
    glow: 'rgba(34,211,238,0.12)',
  },
  {
    id: 'rose',
    name: '玫红',
    swatch: '#be123c',
    from: '#9f1239',
    to: '#4c0519',
    title: '#fff1f2',
    artist: 'rgba(255,228,230,0.65)',
    brand: 'rgba(254,205,211,0.35)',
    glow: 'rgba(251,113,133,0.14)',
  },
  {
    id: 'forest',
    name: '森绿',
    swatch: '#15803d',
    from: '#166534',
    to: '#052e16',
    title: '#f0fdf4',
    artist: 'rgba(220,252,231,0.65)',
    brand: 'rgba(187,247,208,0.35)',
    glow: 'rgba(74,222,128,0.12)',
  },
  {
    id: 'sunset',
    name: '暖橙',
    swatch: '#ea580c',
    from: '#c2410c',
    to: '#431407',
    title: '#fff7ed',
    artist: 'rgba(255,237,213,0.65)',
    brand: 'rgba(254,215,170,0.35)',
    glow: 'rgba(251,146,60,0.14)',
  },
  {
    id: 'lilac',
    name: '雾紫',
    swatch: '#7c3aed',
    from: '#5b21b6',
    to: '#2e1065',
    title: '#f5f3ff',
    artist: 'rgba(237,233,254,0.65)',
    brand: 'rgba(221,214,254,0.35)',
    glow: 'rgba(167,139,250,0.14)',
  },
  {
    id: 'paper',
    name: '素纸',
    swatch: '#e7e5e4',
    from: '#f5f5f4',
    to: '#d6d3d1',
    title: '#1c1917',
    artist: 'rgba(68,64,60,0.7)',
    brand: 'rgba(120,113,108,0.45)',
    glow: 'rgba(255,255,255,0.55)',
  },
]

export interface ShareCardHandle {
  /** 保存图片并关闭；未就绪时返回 false */
  save: () => boolean
  /** 取消并关闭 */
  cancel: () => void
  /** 切换颜色：1 下一色，-1 上一色 */
  cycleColor: (delta: 1 | -1) => void
}

interface ShareCardProps {
  open: boolean
  song: Song
  onClose: () => void
  onSaved?: () => void
}

/** 分享卡片：生成含封面与歌名的图片，可预览并保存 */
export const ShareCard = forwardRef<ShareCardHandle, ShareCardProps>(function ShareCard(
  { open, song, onClose, onSaved },
  ref,
) {
  const [themeIndex, setThemeIndex] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const songRef = useRef(song)
  const themeIndexRef = useRef(0)

  const theme = CARD_THEMES[themeIndex] ?? CARD_THEMES[0]

  useEffect(() => {
    songRef.current = song
  }, [song])

  useEffect(() => {
    previewUrlRef.current = previewUrl
  }, [previewUrl])

  useEffect(() => {
    themeIndexRef.current = themeIndex
  }, [themeIndex])

  const buildCard = useCallback(async (target: Song, themeId: string) => {
    const selected = CARD_THEMES.find((t) => t.id === themeId) ?? CARD_THEMES[0]
    setBusy(true)
    setError(null)
    setPreviewUrl(null)

    try {
      const canvas = document.createElement('canvas')
      canvas.width = CARD_W
      canvas.height = CARD_H
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('无法创建画布')

      const bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H)
      bg.addColorStop(0, selected.from)
      bg.addColorStop(1, selected.to)
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, CARD_W, CARD_H)

      ctx.fillStyle = selected.glow
      ctx.beginPath()
      ctx.ellipse(CARD_W / 2, 280, 340, 220, 0, 0, Math.PI * 2)
      ctx.fill()

      const img = await loadImage(target.cover)
      const coverX = (CARD_W - COVER) / 2
      const coverY = PAD

      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.45)'
      ctx.shadowBlur = 40
      ctx.shadowOffsetY = 18
      roundRect(ctx, coverX, coverY, COVER, COVER, 28)
      ctx.fillStyle = '#222'
      ctx.fill()
      ctx.restore()

      ctx.save()
      roundRect(ctx, coverX, coverY, COVER, COVER, 28)
      ctx.clip()
      ctx.drawImage(img, coverX, coverY, COVER, COVER)
      ctx.restore()

      const titleY = coverY + COVER + 72
      ctx.fillStyle = selected.title
      ctx.font = '600 44px "DM Sans", system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(truncate(ctx, target.title, CARD_W - PAD * 2), CARD_W / 2, titleY)

      ctx.fillStyle = selected.artist
      ctx.font = '400 28px "DM Sans", system-ui, sans-serif'
      ctx.fillText(truncate(ctx, target.artist, CARD_W - PAD * 2), CARD_W / 2, titleY + 52)

      ctx.fillStyle = selected.brand
      ctx.font = '500 20px "DM Sans", system-ui, sans-serif'
      ctx.fillText('GlideTune', CARD_W / 2, CARD_H - 56)

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png', 0.95),
      )
      if (!blob) throw new Error('图片生成失败')

      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      const url = URL.createObjectURL(blob)
      objectUrlRef.current = url
      setPreviewUrl(url)
    } catch {
      setError('分享图生成失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setThemeIndex(0)
    themeIndexRef.current = 0
  }, [open, song.id])

  useEffect(() => {
    if (!open) return
    void buildCard(song, theme.id)
  }, [open, song, theme.id, buildCard])

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  const download = useCallback(() => {
    const url = previewUrlRef.current
    const current = songRef.current
    if (!url) return false
    const a = document.createElement('a')
    a.href = url
    a.download = `${current.title} - ${current.artist}.png`
    a.click()
    return true
  }, [])

  const cycleColor = useCallback((delta: 1 | -1) => {
    setThemeIndex((prev) => {
      const next = (prev + delta + CARD_THEMES.length) % CARD_THEMES.length
      themeIndexRef.current = next
      return next
    })
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      save: () => {
        if (!download()) return false
        onSaved?.()
        onClose()
        return true
      },
      cancel: () => {
        onClose()
      },
      cycleColor,
    }),
    [download, onClose, onSaved, cycleColor],
  )

  const onSaveClick = () => {
    if (!download()) return
    onSaved?.()
    onClose()
  }

  if (!open) return null

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/45 px-5 backdrop-blur-sm animate-fade-in">
      <div className="relative w-[min(92vw,360px)] overflow-hidden rounded-3xl bg-white shadow-2xl shadow-neutral-900/20">
        <div className="border-b border-neutral-100 px-5 py-3.5 text-center text-sm font-medium text-neutral-800">
          分享歌曲
        </div>

        <div className="bg-neutral-900 px-4 py-3 text-center">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/45">
            手势操作
          </p>
          <p className="mt-1 text-[13px] font-medium leading-snug text-white">
            上下滑换色 · 点赞保存 · 点踩取消
          </p>
        </div>

        <div className="px-5 py-5">
          <div className="mx-auto aspect-[3/4] w-full overflow-hidden rounded-2xl bg-neutral-100">
            {busy && (
              <div className="flex h-full items-center justify-center text-sm text-neutral-400">
                生成中…
              </div>
            )}
            {!busy && error && (
              <div className="flex h-full items-center justify-center px-4 text-center text-sm text-rose-500">
                {error}
              </div>
            )}
            {!busy && previewUrl && (
              <img
                src={previewUrl}
                alt={`${song.title} 分享图`}
                className="h-full w-full object-cover"
                draggable={false}
              />
            )}
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-neutral-600">卡片颜色</p>
              <p className="text-xs text-neutral-400">{theme.name}</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              {CARD_THEMES.map((item, index) => {
                const active = index === themeIndex
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={`选择${item.name}`}
                    title={item.name}
                    onClick={() => setThemeIndex(index)}
                    className={`h-8 w-8 rounded-full border-2 transition ${
                      active
                        ? 'scale-110 border-neutral-900 shadow-md'
                        : 'border-white shadow-sm ring-1 ring-neutral-200 hover:scale-105'
                    }`}
                    style={{ background: item.swatch }}
                  />
                )
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-0 border-t border-neutral-100">
          <button
            type="button"
            onClick={onClose}
            className="py-3.5 text-sm text-neutral-500 transition hover:bg-neutral-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSaveClick}
            disabled={!previewUrl || busy}
            className="border-l border-neutral-100 py-3.5 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50 disabled:opacity-40"
          >
            保存图片
          </button>
        </div>
      </div>
    </div>
  )
})

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('封面加载失败'))
    img.src = src
  })
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let result = text
  while (result.length > 0 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1)
  }
  return `${result}…`
}
