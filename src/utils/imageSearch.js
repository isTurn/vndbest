/**
 * AnimeTrace 以图搜作品客户端
 *
 * 为什么前端直接调接口：
 * - AnimeTrace（api.animetrace.com；前端是 ai.animedb.cn / www.animetrace.com 同一套服务）
 *   的识别接口是公开的，响应头带 `access-control-allow-origin: *`，
 *   所以在 WebView 里直接 fetch multipart 就行，不需要额外原生插件或代理。
 * - 只在原生平台保留一个 CapacitorHttp 兜底：个别网络环境下 WebView 的 fetch
 *   可能被拦（比如代理/证书），此时用原生 HTTP 走同一份 multipart。
 *
 * 为什么上传前一定要重新编码：
 * - 接口对过大的图片返回 17701（图片过大），手机截图动辄三四 MB，直接传又慢又容易失败；
 * - 统一压到最长边 1280、JPEG 0.85，实测识别结果和原图几乎一致。
 *
 * 这里只负责「图片 → 作品名」；作品名到 VNDB 作品页的映射放在页面里用 getVnList 完成，
 * 因为那部分要复用项目自己的 API 封装（缓存、Token、超时策略）。
 */

import { Capacitor } from '@capacitor/core'

const API_URL = 'https://api.animetrace.com/v1/search'

/** 压缩后的最长边（px） */
const MAX_EDGE = 1280
const JPEG_QUALITY = 0.85
const REQUEST_TIMEOUT = 30000

/**
 * 接口错误码 → i18n key
 * 文档：https://ai.animedb.cn/api-docs
 * 17703（参数错误）、17706/17707（内部错误）没有单独的文案，走通用失败提示。
 */
const CODE_I18N_KEYS = {
  17701: 'image_search.error_too_large',
  17702: 'image_search.error_busy',
  17704: 'image_search.error_maintenance',
  17705: 'image_search.error_format',
  17708: 'image_search.error_too_many',
  17724: 'image_search.error_not_image',
  17728: 'image_search.error_limit',
  17731: 'image_search.error_too_many'
}

/** 带错误码 / i18n key 的错误，页面据此显示本地化文案 */
export class ImageSearchError extends Error {
  constructor(message, { code = 0, i18nKey = '' } = {}) {
    super(message)
    this.name = 'ImageSearchError'
    this.code = code
    this.i18nKey = i18nKey
  }
}

/**
 * 把用户选的图片压成适合上传的 JPEG Blob，并给一个可直接绑到 img 的预览地址
 * @param {File} file
 * @returns {Promise<{ blob: Blob, previewUrl: string, width: number, height: number }>}
 */
export async function prepareImageFile(file) {
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

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  if (!blob) {
    throw new ImageSearchError('encode failed', { i18nKey: 'image_search.error_format' })
  }
  return { blob, previewUrl: URL.createObjectURL(blob), width, height }
}

/**
 * 上传图片并识别
 * @param {Blob} blob  prepareImageFile 产出的 JPEG
 * @returns {Promise<{ works: Array<{name:string,characters:string[],score:number,confident:boolean}>, ai: boolean, traceId: string }>}
 */
export async function searchByImage(blob) {
  let payload
  try {
    payload = await postWithFetch(blob)
  } catch (err) {
    // 「网络层失败」或「WebView fetch 被挂到超时」时，原生平台换 CapacitorHttp 再试一次。
    // 实测部分设备 WebView 的 fetch 连不上 api.animetrace.com（30s 后 AbortError），
    // 但系统网络本身是通的，原生 HTTP 能正常拿到结果。
    const canRetry = isNetworkLayerError(err) || err?.i18nKey === 'image_search.error_timeout'
    if (!canRetry || !Capacitor.isNativePlatform()) throw err
    payload = await postWithCapacitorHttp(blob)
  }
  return normalizeResult(payload)
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

async function postWithFetch(blob) {
  const form = new FormData()
  form.append('is_multi', '1')
  form.append('ai_detect', '1')
  form.append('file', blob, 'image.jpg')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  let res
  try {
    res = await fetch(API_URL, { method: 'POST', body: form, signal: controller.signal })
  } catch (err) {
    // fetch 超时抛出的是 AbortError（message 是 "signal is aborted without reason"），
    // 直接冒到页面会显示英文原文，这里换成本地化的超时提示。
    if (err && err.name === 'AbortError') {
      throw new ImageSearchError('timeout', { i18nKey: 'image_search.error_timeout' })
    }
    throw err
  } finally {
    clearTimeout(timer)
  }

  const text = await res.text()
  let payload = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }
  if (!payload) {
    throw new ImageSearchError(`HTTP ${res.status}`, { i18nKey: 'image_search.error_generic' })
  }
  // 接口在部分错误下会返回非 2xx 但 body 里仍带 code/message，统一交给 normalizeResult 判断
  return payload
}

async function postWithCapacitorHttp(blob) {
  const { CapacitorHttp } = await import('@capacitor/core')
  const base64 = await blobToBase64(blob)
  const res = await CapacitorHttp.request({
    url: API_URL,
    method: 'POST',
    // 不带 boundary，原生侧会自动生成并补上
    headers: { 'Content-Type': 'multipart/form-data' },
    dataType: 'formData',
    data: [
      { type: 'string', key: 'is_multi', value: '1' },
      { type: 'string', key: 'ai_detect', value: '1' },
      { type: 'base64File', key: 'file', value: base64, fileName: 'image.jpg', contentType: 'image/jpeg' }
    ],
    connectTimeout: REQUEST_TIMEOUT,
    readTimeout: REQUEST_TIMEOUT
  })
  const data = res?.data
  if (typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch {
      return null
    }
  }
  return data
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      // 去掉 data:image/jpeg;base64, 前缀，原生侧要纯 base64
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(new ImageSearchError('read failed', { i18nKey: 'image_search.error_generic' }))
    reader.readAsDataURL(blob)
  })
}

function isNetworkLayerError(err) {
  if (!err) return false
  if (err.name === 'TypeError') return true
  return /failed to fetch|network|networkerror|load failed/i.test(String(err.message || ''))
}

function normalizeResult(payload) {
  const code = Number(payload?.code ?? -1)
  if (code !== 0) {
    const i18nKey = CODE_I18N_KEYS[code] || 'image_search.error_generic'
    const message = payload?.zh_message || payload?.message || `code ${code}`
    throw new ImageSearchError(message, { code, i18nKey })
  }

  // 同一个作品会在多个人物框里反复出现，按作品名归并、按命中次数排序
  const map = new Map()
  const boxes = Array.isArray(payload?.data) ? payload.data : []
  boxes.forEach((box) => {
    const characters = Array.isArray(box?.character) ? box.character : []
    characters.forEach((ch) => {
      const name = String(ch?.work || '').trim()
      if (!name) return
      let entry = map.get(name)
      if (!entry) {
        entry = { name, characters: [], score: 0, confident: false }
        map.set(name, entry)
      }
      entry.score += 1
      const charName = String(ch?.character || '').trim()
      if (charName && !entry.characters.includes(charName)) entry.characters.push(charName)
      if (!box?.not_confident) entry.confident = true
    })
  })

  const works = [...map.values()].sort((a, b) => b.score - a.score)
  return { works, ai: Boolean(payload?.ai), traceId: payload?.trace_id || '' }
}
