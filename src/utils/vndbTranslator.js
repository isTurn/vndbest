/**
 * 内置浏览器里的 VNDB 中文化（把「VNDB优先原文和中文化」用户脚本内置进来）
 *
 * 脚本本体在 `public/vndb-translator.js`，由 `scripts/build-vndb-translator.cjs`
 * 从 `scripts/vendor/VNDBTranslatorLib.user.js` + 根目录的
 * `VNDB优先原文和中文化.js` 拼出来。不在 JS bundle 里内联，避免每次启动都
 * 背 340KB 的字符串解析开销，也方便单独更新字典。
 *
 * 生效范围：只对内置浏览器里打开的 vndb.org 页面注入。
 */

import { Capacitor } from '@capacitor/core'

export const TRANSLATOR_KEY = 'vndb_translator_enabled'

/** 脚本在 public/ 下的路径 */
const SCRIPT_PATH = 'vndb-translator.js'

/** 是否开启（默认开启：用户装这个 App 就是为了看中文） */
export function getTranslatorEnabled() {
  try {
    const v = localStorage.getItem(TRANSLATOR_KEY)
    // 只有明确关掉才不注入
    return v !== '0'
  } catch (e) {
    return true
  }
}

export function setTranslatorEnabled(on) {
  try {
    localStorage.setItem(TRANSLATOR_KEY, on ? '1' : '0')
  } catch (e) {
    /* 忽略隐私模式下的写入失败 */
  }
}

/** 只对 vndb.org 注入 */
function isVndbUrl(url) {
  try {
    const u = new URL(String(url || ''))
    return /(^|\.)vndb\.org$/i.test(u.hostname)
  } catch (e) {
    return false
  }
}

/** 读取脚本源码（同一进程内只读一次） */
let scriptPromise = null
function loadScriptSource() {
  if (scriptPromise) return scriptPromise
  scriptPromise = fetch(new URL(SCRIPT_PATH, document.baseURI).href)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.text()
    })
    .catch((e) => {
      console.error('[vndbTranslator] load script failed:', e)
      scriptPromise = null
      return ''
    })
  return scriptPromise
}

/** webviewId -> 最近一次已知 URL */
const lastUrl = new Map()

/**
 * 记录某个 WebView 当前地址。
 *
 * 首次打开时 `browserPageLoaded` 可能早于 `urlChangeEvent` 到达，
 * 所以 linkOpener 在 openWebView 拿到 id 后会先调一次这里，
 * 保证第一次页面加载就能取到 URL 完成注入。
 */
export function noteInAppBrowserUrl(webviewId, url) {
  if (!webviewId || !url) return
  lastUrl.set(webviewId, url)
}

/**
 * 给一个已打开的内置浏览器 WebView 装上中文化。
 * 需要在 `browserPageLoaded` / `urlChangeEvent` 时重复调用——
 * 每次页面导航都是新的 JS 上下文，注入不跨导航保留。
 *
 * @param {string} webviewId InAppBrowser.openWebView 返回的 id
 * @param {string} url 当前页面 URL，用于判断是不是 vndb.org
 */
export async function injectTranslator(webviewId, url) {
  if (!Capacitor.isNativePlatform()) return false
  if (!webviewId) return false
  if (!getTranslatorEnabled()) return false
  if (!isVndbUrl(url)) return false

  const source = await loadScriptSource()
  if (!source) return false

  try {
    const { InAppBrowser } = await import('@capgo/inappbrowser')
    await InAppBrowser.executeScript({ code: source, id: webviewId })
    return true
  } catch (e) {
    // 页面还在加载 / WebView 已关闭都会走到这里，不打扰用户
    console.warn('[vndbTranslator] inject failed:', e?.message || e)
    return false
  }
}

/**
 * 挂载「打开内置浏览器 → 每次页面加载后注入」的监听。
 * 在 main.js 调用一次即可，重复调用会被忽略。
 *
 * @param {(payload:{id:string,url:string})=>void} [onOpened] 可选回调，用于调试
 */
let installed = false
export function installTranslatorForInAppBrowser(onOpened) {
  if (installed) return
  if (!Capacitor.isNativePlatform()) return
  installed = true

  import('@capgo/inappbrowser').then(({ InAppBrowser }) => {
    // 页面加载完成：注入。导航到新页面时这个事件会再次触发。
    InAppBrowser.addListener('browserPageLoaded', async (event) => {
      const id = event?.id
      if (!id) return
      // 事件本身不带 url，用 urlChangeEvent 记录的最新值
      const url = lastUrl.get(id) || ''
      if (url) await injectTranslator(id, url)
    })

    // URL 变化：记录最新地址（SPA 站内跳转也会触发）
    InAppBrowser.addListener('urlChangeEvent', async (event) => {
      const id = event?.id
      const url = event?.url
      if (!id || !url) return
      lastUrl.set(id, url)
      if (typeof onOpened === 'function') {
        try { onOpened({ id, url }) } catch (e) { /* 忽略 */ }
      }
    })

    // WebView 关闭：清掉记录，避免 id 复用后拿到旧 URL
    InAppBrowser.addListener('closeEvent', (event) => {
      const id = event?.id
      if (id) lastUrl.delete(id)
    })
  }).catch((e) => {
    console.warn('[vndbTranslator] listener setup failed:', e?.message || e)
    installed = false
  })
}
