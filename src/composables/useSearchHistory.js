/**
 * 搜索历史 Composable
 *
 * 记录「搜索」页（src/pages/Library.vue）全局搜索用过的关键词，
 * 用 localStorage 持久化，最近使用的排在最前面。
 *
 * 与 useSavedSearches 的区别：那个存的是「筛选条件」（带类型、可命名、可复用），
 * 这个只存关键词字符串，用于输入框下方的快捷回声。
 */

import { ref, computed } from 'vue'

const STORAGE_KEY = 'vndb_search_history'
/** 最多保留多少条，超出淘汰最旧的 */
const MAX_ITEMS = 20
/** 单条关键词最大长度，防止异常输入把存储撑爆 */
const MAX_LENGTH = 60

function loadFromStorage() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (Array.isArray(data)) {
      return data.filter((it) => typeof it === 'string' && it.trim()).slice(0, MAX_ITEMS)
    }
  } catch {
    // 存储损坏时按空历史处理，不阻塞页面
  }
  return []
}

function saveToStorage(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // 隐私模式 / 存储配额满时静默失败
  }
}

// 全局单例，多个组件共享同一份历史
const history = ref(loadFromStorage())

export function useSearchHistory() {
  const list = computed(() => history.value)

  const isEmpty = computed(() => history.value.length === 0)

  /**
   * 记录一次搜索。已存在的关键词会提到最前面而不是重复插入。
   * @param {string} keyword
   */
  function add(keyword) {
    const kw = String(keyword || '').trim().slice(0, MAX_LENGTH)
    if (!kw) return
    // 大小写不敏感去重，保留用户最新一次的写法
    const lower = kw.toLowerCase()
    const next = [kw, ...history.value.filter((it) => it.toLowerCase() !== lower)]
    history.value = next.slice(0, MAX_ITEMS)
    saveToStorage(history.value)
  }

  /**
   * 删除单条
   * @param {string} keyword
   */
  function remove(keyword) {
    const lower = String(keyword || '').toLowerCase()
    const next = history.value.filter((it) => it.toLowerCase() !== lower)
    if (next.length === history.value.length) return
    history.value = next
    saveToStorage(history.value)
  }

  /** 清空全部历史 */
  function clear() {
    history.value = []
    saveToStorage(history.value)
  }

  return { list, isEmpty, add, remove, clear }
}
