export type NoteJudgement = 'perfect' | 'good' | 'miss'

export interface RhythmNote {
  id: number
  lane: number
  /** 音频时间轴上的击打时刻（秒） */
  hitTime: number
  status: 'active' | 'hit' | 'missed'
  judgement?: NoteJudgement
}

export interface RhythmScore {
  score: number
  combo: number
  maxCombo: number
  perfect: number
  good: number
  miss: number
}

export const LANE_COUNT = 4
/** 音符从顶部落到判定线所需时间 */
export const FALL_DURATION = 1.55
/** Perfect / Good 判定窗口（秒） */
export const PERFECT_WINDOW = 0.1
export const GOOD_WINDOW = 0.22
