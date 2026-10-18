/**
 * 用户收藏状态（ulist labels）批量查询与缓存
 *
 * 背景：
 * - 会社页「开发作品」、游戏页「相关作品」这些列表里的条目来自 /vn 查询，
 *   响应里**没有**用户自己的收藏标签（labels 只在 /ulist 里有）。
 * - /ulist 支持 `['or', ['id','=',...], ...]` 组合过滤，一次可以带上几十个 id，
 *   所以按列表批量查一次即可，不必逐条请求。
 * - 该接口是私人数据，`api/vndb.js` 的 getCachePolicy 对 /ulist 明确禁用了缓存，
 *   这里自己用 localStorage 做一份短 TTL 缓存，避免每次进页面都重新请求。
 *
 * 用法：
 *   const { getStatusLabels, preloadStatuses, invalidateStatus } = useUlistStatus()
 *   preloadStatuses(items.map(i => i.id))     // 列表数据到位后调用
 *   getStatusLabels(item.id)                  // 渲染时同步读取
 */
import { reactive } from 'vue'
import { getUserList } from '@/api/vndb'

const CACHE_KEY = 'vndb_ulist_status_cache'
/** 缓存有效期：10 分钟。收藏状态变动不频繁，够用且能减少请求 */
const TTL = 10 * 60 * 1000
/** 单次 /ulist 请求最多带多少个 id（实测 120 个 or 分支仍可正常返回） */
const BATCH_SIZE = 60

/** vnId -> { labels: [{id,label}], ts } */
const statusMap = reactive({})

/** 正在请求中的 id 集合，防止并发重复请求 */
const inflight = new Set()
/** 已排队等待合并的 id（同一轮事件循环内的多次 preload 合并成一批） */
let queue = new Set()
let flushTimer = null

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return
    const data = JSON.parse(raw)
    const now = Date.now()
    for (const [id, entry] of Object.entries(data || {})) {
      if (entry && now - entry.ts < TTL) {
        statusMap[id] = entry
      }
    }
  } catch (e) {
    console.warn('[ulist-status] 读取缓存失败', e)
  }
}

function writeCache() {
  try {
    const now = Date.now()
    const data = {}
    for (const [id, entry] of Object.entries(statusMap)) {
      if (entry && now - entry.ts < TTL) data[id] = entry
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch (e) {
    console.warn('[ulist-status] 写入缓存失败', e)
  }
}

readCache()

function isLoggedIn() {
  return Boolean((localStorage.getItem('vndb_api_token') || '').trim())
}

/** 把 id 规范化成 vNNN 形式 */
function normalizeVnId(id) {
  const s = String(id || '').trim().toLowerCase()
  if (!s) return ''
  return s.startsWith('v') ? s : `v${s}`
}

function buildOrFilter(ids) {
  const parts = ids.map((id) => ['id', '=', id])
  return parts.length === 1 ? parts[0] : ['or', ...parts]
}

async function fetchBatch(ids) {
  const res = await getUserList({
    fields: 'id, vote, labels{id,label}',
    filters: buildOrFilter(ids),
    results: ids.length
  })
  const now = Date.now()
  const results = res?.results || []
  const found = new Map()
  for (const row of results) {
    const vid = normalizeVnId(row.id)
    if (!vid) continue
    found.set(vid, {
      labels: (row.labels || []).map((l) => ({ id: Number(l.id), label: l.label || '' })),
      vote: row.vote ?? null,
      ts: now
    })
  }
  for (const id of ids) {
    // 接口不返回说明该作不在用户收藏列表里，也缓存成空，避免反复查
    statusMap[id] = found.get(id) || { labels: [], vote: null, ts: now }
    inflight.delete(id)
  }
  writeCache()
}

async function flushQueue() {
  flushTimer = null
  const ids = Array.from(queue)
  queue = new Set()
  if (!ids.length) return

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE)
    chunk.forEach((id) => inflight.add(id))
    try {
      await fetchBatch(chunk)
    } catch (e) {
      console.warn('[ulist-status] 获取收藏状态失败', e)
      chunk.forEach((id) => inflight.delete(id))
    }
  }
}

/** 把 id 放进待请求队列，并在下一轮事件循环合并发起 */
function enqueueId(id) {
  if (!id || inflight.has(id)) return
  queue.add(id)
  if (!flushTimer) flushTimer = setTimeout(flushQueue, 30)
}

export function useUlistStatus() {
  /**
   * 批量预取（自动跳过已缓存/已请求中的 id）
   * @param {Array<string|number>} ids
   */
  function preloadStatuses(ids) {
    if (!isLoggedIn()) return
    const now = Date.now()
    let queued = false
    for (const raw of ids || []) {
      const id = normalizeVnId(raw)
      if (!id || inflight.has(id)) continue
      const cached = statusMap[id]
      if (cached && now - cached.ts < TTL) continue
      queue.add(id)
      queued = true
    }
    if (queued && !flushTimer) {
      flushTimer = setTimeout(flushQueue, 30)
    }
  }

  /** 同步读取某作品的收藏标签（未加载到则返回空数组） */
  function getStatusLabels(id) {
    const entry = statusMap[normalizeVnId(id)]
    return entry?.labels || []
  }

  /** 同步读取自己给某作品的评分（1-10），未评分或未加载到返回 null */
  function getStatusVote(id) {
    const entry = statusMap[normalizeVnId(id)]
    const vote = entry?.vote
    return vote === null || vote === undefined ? null : Number(vote)
  }

  /** 让某作品的缓存失效并立即重新拉取（收藏状态变更后调用） */
  function invalidateStatus(id) {
    const vid = normalizeVnId(id)
    if (!vid) return
    delete statusMap[vid]
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (raw) {
        const data = JSON.parse(raw) || {}
        delete data[vid]
        localStorage.setItem(CACHE_KEY, JSON.stringify(data))
      }
    } catch (_) {
      /* ignore */
    }
    // 立刻重新入队：statusMap 已无该 id，下一次 flush 会重新请求
    enqueueId(vid)
  }

  /** 清空全部缓存（退出登录等场景） */
  function clearStatusCache() {
    for (const key of Object.keys(statusMap)) delete statusMap[key]
    try {
      localStorage.removeItem(CACHE_KEY)
    } catch (_) {
      /* ignore */
    }
  }

  /**
   * 直接写入某作品的收藏标签（已知最新状态时用，避免再发一次请求）
   * 典型场景：详情页 loadCollectionStatus 已经拿到了 labels 和评分。
   * @param {string} id
   * @param {Array} labels
   * @param {number|null} [vote] 不传则保留原值
   */
  function setStatusLabels(id, labels, vote) {
    const vid = normalizeVnId(id)
    if (!vid) return
    statusMap[vid] = {
      labels: (labels || []).map((l) => ({ id: Number(l.id), label: l.label || '' })),
      vote: vote === undefined ? (statusMap[vid]?.vote ?? null) : (vote === null ? null : Number(vote)),
      ts: Date.now()
    }
    writeCache()
  }

  return { preloadStatuses, getStatusLabels, getStatusVote, invalidateStatus, clearStatusCache, setStatusLabels }
}
