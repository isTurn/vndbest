/**
 * 外部链接打开方式：内置浏览器（App 内 WebView）或系统浏览器。
 *
 * - 设置项存在 localStorage 的 `vndb_link_browser`，取值 `'inapp'` | `'system'`。
 * - 只拦截 http(s) 且跨域的链接；站内路由跳转不受影响。
 * - 带 `data-native` 标记的链接交给调用方自己处理（APK 下载必须走系统浏览器、
 *   跨站搜索里的 TouchGal 需要在内嵌 WebView 里注入脚本才能自动搜索）。
 * - 非原生平台（浏览器里跑 dev）一律走默认行为，内置浏览器只在 App 里可用。
 */

import { Capacitor } from '@capacitor/core'

export const LINK_BROWSER_KEY = 'vndb_link_browser'
// 跨站搜索单独设置（和「版本外链」分开管理）
export const LINK_BROWSER_CROSS_KEY = 'vndb_link_browser_cross'
// 版本详情里 VNDB 提供的外链单独设置
export const LINK_BROWSER_RELEASE_KEY = 'vndb_link_browser_release'
export const LINK_BROWSER_INAPP = 'inapp'
export const LINK_BROWSER_SYSTEM = 'system'

function readMode(key) {
  try {
    const v = localStorage.getItem(key)
    if (v === LINK_BROWSER_SYSTEM) return LINK_BROWSER_SYSTEM
    if (v === LINK_BROWSER_INAPP) return LINK_BROWSER_INAPP
    return ''
  } catch (e) {
    return ''
  }
}

function writeMode(key, mode) {
  try {
    localStorage.setItem(key, mode === LINK_BROWSER_SYSTEM ? LINK_BROWSER_SYSTEM : LINK_BROWSER_INAPP)
  } catch (e) {
    /* 忽略隐私模式下的写入失败 */
  }
}

/** 读取默认设置（未单独指定的外部链接都走这个），默认系统浏览器 */
export function getLinkBrowserMode() {
  return readMode(LINK_BROWSER_KEY) || LINK_BROWSER_SYSTEM
}

/** 写入默认设置 */
export function setLinkBrowserMode(mode) {
  writeMode(LINK_BROWSER_KEY, mode)
}

/** 跨站搜索用哪种浏览器，默认系统浏览器 */
export function getCrossSearchBrowserMode() {
  return readMode(LINK_BROWSER_CROSS_KEY) || LINK_BROWSER_SYSTEM
}

export function setCrossSearchBrowserMode(mode) {
  writeMode(LINK_BROWSER_CROSS_KEY, mode)
}

/** 版本详情里的 VNDB 外链用哪种浏览器，默认系统浏览器 */
export function getReleaseLinkBrowserMode() {
  return readMode(LINK_BROWSER_RELEASE_KEY) || LINK_BROWSER_SYSTEM
}

export function setReleaseLinkBrowserMode(mode) {
  writeMode(LINK_BROWSER_RELEASE_KEY, mode)
}

/**
 * 系统浏览器打开（Capacitor 会把非 app 域名的跳转交给 Intent.ACTION_VIEW）。
 *
 * 注意：这里必须打上 data-native 标记，否则下面 installLinkInterceptor 的
 * 全局捕获监听会把我们自己这次程序化点击又拦下来、再开一次内置浏览器
 * —— 表现就是「切到系统浏览器还是用内置浏览器」。
 */
