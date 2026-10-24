/**
 * 已保存搜索 Composable
 * 使用 localStorage 持久化用户的搜索筛选条件
 */

import { ref, computed } from 'vue'
import { SEARCH_TYPE_ICONS } from '@/icons/icon-names'

const STORAGE_KEY = 'vndb_saved_searches'

/**
 * 「最新汉化」默认卡片的开关
 *
 * 仪表盘上的卡片可以直接删掉，但删掉之后没有任何入口能把它加回来（它不是普通
 * 的自建搜索，用户没法照着条件重建）。所以这里给默认卡片单独存一个开关：
 * 设置页里可以关掉（卡片移除）再打开（卡片恢复），仪表盘上删除默认卡片时也会
 * 顺手把开关置为关闭，避免「删了又自己冒出来」。
 */
export const LATEST_CHINESE_ENABLED_KEY = 'vndb_latest_chinese_enabled'

/** 默认「最新汉化」卡片的固定 id */
export const DEFAULT_LATEST_CHINESE_ID = 'default_latest_chinese'

/**
 * 搜索类型 → 路由路径映射
 */
export const SEARCH_TYPE_MAP = {
  vn: { path: '/browse/vn', labelKey: 'saved_search.type_vn', icon: SEARCH_TYPE_ICONS.vn },
  releases: { path: '/browse/releases', labelKey: 'saved_search.type_releases', icon: SEARCH_TYPE_ICONS.releases },
  producers: { path: '/browse/producers', labelKey: 'saved_search.type_producers', icon: SEARCH_TYPE_ICONS.producers },
  staff: { path: '/browse/staff', labelKey: 'saved_search.type_staff', icon: SEARCH_TYPE_ICONS.staff },
  characters: { path: '/browse/characters', labelKey: 'saved_search.type_characters', icon: SEARCH_TYPE_ICONS.characters },
  tags: { path: '/browse/tags', labelKey: 'saved_search.type_tags', icon: SEARCH_TYPE_ICONS.tags },
  traits: { path: '/browse/traits', labelKey: 'saved_search.type_traits', icon: SEARCH_TYPE_ICONS.traits }
}

/**
 * 默认保存的搜索项
 *
 * 每次调用返回新对象，避免恢复默认时把同一个引用塞进列表两次
 */
function createDefaultSavedSearches() {
  return [
    {
      id: DEFAULT_LATEST_CHINESE_ID,
      nameKey: 'saved_search.latest_chinese',
      type: 'releases',
      filters: {
        selectedLang: 'zh-Hans',
        sortBy: 'released',
        reverse: true,
        selectedOfficial: 'no',
        selectedDateTo: 'today'
      },
      createdAt: new Date().toISOString()
    }
  ]
}

/**
 * 从 localStorage 读取保存的搜索列表
 */
function loadFromStorage() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (Array.isArray(data)) return data
  } catch {}
  return null
}

/**
 * 将搜索列表写入 localStorage
 */
function saveToStorage(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {}
}

/**
 * 生成唯一 ID
 */
