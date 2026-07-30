import { DEFAULT_BPM } from '../types'

/** 检测区间：跳过过慢/过快误检 */
const MIN_BPM = 70
const MAX_BPM = 180
/** 跳过前奏静音，取一段中段分析 */
const ANALYZE_OFFSET_SEC = 8
const ANALYZE_DURATION_SEC = 32

const bpmCache = new Map<string, number>()

function getAudioContextCtor(): typeof AudioContext {
  const w = window as Window & { webkitAudioContext?: typeof AudioContext }
  return window.AudioContext || w.webkitAudioContext!
}

/** 将 BPM 折入常用听感区间（处理半拍/倍速误检） */
function normalizeBpm(raw: number): number {
  let bpm = raw
  while (bpm < MIN_BPM) bpm *= 2
  while (bpm > MAX_BPM) bpm /= 2
  return Math.round(Math.min(MAX_BPM, Math.max(MIN_BPM, bpm)))
}

/**
 * 低通滤波后取相对峰值（Joe Sullivan / web-audio-beat-detector 思路）
 */
function collectPeaks(data: Float32Array, sampleRate: number): number[] {
  const peaks: number[] = []
  // ~0.25s 一窗，取窗内最大绝对值样本索引
  const samplesPerWindow = Math.max(1, Math.floor(sampleRate * 0.25))
  let i = 0
  while (i + samplesPerWindow < data.length) {
    let max = 0
    let maxIndex = i
    for (let j = 0; j < samplesPerWindow; j += 1) {
      const v = Math.abs(data[i + j])
      if (v > max) {
        max = v
        maxIndex = i + j
      }
    }
    // 相对阈值：压掉噪声窗
    if (max > 0.01) peaks.push(maxIndex)
    i += samplesPerWindow
  }
  return peaks
}

/** 峰值间隔 → 候选 tempo 直方图，取众数 */
function tempoFromPeaks(peaks: number[], sampleRate: number): number | null {
  if (peaks.length < 4) return null

  const counts = new Map<number, number>()
  const maxInterval = Math.floor((60 / MIN_BPM) * sampleRate)
  const minInterval = Math.floor((60 / MAX_BPM) * sampleRate)

  for (let i = 0; i < peaks.length; i += 1) {
    for (let j = i + 1; j < peaks.length && j < i + 12; j += 1) {
      const interval = peaks[j] - peaks[i]
      if (interval < minInterval || interval > maxInterval) continue
      // 量化到 0.5 BPM 精度附近的整数 BPM
      const bpm = Math.round((60 * sampleRate) / interval)
      if (bpm < MIN_BPM || bpm > MAX_BPM) continue
      counts.set(bpm, (counts.get(bpm) ?? 0) + 1)
      // 邻域加分，平滑量化误差
      counts.set(bpm - 1, (counts.get(bpm - 1) ?? 0) + 0.5)
      counts.set(bpm + 1, (counts.get(bpm + 1) ?? 0) + 0.5)
    }
  }

  let bestBpm = 0
  let bestScore = 0
  for (const [bpm, score] of counts) {
    if (bpm < MIN_BPM || bpm > MAX_BPM) continue
    if (score > bestScore) {
      bestScore = score
      bestBpm = bpm
    }
  }
  return bestBpm > 0 ? bestBpm : null
}

/**
 * 从 AudioBuffer 检测 BPM。
 * 仅分析片段以控制耗时；失败时抛错由调用方回退默认值。
 */
export async function detectBpmFromAudioBuffer(buffer: AudioBuffer): Promise<number> {
  const sampleRate = buffer.sampleRate
  const offset = Math.min(ANALYZE_OFFSET_SEC, Math.max(0, buffer.duration * 0.15))
  const duration = Math.min(
    ANALYZE_DURATION_SEC,
    Math.max(10, buffer.duration - offset),
  )
  const length = Math.max(1, Math.floor(duration * sampleRate))

  const offline = new OfflineAudioContext(1, length, sampleRate)
  const source = offline.createBufferSource()
  source.buffer = buffer

  const filter = offline.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 150
  filter.Q.value = 1

  source.connect(filter)
  filter.connect(offline.destination)
  source.start(0, offset, duration)

  const rendered = await offline.startRendering()
  const data = rendered.getChannelData(0)
  const peaks = collectPeaks(data, sampleRate)
  const tempo = tempoFromPeaks(peaks, sampleRate)
  if (tempo == null) throw new Error('无法从音频中检测 BPM')
  return normalizeBpm(tempo)
}

export async function detectBpmFromArrayBuffer(arrayBuffer: ArrayBuffer): Promise<number> {
  const AC = getAudioContextCtor()
  const ac = new AC()
  try {
    const buffer = await ac.decodeAudioData(arrayBuffer.slice(0))
    return await detectBpmFromAudioBuffer(buffer)
  } finally {
    void ac.close().catch(() => undefined)
  }
}

/**
 * 按 URL / Blob 检测 BPM，带内存缓存。
 * @param cacheKey 稳定键（如 song.id 或 url）
 */
export async function detectBpmForSource(
  cacheKey: string,
  source: { url: string; localFile?: Blob },
  signal?: AbortSignal,
): Promise<number> {
  const cached = bpmCache.get(cacheKey)
  if (cached != null) return cached

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  let arrayBuffer: ArrayBuffer
  if (source.localFile) {
    arrayBuffer = await source.localFile.arrayBuffer()
  } else {
    const res = await fetch(source.url, { signal })
    if (!res.ok) throw new Error(`音频加载失败 (${res.status})`)
    arrayBuffer = await res.arrayBuffer()
  }

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  const bpm = await detectBpmFromArrayBuffer(arrayBuffer)
  bpmCache.set(cacheKey, bpm)
  return bpm
}

export function getCachedBpm(cacheKey: string): number | undefined {
  return bpmCache.get(cacheKey)
}

export function fallbackBpm(hint?: number): number {
  if (Number.isFinite(hint) && (hint as number) > 0) {
    return normalizeBpm(hint as number)
  }
  return DEFAULT_BPM
}
