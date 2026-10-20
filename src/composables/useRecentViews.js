/**
 * 最近浏览 Composable
 *
 * 记录用户最近打开过的详情页（作品 / 角色 / 版本 / 会社 / 职员），
 * localStorage 持久化，最近的排最前。纯本地功能，不发任何网络请求。
 *
 * 与 useFavorites 的区别：收藏是用户主动标记的，会一直保留；
 * 这里是自动记录的足迹，超过上限就淘汰最旧的。
 */

import { ref, computed } from 'vue'

const STORAGE_KEY = 'vndb_recent_views'
/** 最多保留多少条足迹 */
const MAX_ITEMS = 30

/** 支持的详情页类型，与 SEO 无关，仅用于拼路由 */
export const RECENT_TYPES = ['vn', 'character', 'release', 'producer', 'staff']

/** type → 详情页路径前缀 */
const ROUTE_PREFIX = {
  vn: '/vn',
  character: '/character',
  release: '/release',
  producer: '/producer',
  staff: '/staff'
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const data = JSON.parse(raw)
    if (Array.isArray(data)) {
      return data
        .filter((it) => it && it.id && RECENT_TYPES.includes(it.type))
        .slice(0, MAX_ITEMS)
    }
  } catch {
    // 存储损坏按空足迹处理，不阻塞页面
  }
  return []
}

function saveToStorage(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // 隐私模式 / 配额满时静默失败
  }
}

// 全局单例，多个组件共享同一份足迹
const recent = ref(loadFromStorage())

export function useRecentViews() {
  const list = computed(() => recent.value)

  const isEmpty = computed(() => recent.value.length === 0)

  /**
   * 记录一次浏览。已存在的条目会被提到最前并刷新标题/封面
   * （数据可能因为后来补充了中文标题而变化）。
   *
   * @param {{ id: string, type: string, title?: string, subtitle?: string, image?: string }} item
   */
  function record(item) {
    if (!item || !item.id || !RECENT_TYPES.includes(item.type)) return
    const entry = {
      id: item.id,
      type: item.type,
      title: item.title || '',
      subtitle: item.subtitle || '',
      image: item.image || '',
      viewedAt: Date.now()
    }
    const next = [entry, ...recent.value.filter((it) => !(it.id === entry.id && it.type === entry.type))]
    recent.value = next.slice(0, MAX_ITEMS)
    saveToStorage(recent.value)
  }

  /**
   * 删除单条足迹
   * @param {string} type
   * @param {string} id
   */
  function remove(type, id) {
    const next = recent.value.filter((it) => !(it.type === type && it.id === id))
    if (next.length === recent.value.length) return
    recent.value = next
    saveToStorage(recent.value)
  }

  /** 清空全部足迹 */
  function clear() {
    recent.value = []
    saveToStorage(recent.value)
  }

  /**
   * 足迹对应的详情页路径
   * @param {{ type: string, id: string }} item
   * @returns {string}
   */
  function toPath(item) {
    const prefix = ROUTE_PREFIX[item?.type]
    return prefix ? `${prefix}/${item.id}` : '/'
  }

  return { list, isEmpty, record, remove, clear, toPath }
}
