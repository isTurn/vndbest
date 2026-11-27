/**
 * SearchBox（searchbox.club）以图搜客户端
 *
 * 为什么单独一个文件：
 * - AnimeTrace 那条线（src/utils/imageSearch.js）是「图片 → 作品名」，我们再用 VNDB 接口反查；
 * - SearchBox 的 /ai/chat 是一个带工具的对话接口（identify_image / search_vndb / web_search ...），
 *   它一步就能返回「识别到的角色」和「VNDB 作品资料」两个结构化区块，信息量更大，
 *   所以单独封装、由页面提供来源切换。
 *
 * 接口契约（实测）：
 *   POST https://api.searchbox.club/ai/chat
 *   body: { messages: [{role:'user', content:'...'}], conversationId: '<uuid>', images: ['data:image/jpeg;base64,...'] }
 *   Header 只需 Content-Type: application/json（服务端已开 CORS：Access-Control-Allow-Origin: *）
 *   响应是 NDJSON（每行一个 JSON），事件类型：start / status / thinking / agent / block / delta / done / error
 *
 * 注意两件事：
 * 1. 服务端有 Cloudflare，裸请求（无 UA）会被 403 error code: 1010 拦；WebView 的 fetch 自带 UA，不用管，
 *    但如果以后要在 node 里调试，记得带浏览器 UA。
 * 2. 限频很严：imagePer10Min=3、imagePerDay=20、imagesPerRequest=2。页面上要提示用户别乱点。
 */

import { Capacitor } from '@capacitor/core'
import { ImageSearchError } from './imageSearch'

const API_URL = 'https://api.searchbox.club/ai/chat'

/** 大模型 + 多个工具调用，比普通图搜慢很多，给足 2 分钟 */
const REQUEST_TIMEOUT = 120000

/** 压缩后的最长边（px）；SearchBox 的 imageBase64Chars 上限是 1,500,000 字符 */
const MAX_EDGE = 1024
const JPEG_QUALITY = 0.85

/** 一次请求最多 2 张图，我们只传 1 张识别主体，留出余量 */
const MAX_IMAGES = 1

const PROMPT = [
  '这张图片出自哪部作品（游戏 / 动画 / 漫画）？',
  '请先识别图中角色，再给出作品的 VNDB 资料和名称。',
  '如果识别不出来，就直接说没识别到，不要编造。'
].join('')

/**
 * 把用户选的图片压成 dataURL（接口要 base64 data URL，不是 multipart）
 * @param {File|Blob} file
 * @returns {Promise<{ dataUrl: string, previewUrl: string, width: number, height: number }>}
 */
export async function prepareImageForSearchBox(file) {
  if (!file) {
    throw new ImageSearchError('no file', { i18nKey: 'image_search.error_not_image' })
  }
  if (file.type && !file.type.startsWith('image/')) {
    throw new ImageSearchError('not an image', { i18nKey: 'image_search.error_not_image' })
  }

  const img = await loadImageElement(file)
  const naturalWidth = img.naturalWidth || img.width
  const naturalHeight = img.naturalHeight || img.height
  const scale = Math.min(1, MAX_EDGE / Math.max(naturalWidth, naturalHeight))
  const width = Math.max(1, Math.round(naturalWidth * scale))
  const height = Math.max(1, Math.round(naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  // JPEG 没有透明通道，先铺白底，避免 PNG 的透明区域变成黑块
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)

  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  if (!blob) {
    throw new ImageSearchError('encode failed', { i18nKey: 'image_search.error_format' })
  }
  return { dataUrl, previewUrl: URL.createObjectURL(blob), width, height }
}

/**
 * 上传图片并识别（NDJSON 流式）
 * @param {string} dataUrl   prepareImageForSearchBox 产出的 data:image/jpeg;base64,...
 * @param {{ onStatus?: (text: string) => void }} [options]  onStatus：服务端推来的进度文案
 * @returns {Promise<{ works: Array, characters: Array, answer: string }>}
 */
export async function searchByImageOnSearchBox(dataUrl, options = {}) {
  const body = {
    messages: [{ role: 'user', content: PROMPT }],
    conversationId: createConversationId(),
    images: [dataUrl].slice(0, MAX_IMAGES)
  }

  const collector = createCollector(options)

  try {
    await postWithFetch(body, collector)
  } catch (err) {
    // 和 AnimeTrace 同款兜底：WebView 的 fetch 可能被拦/超时，原生 HTTP 再试一次。
    // 原生没有流式，拿到的是一整段 NDJSON 文本，用同一个收集器消费。
    const canRetry = isNetworkLayerError(err) || err?.i18nKey === 'image_search.error_timeout'
    if (!canRetry || !Capacitor.isNativePlatform()) throw err
    const raw = await postWithCapacitorHttp(body)
    forEachLine(String(raw || ''), (line) => collector.push(line))
  }

  return collector.result()
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new ImageSearchError('decode failed', { i18nKey: 'image_search.error_format' }))
    }
    img.src = url
  })
}

