const LIKED_KEY = 'glidetune:likedIds'

/** 从 localStorage 读取收藏 id 列表 */
export function loadLikedIds(): Set<number> {
  try {
    const raw = localStorage.getItem(LIKED_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)))
  } catch {
    return new Set()
  }
}

/** 将收藏 id 写入 localStorage */
export function saveLikedIds(ids: Set<number>): void {
  try {
    localStorage.setItem(LIKED_KEY, JSON.stringify([...ids]))
  } catch (err) {
    console.warn('收藏列表保存失败', err)
  }
}
