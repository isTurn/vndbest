/**
 * 外部链接打开方式：内置浏览器（App 内 WebView）或系统浏览器。
 *
 * - 目前只有两项独立设置：`vndb_link_browser_cross`（跨站搜索 / 站内 VNDB 网页跳转）
 *   与 `vndb_link_browser_release`（版本外链），两者都默认系统浏览器。
 * - 旧的 `vndb_link_browser` 默认项已废弃：设置页不再有对应控件，若还残留
 *   （老版本写过）会让「切内置浏览器」看起来失效，这里启动时直接清掉。
 * - 只拦截 http(s) 且跨域的链接；站内路由跳转不受影响。
 * - 带 `data-native` 的链接交给调用方自己处理（APK 下载必须走系统浏览器）；
 *   带 `data-cross-search` 的链接由 openCrossSearchSite 按跨站搜索设置处理。
 * - 非原生平台（浏览器里跑 dev）一律走默认行为，内置浏览器只在 App 里可用。
 */

import { Capacitor, registerPlugin } from '@capacitor/core'

const ExternalBrowser = registerPlugin('ExternalBrowser')

export const LINK_BROWSER_KEY = 'vndb_link_browser'
// 跨站搜索单独设置（和「版本外链」分开管理）
export const LINK_BROWSER_CROSS_KEY = 'vndb_link_browser_cross'
// 版本详情里 VNDB 提供的外链单独设置
export const LINK_BROWSER_RELEASE_KEY = 'vndb_link_browser_release'

export const LINK_BROWSER_INAPP = 'inapp'
export const LINK_BROWSER_SYSTEM = 'system'
export const LINK_BROWSER_CUSTOM = 'custom'
// 每次点击都弹系统「打开方式」选择框
export const LINK_BROWSER_CHOOSER = 'chooser'

// 传给原生插件的特殊标记：让系统弹选择框
export const CHOOSER_MARKER = '__chooser__'

// 自选浏览器（Android 包名），空字符串表示跟随系统默认浏览器
const CUSTOM_BROWSER_KEY = 'vndb_custom_browser_pkg'

// TouchGal 单独开关：打开后不管「跨站搜索打开方式」怎么设，都用内置浏览器打开，
// 页面正常加载完成后再用内置浏览器工具栏的按钮甩给外部浏览器。
const TOUCHGAL_INAPP_KEY = 'vndb_touchgal_inapp'

function isNative() {
  try {
    return Capacitor.isNativePlatform()
  } catch (e) {
    return false
  }
}

/** TouchGal 是否固定用内置浏览器打开（默认开：只有显式存过 '0' 才关） */
export function getTouchGalInAppEnabled() {
  try {
    const saved = localStorage.getItem(TOUCHGAL_INAPP_KEY)
    if (saved === null) return true
    return saved !== '0'
  } catch (e) {
    return true
  }
}

export function setTouchGalInAppEnabled(on) {
  try {
    localStorage.setItem(TOUCHGAL_INAPP_KEY, on ? '1' : '0')
  } catch (e) {
    /* 忽略隐私模式下的写入失败 */
  }
}

/** 读取自选浏览器包名，未设置时返回空串 */
export function getCustomBrowserPackage() {
  try {
    return localStorage.getItem(CUSTOM_BROWSER_KEY) || ''
  } catch (e) {
    return ''
  }
}

export function setCustomBrowserPackage(pkg) {
  try {
    const v = pkg || ''
    if (v && v !== LINK_BROWSER_CHOOSER) localStorage.setItem(CUSTOM_BROWSER_KEY, v)
    else localStorage.removeItem(CUSTOM_BROWSER_KEY)
  } catch (e) {
    /* 忽略隐私模式下的写入失败 */
  }
}

/** 列出手机上能打开网页的应用；非原生平台返回空数组 */
export async function listInstalledBrowsers() {
  if (!isNative()) return []
  try {
    const res = await ExternalBrowser.listBrowsers()
    return Array.isArray(res?.browsers) ? res.browsers : []
  } catch (e) {
    console.warn('[linkOpener] listBrowsers failed:', e)
    return []
  }
}

function readMode(key) {
  try {
    const v = localStorage.getItem(key)
    if (v === LINK_BROWSER_SYSTEM) return LINK_BROWSER_SYSTEM
    if (v === LINK_BROWSER_INAPP) return LINK_BROWSER_INAPP
    // 自选浏览器没有实际选定包名时视为未设置，避免选了又没装任何浏览器导致点不动
    if (v === LINK_BROWSER_CUSTOM && getCustomBrowserPackage()) return LINK_BROWSER_CUSTOM
    return ''
  } catch (e) {
    return ''
  }
}

function writeMode(key, mode) {
  try {
    localStorage.setItem(
      key,
      mode === LINK_BROWSER_SYSTEM || mode === LINK_BROWSER_CUSTOM ? mode : LINK_BROWSER_INAPP
    )
  } catch (e) {
    /* 忽略隐私模式下的写入失败 */
  }
}

/** 读取默认设置：没有单独指定设置的外链跟随「跨站搜索打开方式」，默认系统浏览器 */
export function getLinkBrowserMode() {
  return readMode(LINK_BROWSER_CROSS_KEY) || LINK_BROWSER_SYSTEM
}

/** 写入默认设置（同时写进跨站搜索那一项，避免出现两个互相矛盾的开关） */
export function setLinkBrowserMode(mode) {
  writeMode(LINK_BROWSER_CROSS_KEY, mode)
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
 * 设置了「自选浏览器」时改走原生插件，用指定包名的应用打开；否则退化成 <a> 点击。
 *
 * 注意：这里必须打上 data-native 标记，否则下面 installLinkInterceptor 的
 * 全局捕获监听会把我们自己这次程序化点击又拦下来、再开一次内置浏览器
 * —— 表现就是「切到系统浏览器还是用内置浏览器」。
 */
export async function openWithSystemBrowser(url) {
  const customPkg = getCustomBrowserPackage()
  if (customPkg && isNative()) {
    try {
      await ExternalBrowser.open({ url, packageName: customPkg })
      return
    } catch (e) {
      console.warn('[linkOpener] custom browser failed, fallback to default:', e)
    }
  }

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
  // 工具栏上的「用外部浏览器打开」按钮（常驻，没有开关）
  const { buildExternalButtonOption, noteBrowserUrl } = await import('./inAppBrowserTools')
  const { id } = await InAppBrowser.openWebView({
    url,
    // 导航栏自带标题与前进/后退/刷新，站内跳转不用回到 App
    toolbarType: ToolBarType.NAVIGATION,
    activeNativeNavigationForWebview: true,
    // 立即弹出，页面在可见的 WebView 里加载，避免用户以为点了没反应
    isPresentAfterPageLoad: false,
    backgroundColor: 'white',
    ...buildExternalButtonOption()
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
    // 记下初始地址：工具栏按钮点击时事件不带 url，靠这里缓存
    noteBrowserUrl(id, url)
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
  openWithSystemBrowser(href).catch(() => {})
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
    // 跨站搜索的链接由 openCrossSearchSite 按「跨站搜索」自己的设置处理，
    // 不能在这里用默认设置抢先打开，否则设置里切内置/系统会失效
    if (anchor.hasAttribute('data-cross-search')) return

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