export function openWithSystemBrowser(url) {
  const a = document.createElement('a')
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  a.setAttribute('data-native', '')
  // 双保险：即使标记被上游清掉，这次点击也不让拦截器接手
  window.__vndbestSystemOpenAt = Date.now()
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** 内置 WebView 打开 */
async function openWithInAppBrowser(url) {
  const { InAppBrowser, ToolBarType } = await import('@capgo/inappbrowser')
  const { id } = await InAppBrowser.openWebView({
    url,
    // 导航栏自带标题与前进/后退/刷新，站内跳转不用回到 App
    toolbarType: ToolBarType.NAVIGATION,
    activeNativeNavigationForWebview: true,
    // 立即弹出，页面在可见的 WebView 里加载，避免用户以为点了没反应
    isPresentAfterPageLoad: false,
    backgroundColor: 'white'
  })
  // 先把初始 URL 记下来：首次 browserPageLoaded 可能早于 urlChangeEvent，
  // 中文化注入要靠这个 URL 判断是不是 vndb.org
  if (id) {
    try {
      const { noteInAppBrowserUrl } = await import('./vndbTranslator')
      noteInAppBrowserUrl(id, url)
    } catch (e) {
      /* 中文化模块不可用时忽略 */
    }
  }
}

/**
 * 内置浏览器首次加载偶发失败时重试。
 *
 * 原生层 WebViewDialog.onReceivedError 对「主框架」加载失败会
 * `rejectOpenWebViewIfNeeded("Initial page load failed: ...")`，
 * 网络瞬断 / DNS 抖动就会命中，表现就是用户看到的「无法连接网络」，
 * 再点一次又好了。这里在回退系统浏览器之前先静默重试一次，
 * 用短退避避开瞬断，避免把用户直接甩去系统浏览器。
 */
async function openWithInAppBrowserRetry(url, attempts = 2) {
  let lastError = null
  for (let i = 0; i < attempts; i++) {
    try {
      await openWithInAppBrowser(url)
      return true
    } catch (e) {
      lastError = e
      // 首次失败后等一小会儿再重试，给网络栈恢复的时间
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400))
    }
  }
  throw lastError || new Error('in-app browser failed')
}

/**
 * 按当前设置打开一个外部链接。
 * @param {string} url
 * @param {{forceInApp?: boolean, mode?: string}} [opts]
 *   forceInApp 用于 TouchGal 这类必须内嵌的场景；
 *   mode 显式指定本次用内置还是系统浏览器（跨站搜索 / 版本外链各自有独立设置）。
 */
export async function openExternalUrl(url, opts = {}) {
  const href = String(url || '').trim()
  if (!href) return
  const native = Capacitor.isNativePlatform()
  const mode = opts.mode || getLinkBrowserMode()
  const wantInApp = opts.forceInApp || mode === LINK_BROWSER_INAPP
  if (native && wantInApp) {
    try {
      await openWithInAppBrowserRetry(href)
      return
    } catch (e) {
      console.error('[linkOpener] in-app browser failed, fallback to system:', e)
    }
  }
  openWithSystemBrowser(href)
}

/**
 * 全局拦截跨域 <a> 点击。
 * 在 main.js 里调用一次即可；重复调用会被忽略。
 */
export function installLinkInterceptor() {
  if (typeof document === 'undefined') return
  if (window.__vndbestLinkInterceptor) return
  window.__vndbestLinkInterceptor = true

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented) return
    // 只处理普通左键单击
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return

    // 刚由 openWithSystemBrowser 发起的程序化点击，交回系统浏览器
    if (Date.now() - (window.__vndbestSystemOpenAt || 0) < 800) return

    const anchor = e.target?.closest?.('a[href]')
    if (!anchor) return
    // 需要注入脚本或必须走系统浏览器的链接自己处理（TouchGal、APK 下载）
    if (anchor.hasAttribute('data-native')) return

    const href = anchor.getAttribute('href')
    if (!href) return

    let url
    try {
      url = new URL(href, location.href)
    } catch (err) {
      return
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return
    // 站内链接交给 vue-router / 默认行为
    if (url.origin === location.origin) return

    const native = Capacitor.isNativePlatform()
    const mode = getLinkBrowserMode()
    if (!native || mode !== LINK_BROWSER_INAPP) return

    e.preventDefault()
    openExternalUrl(url.href)
  }, true)
}
