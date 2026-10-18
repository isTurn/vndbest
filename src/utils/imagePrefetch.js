/**
 * 图片预热队列（提升「看起来的」加载速度）
 *
 * 背景：
 * - VNDB 图片站 t.vndb.org 从国内访问带宽只有 ~90-130KB/s，一张 cv.t 缩略图
 *   就有 30-58KB，所以「带宽」是硬瓶颈，无法靠并行变快。
 * - 真正能省掉的是**延迟**：`ion-img` 内部的 IntersectionObserver 没有
 *   rootMargin（见 @ionic/core/components/ion-img.js），图片必须真正进入
 *   视口才开始请求，用户滑到哪就等哪，一屏一屏地干等。
 *
 * 做法：
 * 数据一到就把「当前可见 + 下一屏」的缩略图排进队列，用低并发（默认 3）
 * 依次 `new Image()` 预热进 WebView 的 HTTP 缓存（VNDB 返回
 * `Cache-Control: max-age=25920000`，300 天，缓存命中后 ion-img 立即出图）。
 *
 * 为什么并发是 6：单张串行下载时 t.vndb.org 只跑到 ~38KB/s，3 并发约
 * 130KB/s，6 并发能到 ~245KB/s（实测峰值），再多（12 并发）反而掉速。
 * 所以 6 是「总吞吐最高」和「首图不被饿死」之间最划算的点。
 */

/** 同时在下载的图片数量（实测 6 并发吞吐最高） */
const MAX_CONCURRENT = 6
/** 队列上限，避免长列表一次性塞几千张图 */
const MAX_QUEUE = 120
/** 已经预热过的 URL（避免重复下载） */
const warmed = new Set()
/** 待下载队列 */
const queue = []
/** 正在下载的数量 */
let running = 0

function pump() {
  while (running < MAX_CONCURRENT && queue.length) {
    const url = queue.shift()
    if (!url || warmed.has(url)) continue
    warmed.add(url)
    running++
    const img = new Image()
    const done = () => {
      running--
      img.onload = null
      img.onerror = null
      pump()
    }
    img.onload = done
    img.onerror = done
    // 交给 WebView 的 HTTP 缓存；crossOrigin 不设置，避免触发 CORS 预检
    img.decoding = 'async'
    img.src = url
  }
}

/**
 * 把一批图片 URL 排进预热队列。
 * 已经在队列/已预热过的会被跳过，所以重复调用是安全的。
 * @param {Array<string|null|undefined>} urls
 * @param {{priority?: boolean}} [opts] priority=true 时插到队首（首屏图片）
 */
export function prefetchImages(urls, opts = {}) {
  if (!urls || !urls.length) return
  const batch = []
  for (const raw of urls) {
    if (!raw || typeof raw !== 'string') continue
    if (warmed.has(raw)) continue
    if (queue.includes(raw)) continue
    batch.push(raw)
  }
  if (!batch.length) return
  if (opts.priority) queue.unshift(...batch)
  else queue.push(...batch)
  // 队列超长时丢掉尾部（通常是用户暂时滑不到的长列表）
  if (queue.length > MAX_QUEUE) queue.length = MAX_QUEUE
  pump()
}

/**
 * 从列表数据里提取图片 URL 并预热。
 * @param {Array} items
 * @param {(item:any)=>string|null|undefined} pick 取图函数
 * @param {number} [limit] 最多预热多少张
 * @param {{priority?: boolean}} [opts]
 */
export function prefetchFromItems(items, pick, limit = 24, opts = {}) {
  if (!Array.isArray(items) || !items.length) return
  const urls = []
  for (let i = 0; i < items.length && urls.length < limit; i++) {
    const url = pick(items[i])
    if (url) urls.push(url)
  }
  prefetchImages(urls, opts)
}

/** 清空状态（调试/内存吃紧时用，正常流程不需要） */
export function resetPrefetch() {
  queue.length = 0
  warmed.clear()
}
