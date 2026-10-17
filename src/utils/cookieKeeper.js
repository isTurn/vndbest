/**
 * 让内置浏览器（@capgo/inappbrowser 的 WebView）记住登录态。
 *
 * 背景：WebView 的 CookieManager 把「没有 Max-Age/Expires 的会话 cookie」放在内存里，
 * 应用进程被系统回收（用户划掉后台 / 系统内存不足）后这些 cookie 就没了，
 * 站点只能让你重新登录。Capacitor 主 WebView 与内嵌 WebView 共用同一个
 * CookieManager（进程级单例），所以只要把 cookie 落盘 + 补上有效期即可。
 *
 * 具体做两件事：
 * 1. persistCookies()：调原生 CookieKeeper 把 cookie 重写为一年有效期并 flush 落盘。
 * 2. flushCookies()：只刷盘，不改 cookie 属性。
 *
 * Web 端（浏览器调试）没有原生插件，全部降级为 no-op。
 */
import { Capacitor, registerPlugin } from '@capacitor/core'
import { CROSS_SEARCH_HOSTS } from './crossSearch'

const CookieKeeper = registerPlugin('CookieKeeper')

/** 需要持久化的站点 URL（跨站搜索表里的全部站点 + VNDB 自身） */
function cookieTargets() {
  const urls = CROSS_SEARCH_HOSTS.map((host) => `https://${host}`)
  urls.push('https://vndb.org', 'https://api.vndb.org')
  return Array.from(new Set(urls))
}

function isNative() {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/** 只把待写盘的 cookie 刷到磁盘 */
export async function flushCookies() {
  if (!isNative()) return
  try {
    await CookieKeeper.flush()
  } catch (e) {
    console.warn('[cookieKeeper] flush failed:', e)
  }
}

/**
 * 把会话 cookie 转成持久 cookie（一年）并落盘。
 * 在「打开过外链之后」和「应用退到后台之前」调用。
 */
export async function persistCookies() {
  if (!isNative()) return
  try {
    const res = await CookieKeeper.persist({ urls: cookieTargets() })
    if (res && res.rewritten) {
      console.log(`[cookieKeeper] persisted ${res.rewritten}/${res.scanned} cookies`)
    }
  } catch (e) {
    console.warn('[cookieKeeper] persist failed:', e)
  }
}

/** 清空所有内置浏览器的 cookie（设置里的退出登录用） */
export async function clearCookies() {
  if (!isNative()) return
  try {
    await CookieKeeper.clear()
  } catch (e) {
    console.warn('[cookieKeeper] clear failed:', e)
  }
}

let installed = false

/**
 * 装全局兜底：
 * - 切后台/划掉后台前（visibilityState === 'hidden'）→ 刷盘
 * - 从内置浏览器返回 App（重新 visible）→ 把刚登录/刚过 Cloudflare 验证拿到的
 *   会话 cookie 转成持久 cookie，这是最关键的一次
 * 与 MainActivity.onPause() 里的原生 flush 互为保险。
 */
export function installCookieKeeper() {
  if (installed || !isNative()) return
  installed = true

  // 1) 页面可见性变化：切后台前 / 从内置浏览器回到 App
  document.addEventListener('visibilitychange', () => {
    persistCookies()
  })

  // 2) App 回到前台：这是「刚在内置浏览器里登录完」最可靠的信号
  import('@capacitor/app')
    .then(({ App }) => {
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) persistCookies()
      })
      App.addListener('pause', () => {
        persistCookies()
      })
    })
    .catch(() => {
      /* 插件不可用（纯 Web 调试）时忽略 */
    })

  // 3) 内置浏览器关闭的那一刻：用户可能刚在里面登录完就关掉了
  import('@capgo/inappbrowser')
    .then(({ InAppBrowser }) => {
      InAppBrowser.addListener('closeEvent', () => {
        persistCookies()
      })
    })
    .catch(() => {
      /* 插件不可用（纯 Web 调试）时忽略 */
    })

  // 启动时先刷一次，把上次残留的 cookie 落盘
  flushCookies()
}
