import type { Song } from '../types'

/**
 * 静态 Mock 歌曲数据（至少 5 首）
 * 音频使用公开可访问的示例 MP3；封面使用 Unsplash 图片
 * bpm 为示意节拍，用于封面脉冲与节奏游戏
 */
export const SONGS: Song[] = [
  {
    id: 1,
    title: 'Midnight Drive',
    artist: 'Neon Horizon',
    cover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&h=600&fit=crop',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    bpm: 124,
  },
  {
    id: 2,
    title: 'City Lights',
    artist: 'Luna Echo',
    cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&h=600&fit=crop',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    bpm: 110,
  },
  {
    id: 3,
    title: 'Ocean Breath',
    artist: 'Soft Tide',
    cover: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=600&h=600&fit=crop',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    bpm: 88,
  },
  {
    id: 4,
    title: 'Starfall',
    artist: 'Aurora Lane',
    cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&h=600&fit=crop',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    bpm: 132,
  },
  {
    id: 5,
    title: 'Velvet Rain',
    artist: 'Glass Garden',
    cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&h=600&fit=crop',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
    bpm: 96,
  },
  {
    id: 6,
    title: 'Afterglow',
    artist: 'Polar Bloom',
    cover: 'https://images.unsplash.com/photo-1487180144351-b8472da7d491?w=600&h=600&fit=crop',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
    bpm: 118,
  },
]