function generateId() {
  return `search_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// 响应式状态（全局单例）
const savedSearches = ref(loadFromStorage() || createDefaultSavedSearches())

/**
 * 读取「最新汉化」卡片开关（默认开）
 */
function readLatestChineseEnabled() {
  try {
    return localStorage.getItem(LATEST_CHINESE_ENABLED_KEY) !== '0'
  } catch {
    return true
  }
}

/** 开关的响应式状态，供设置页双向绑定 */
export const latestChineseEnabled = ref(readLatestChineseEnabled())

/**
 * 开关打开但默认卡片不在列表里（旧版本删掉过、或列表被清空过），补回来
 */
if (readLatestChineseEnabled() && !savedSearches.value.some(item => item.id === DEFAULT_LATEST_CHINESE_ID)) {
  savedSearches.value = [...createDefaultSavedSearches(), ...savedSearches.value]
  saveToStorage(savedSearches.value)
}

export function getLatestChineseEnabled() {
  return readLatestChineseEnabled()
}

/**
 * 打开/关闭「最新汉化」默认卡片
 * @param {boolean} on - 打开时确保卡片存在，关闭时移除卡片
 */
export function setLatestChineseEnabled(on) {
  try {
    localStorage.setItem(LATEST_CHINESE_ENABLED_KEY, on ? '1' : '0')
  } catch {}
  latestChineseEnabled.value = !!on

  const exists = savedSearches.value.some(item => item.id === DEFAULT_LATEST_CHINESE_ID)
  if (on) {
    if (!exists) {
      savedSearches.value = [...createDefaultSavedSearches(), ...savedSearches.value]
      saveToStorage(savedSearches.value)
    }
  } else if (exists) {
    savedSearches.value = savedSearches.value.filter(item => item.id !== DEFAULT_LATEST_CHINESE_ID)
    saveToStorage(savedSearches.value)
  }
}

export function useSavedSearches() {
  /**
   * 获取所有已保存的搜索
   */
  const list = computed(() => savedSearches.value)

  /**
   * 获取指定类型的搜索列表
   * @param {string} type - 搜索类型 (vn, releases, producers, staff, characters, tags, traits)
   */
  function getByType(type) {
    return savedSearches.value.filter(item => item.type === type)
  }

  /**
   * 根据 ID 获取单个保存的搜索
   * @param {string} id
   */
  function getById(id) {
    return savedSearches.value.find(item => item.id === id) || null
  }

  /**
   * 添加保存的搜索
   * @param {{ name: string, type: string, filters: Object }} item
   * @returns {Object} 新创建的保存项
   */
  function add(item) {
    const newItem = {
      id: generateId(),
      name: item.name.slice(0, 8), // 最多8个字
      type: item.type,
      filters: { ...item.filters },
      createdAt: new Date().toISOString()
    }
    savedSearches.value.push(newItem)
    saveToStorage(savedSearches.value)
    return newItem
  }

  /**
   * 更新保存的搜索
   * @param {string} id
   * @param {{ name?: string, filters?: Object }} updates
   * @returns {Object|null} 更新后的项，未找到则返回 null
   */
  function update(id, updates) {
    const index = savedSearches.value.findIndex(item => item.id === id)
    if (index === -1) return null
    const item = savedSearches.value[index]
    if (updates.name !== undefined) item.name = updates.name.slice(0, 8)
    if (updates.filters !== undefined) item.filters = { ...updates.filters }
    saveToStorage(savedSearches.value)
    return item
  }

  /**
   * 删除保存的搜索
   * @param {string} id
   * @returns {boolean} 是否删除成功
   */
  function remove(id) {
    const index = savedSearches.value.findIndex(item => item.id === id)
    if (index === -1) return false
    savedSearches.value.splice(index, 1)
    saveToStorage(savedSearches.value)
    // 删的是默认「最新汉化」卡片：把设置里的开关同步关掉，
    // 否则下次启动会被「开关打开就补回卡片」的逻辑又加回来
    if (id === DEFAULT_LATEST_CHINESE_ID) {
      try {
        localStorage.setItem(LATEST_CHINESE_ENABLED_KEY, '0')
      } catch {}
      latestChineseEnabled.value = false
    }
    return true
  }

  /**
   * 检查名称是否已存在（排除指定 ID）
   * @param {string} name
   * @param {string} [excludeId] - 排除的 ID（用于编辑时重名检查）
   * @returns {boolean}
   */
  function isNameExists(name, excludeId = null) {
    return savedSearches.value.some(
      item => item.name === name && item.id !== excludeId
    )
  }

  /**
   * 重置为默认值
   */
  function resetToDefaults() {
    savedSearches.value = createDefaultSavedSearches()
    saveToStorage(savedSearches.value)
    try {
      localStorage.setItem(LATEST_CHINESE_ENABLED_KEY, '1')
    } catch {}
    latestChineseEnabled.value = true
  }

  return {
    list,
    getByType,
    getById,
    add,
    update,
    remove,
    isNameExists,
    resetToDefaults
  }
}
