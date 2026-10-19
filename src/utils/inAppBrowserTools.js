/**
 * 内置浏览器（@capgo/inappbrowser）的增强：工具栏上的「用外部浏览器打开」按钮。
 *
 * 走的是插件自带的 `buttonNearDone` 参数 + `buttonNearDoneClick` 事件，
 * 按钮由原生工具栏渲染，位置在导航栏尾部（和前进 / 后退 / 刷新同一行）。
 *
 * 注意：插件默认把 `buttonNearDone` 限制成「toolbarType 不是 activity / navigation / blank」，
 * 而我们的内置浏览器必须用 navigation（要前进 / 后退 / 刷新）。
 * `scripts/patch-inappbrowser.cjs` 会打两处小补丁放开这个限制，
 * 图标用 vector 类型指向 `android/app/src/main/res/drawable/ic_open_external.xml`。
 * 补丁没打上的话传 buttonNearDone 会让 openWebView 直接 reject，
 * 所以这里由 buildExternalButtonOption() 统一出口，方便排查。
 */

import { Capacitor } from '@capacitor/core'

/** 设置项：内置浏览器工具栏上是否显示「用外部浏览器打开」（默认显示） */
export const IN_APP_EXTERNAL_BUTTON_KEY = 'vndb_inapp_external_button'

/** 工具栏按钮用的 vector drawable 名（不带 .xml） */
const BUTTON_ICON = 'ic_open_external'

export function getInAppExternalButtonEnabled() {
  try {
    // 只有明确关掉才不显示
    return localStorage.getItem(IN_APP_EXTERNAL_BUTTON_KEY) !== '0'
  } catch (e) {
    return true
  }
}

export function setInAppExternalButtonEnabled(on) {
  try {
    localStorage.setItem(IN_APP_EXTERNAL_BUTTON_KEY, on ? '1' : '0')
  } catch (e) {
    /* 忽略隐私模式下的写入失败 */
  }
}

/**
 * 拼 `openWebView` 的 buttonNearDone 参数。
 * 关掉开关或非原生平台时返回空对象，调用方用展开运算符即可（不会多出字段）。
 *
 * 只在 Android 上给：iOS 端的 InAppBrowserPlugin.swift 仍然
 * `reject("buttonNearDone is not compatible with toolbarType: navigation")`，
 * 传了会直接打不开 WebView。iOS 要这个功能得另想办法。
 */
export function buildExternalButtonOption() {
  if (!Capacitor.isNativePlatform()) return {}
  if (Capacitor.getPlatform() !== 'android') return {}
  if (!getInAppExternalButtonEnabled()) return {}
  return {
    buttonNearDone: {
      android: {
        iconType: 'vector',
        icon: BUTTON_ICON,
        width: 24,
        height: 24
      }
    }
  }
}

/** webviewId -> 当前 URL（buttonNearDoneClick 事件本身不带 url） */
const currentUrl = new Map()

let installed = false

/**
 * 挂载「点了工具栏按钮 → 用外部浏览器打开当前页」的监听。
 * 在 main.js 调用一次即可，重复调用会被忽略。
 *
 * 所有内置浏览器（普通外链、TouchGal）共用这套监听，
 * 因为插件的事件是全局广播、只在负载里带 webview id。
 */
export function installExternalButtonWatcher() {
  if (installed) return
  if (!Capacitor.isNativePlatform()) return
  installed = true

  import('@capgo/inappbrowser')
    .then(({ InAppBrowser }) => {
      // 记录每个 WebView 的当前地址（含站内无刷新跳转）
      InAppBrowser.addListener('urlChangeEvent', (event) => {
        const id = event?.id
        const url = event?.url
        if (id && url) currentUrl.set(id, url)
      })

      // 点了工具栏上的「用外部浏览器打开」
      InAppBrowser.addListener('buttonNearDoneClick', (event) => {
        const id = event?.id
        const url = (id && currentUrl.get(id)) || ''
        openExternally(url)
      })

      // WebView 关闭：清掉记录，避免 id 复用后拿到旧地址
      InAppBrowser.addListener('closeEvent', (event) => {
        const id = event?.id
        if (id) currentUrl.delete(id)
      })
    })
    .catch((e) => {
      console.warn('[inAppBrowserTools] listener setup failed:', e?.message || e)
      installed = false
    })
}

/**
 * 记录某个 WebView 的初始地址。
 *
 * 首次加载时 `urlChangeEvent` 可能来得比页面上屏还晚，
 * 这里在 openWebView 拿到 id 后先塞一次，保证一点按钮就能拿到地址。
 */
export function noteBrowserUrl(webviewId, url) {
  if (!webviewId || !url) return
  currentUrl.set(webviewId, url)
}

/** 交给系统浏览器（会自动遵守设置里的「自选浏览器 / 每次询问」） */
async function openExternally(url) {
  const href = String(url || '').trim()
  if (!/^https?:/i.test(href)) return
  try {
    const { openWithSystemBrowser } = await import('./linkOpener')
    await openWithSystemBrowser(href)
  } catch (e) {
    console.warn('[inAppBrowserTools] open externally failed:', e?.message || e)
  }
}
