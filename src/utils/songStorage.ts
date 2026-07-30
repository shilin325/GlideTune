import defaultCoverUrl from '../assets/default-cover.svg'
import type { Song } from '../types'

const DEFAULT_COVER = defaultCoverUrl

const DB_NAME = 'glidetune'
const DB_VERSION = 1
const STORE = 'uploadedSongs'

/** IndexedDB 中持久化的上传曲目 */
export interface StoredUploadedSong {
  id: number
  title: string
  artist: string
  bpm?: number
  audio: Blob
  /** null 表示使用内置默认封面 */
  cover: Blob | null
  createdAt: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 打开失败'))
  })
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 请求失败'))
  })
}

function idbTxDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 事务失败'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB 事务中止'))
  })
}

/** 将内存中的上传曲写入 IndexedDB */
export async function saveUploadedSong(song: Song): Promise<void> {
  if (!song.localFile) {
    throw new Error('仅可持久化带 localFile 的上传歌曲')
  }

  let cover: Blob | null = null
  if (song.cover && song.cover !== DEFAULT_COVER && song.cover.startsWith('blob:')) {
    cover = await fetch(song.cover).then((r) => r.blob())
  }

  const record: StoredUploadedSong = {
    id: song.id,
    title: song.title,
    artist: song.artist,
    bpm: song.bpm,
    audio: song.localFile,
    cover,
    createdAt: Date.now(),
  }

  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(record)
    await idbTxDone(tx)
  } finally {
    db.close()
  }
}

/** 读取 IndexedDB 中的上传曲原始记录（尚未 createObjectURL） */
export async function listStoredUploadedSongs(): Promise<StoredUploadedSong[]> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readonly')
    const rows = await idbRequest<StoredUploadedSong[]>(tx.objectStore(STORE).getAll())
    await idbTxDone(tx)
    return rows.slice().sort((a, b) => a.createdAt - b.createdAt || a.id - b.id)
  } finally {
    db.close()
  }
}

export function hydrateStoredSong(row: StoredUploadedSong): Song {
  const audioUrl = URL.createObjectURL(row.audio)
  const cover = row.cover ? URL.createObjectURL(row.cover) : DEFAULT_COVER
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    bpm: row.bpm,
    url: audioUrl,
    cover,
    localFile: row.audio,
  }
}

export async function deleteUploadedSong(id: number): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    await idbTxDone(tx)
  } finally {
    db.close()
  }
}
