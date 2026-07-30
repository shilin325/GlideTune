import type { Song } from '../types'

/**
 * public 下本地资源路径。
 * 用 encodeURI（而非 encodeURIComponent）：逗号等字符需保留字面量，
 * 否则 Vite 静态服务会对 %2C 返回 404。
 */
const asset = (dir: 'audio' | 'cover', filename: string) =>
  encodeURI(`/${dir}/${filename}`)

/**
 * 内置曲目：音频 public/audio/，封面 public/cover/。
 * BPM 由播放时 Web Audio 检测，不再写死。
 */
export const SONGS: Song[] = [
  {
    id: 1,
    title: '浪漫主义',
    artist: '袁娅维,Kehlani',
    cover: asset('cover', '袁娅维,Kehlani - 浪漫主义.webp'),
    url: asset('audio', '袁娅维,Kehlani - 浪漫主义.mp3'),
  },
  {
    id: 2,
    title: 'New Dance',
    artist: 'XG',
    cover: asset('cover', 'XG - NEW DANCE.jpg'),
    url: asset('audio', 'XG - NEW DANCE.mp3'),
  },
  {
    id: 3,
    title: '一定会',
    artist: '林俊杰',
    cover: asset('cover', '林俊杰 - 一定会.webp'),
    url: asset('audio', '林俊杰 - 一定会.mp3'),
  },
  {
    id: 4,
    title: '九月底',
    artist: '余佳运',
    cover: asset('cover', '余佳运 - 九月底 .jpg'),
    url: asset('audio', '余佳运 - 九月底 .mp3'),
  },
  {
    id: 5,
    title: '青火',
    artist: '黄子弘凡',
    cover: asset('cover', '黄子弘凡-青火.webp'),
    url: asset('audio', '黄子弘凡-青火.mp3'),
  },
  {
    id: 6,
    title: '人间萤火',
    artist: '夏日入侵企画',
    cover: asset('cover', '人间萤火 - 夏日入侵企画.png'),
    url: asset('audio', '夏日入侵企画 - 人间萤火.mp3'),
  },
]
