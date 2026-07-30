import type { Song } from '../types'

/**
 * public/audio 下的本地文件路径。
 * 用 encodeURI（而非 encodeURIComponent）：逗号等字符需保留字面量，
 * 否则 Vite 静态服务会对 %2C 返回 404（第一首「袁娅维,Kehlani」即踩坑）。
 */
const audio = (filename: string) => encodeURI(`/audio/${filename}`)

/**
 * 内置曲目：音频来自 public/audio/，封面仍用远程图。
 * BPM 由播放时 Web Audio 检测，不再写死。
 */
export const SONGS: Song[] = [
  {
    id: 1,
    title: '浪漫主义',
    artist: '袁娅维,Kehlani',
    cover: 'https://y.gtimg.cn/music/photo_new/T002R300x300M0000002Thrx11uS3W.jpg',
    url: audio('袁娅维,Kehlani - 浪漫主义.mp3'),
  },
  {
    id: 2,
    title: 'New Dance',
    artist: 'XG',
    cover: 'https://p2.music.126.net/1JgzOzqlC9fuAwKHAf5uLw==/109951168859895871.jpg',
    url: audio('XG - NEW DANCE.mp3'),
  },
  {
    id: 3,
    title: '一定会',
    artist: '林俊杰',
    cover: 'https://y.qq.com/music/photo_new/T002R300x300M000004Xe3fb1dq6UD_3.jpg',
    url: audio('林俊杰 - 一定会.mp3'),
  },
  {
    id: 4,
    title: '九月底',
    artist: '余佳运',
    cover: 'https://p1.music.126.net/vN8ib5afmH3oUp8TYl5-ag==/109951163676876789.jpg',
    url: audio('余佳运 - 九月底 .mp3'),
  },
  {
    id: 5,
    title: '青火',
    artist: '黄子弘凡',
    cover: 'https://y.gtimg.cn/music/photo_new/T002R150x150M0000002rO3n2kme97_1.jpg',
    url: audio('黄子弘凡-青火.mp3'),
  },
  {
    id: 6,
    title: '人间萤火',
    artist: '夏日入侵企画',
    cover: 'https://p1.music.126.net/hydLLpyJNVkWb-q_m75ywg==/109951167523201974.jpg',
    url: audio('夏日入侵企画 - 人间萤火.mp3'),
  },
]
