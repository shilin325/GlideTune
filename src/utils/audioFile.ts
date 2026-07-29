const MP3_WAV_EXT = /\.(mp3|wav)$/i

/** 按扩展名推断 MIME */
export function mimeFromFileName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'wav') return 'audio/wav'
  return 'audio/mpeg'
}

/** 仅允许 MP3 / WAV */
export function isMp3OrWavFile(file: File): boolean {
  const t = file.type.toLowerCase()
  if (t === 'audio/mpeg' || t === 'audio/mp3') return true
  if (t === 'audio/wav' || t === 'audio/x-wav' || t === 'audio/wave') return true
  return MP3_WAV_EXT.test(file.name)
}

/** 保证 Blob 带有可用的 audio MIME */
export function toAudioBlob(file: Blob, fileName = ''): Blob {
  if (file.type === 'audio/mpeg' || file.type === 'audio/mp3') return file
  if (file.type === 'audio/wav' || file.type === 'audio/x-wav' || file.type === 'audio/wave') {
    return file
  }
  return new Blob([file], { type: mimeFromFileName(fileName) })
}