function createConversationId() {
  // crypto.randomUUID 在 WebView 里都有；没有就退回时间戳随机串
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  } catch {
    /* ignore */
  }
  return `vndbest-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

async function postWithFetch(body, collector) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  let res
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    })
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new ImageSearchError('timeout', { i18nKey: 'image_search.error_timeout' })
    }
    throw err
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const text = await readTextSafe(res)
    throw new ImageSearchError(`HTTP ${res.status} ${text.slice(0, 200)}`, {
      i18nKey: res.status === 429 ? 'image_search.searchbox_error_limit' : 'image_search.error_generic'
    })
  }

  // 优先流式读取：状态提示能实时显示，体验比一直转圈好
  if (res.body && typeof res.body.getReader === 'function') {
    await readStream(res.body, collector)
    return
  }
  const text = await readTextSafe(res)
  forEachLine(text, (line) => collector.push(line))
}

async function postWithCapacitorHttp(body) {
  const { CapacitorHttp } = await import('@capacitor/core')
  const res = await CapacitorHttp.request({
    url: API_URL,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
    connectTimeout: REQUEST_TIMEOUT,
    readTimeout: REQUEST_TIMEOUT
  })
  const data = res?.data
  if (typeof data === 'string') return data
  return data ? JSON.stringify(data) : ''
}

async function readStream(stream, collector) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let index = buffer.indexOf('\n')
      while (index >= 0) {
        const line = buffer.slice(0, index).trim()
        buffer = buffer.slice(index + 1)
        if (line) collector.push(line)
        index = buffer.indexOf('\n')
      }
    }
    buffer += decoder.decode()
    forEachLine(buffer, (line) => collector.push(line))
  } finally {
    try {
      reader.releaseLock()
    } catch {
      /* ignore */
    }
  }
}

async function readTextSafe(res) {
  try {
    return await res.text()
  } catch {
    return ''
  }
}

function forEachLine(text, fn) {
  String(text || '')
    .split('\n')
    .forEach((line) => {
      const trimmed = line.trim()
      if (trimmed) fn(trimmed)
    })
}

/**
 * 收集器：把 NDJSON 事件累计成 { works, characters, answer }
 * - works：结构化命中的 VNDB 作品（来自 block 里 url 形如 https://vndb.org/v17 的条目）
 * - characters：其余识别出的角色/相似图条目
 * - answer：delta 拼起来的正文
 */
function createCollector(options = {}) {
  const works = []
  const characters = []
  const answerParts = []

  function push(line) {
    let event
    try {
      event = JSON.parse(line)
    } catch {
      return
    }
    applyEvent(event, { works, characters, answerParts, onStatus: options.onStatus })
  }

  return {
    push,
    result: () => ({ works, characters, answer: answerParts.join('') })
  }
}

function applyEvent(event, state) {
  const type = event?.type

  if (type === 'status') {
    const text = String(event.text || '').trim()
    if (text && state.onStatus) state.onStatus(text)
    return
  }

  if (type === 'block') {
    const block = event.block || {}
    const items = Array.isArray(block.items) ? block.items : []
    items.forEach((item) => {
      const url = String(item?.url || '')
      const vndbId = parseVndbId(url)
      if (vndbId) {
        if (state.works.some((w) => w.id === vndbId)) return
        state.works.push({
          id: vndbId,
          title: String(item?.title || '').trim(),
          subtitle: String(item?.subtitle || '').trim(),
          image: String(item?.image || ''),
          tags: Array.isArray(item?.tags) ? item.tags.map(String) : [],
          url
        })
        return
      }
      const title = String(item?.title || '').trim()
      if (!title) return
      if (state.characters.some((c) => c.title === title)) return
      state.characters.push({
        title,
        subtitle: String(item?.subtitle || '').trim(),
        image: String(item?.image || ''),
        url
      })
    })
    return
  }

  if (type === 'delta') {
    const text = String(event.text || '')
    if (text) state.answerParts.push(text)
    return
  }

  if (type === 'error') {
    throw new ImageSearchError(String(event.message || 'error'), {
      i18nKey: 'image_search.searchbox_error_generic'
    })
  }
}

/**
 * 从 https://vndb.org/v17 里取 17；不是 VNDB 链接返回 0
 * @param {string} url
 */
function parseVndbId(url) {
  const match = /vndb\.org\/v(\d+)/i.exec(String(url || ''))
  return match ? Number(match[1]) : 0
}

function isNetworkLayerError(err) {
  if (!err) return false
  if (err.name === 'TypeError') return true
  return /failed to fetch|network|networkerror|load failed/i.test(String(err.message || ''))
}

export { parseVndbId }
