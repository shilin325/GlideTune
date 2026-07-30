import { DEFAULT_BPM } from '../types'
import {
  FALL_DURATION,
  GOOD_WINDOW,
  LANE_COUNT,
  PERFECT_WINDOW,
  type NoteJudgement,
  type RhythmNote,
  type RhythmScore,
} from './rhythmTypes'

/** 简单可复现伪随机（按歌曲 + 拍序号） */
function laneForBeat(songId: number, beatIndex: number): number | null {
  // 部分拍空拍，避免过密
  const n = (songId * 131 + beatIndex * 17) % 100
  if (n < 18) return null
  // 偶尔双押：由调用方再补一条
  return (songId * 7 + beatIndex * 3) % LANE_COUNT
}

function shouldDouble(songId: number, beatIndex: number): boolean {
  return (songId * 13 + beatIndex * 11) % 100 > 82
}

/**
 * 根据曲目与时长预生成音符表。
 * BPM 缺省用 DEFAULT_BPM，按 1/2 拍生成（八分音符节奏感）。
 */
export function generateChart(
  songId: number,
  duration: number,
  bpm: number = DEFAULT_BPM,
): RhythmNote[] {
  if (!Number.isFinite(duration) || duration <= 2) {
    // 时长未知时先铺一段可玩谱
    duration = 90
  }

  const beat = 60 / bpm
  const step = beat / 2
  const notes: RhythmNote[] = []
  let id = 1

  // 前 1.2s 留白让玩家准备
  for (let t = 1.2, i = 0; t < duration - 0.8; t += step, i += 1) {
    const lane = laneForBeat(songId, i)
    if (lane == null) continue
    notes.push({ id: id++, lane, hitTime: t, status: 'active' })

    if (shouldDouble(songId, i)) {
      const other = (lane + 1 + ((songId + i) % 2)) % LANE_COUNT
      notes.push({ id: id++, lane: other, hitTime: t, status: 'active' })
    }
  }

  return notes
}

export function emptyScore(): RhythmScore {
  return { score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0 }
}

export function judgeTiming(delta: number): NoteJudgement | null {
  const ad = Math.abs(delta)
  if (ad <= PERFECT_WINDOW) return 'perfect'
  if (ad <= GOOD_WINDOW) return 'good'
  return null
}

export function applyHit(score: RhythmScore, judgement: NoteJudgement): RhythmScore {
  const next = { ...score }
  if (judgement === 'miss') {
    next.miss += 1
    next.combo = 0
    return next
  }
  next.combo += 1
  next.maxCombo = Math.max(next.maxCombo, next.combo)
  if (judgement === 'perfect') {
    next.perfect += 1
    next.score += 300 + Math.min(next.combo, 50) * 4
  } else {
    next.good += 1
    next.score += 120 + Math.min(next.combo, 50) * 2
  }
  return next
}

/** 音符在画面中的纵向进度 0(顶)~1(判定线)，超出 >1 为已过线 */
export function noteProgress(currentTime: number, hitTime: number): number {
  const start = hitTime - FALL_DURATION
  return (currentTime - start) / FALL_DURATION
}

export function isNoteVisible(currentTime: number, hitTime: number): boolean {
  const p = noteProgress(currentTime, hitTime)
  return p > -0.05 && p < 1.35
}
