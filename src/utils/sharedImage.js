/**
 * 接收其他应用分享进来的图片，直接丢给「以图搜作品」。
 *
 * 背景：Android 的分享是 Intent 层面的，WebView 里的 <input type="file"> 收不到。
 * 原生侧（ShareImagePlugin）在 Intent 到达时把图片复制到 App 缓存目录，
 * 这里负责把它取出来变成 File，再交给 ImageSearch 页面去识别。
 *
 * 两条触发路径互为保险：
 * 1. 事件推送：插件在收到 Intent 时 notifyListeners('shareImage')（带 retain，
 *    冷启动时 JS 还没注册监听也不会丢）。用「先取 pending」而不是直接用事件
 *    参数，避免事件和文件信息两份状态对不上。
 * 2. 主动拉取：App 冷启动 / 从后台回到前台时各拉一次。系统在极少数情况下
 *    不会把新 Intent 发到已有进程，拉取能兜住。
 *
 * Web 端（浏览器调试）没有原生插件，全部降级为 no-op。
 */
import { Capacitor, registerPlugin } from '@capacitor/core'
import { ref } from 'vue'

const ShareImage = registerPlugin('ShareImage')

function isNative() {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/** 待处理的分享图片（File 对象）；ImageSearch 页面 watch 它 */
export const pendingSharedImage = ref(null)

/** 正在取图的标志，避免事件 + 拉取同时触发导致重复下载同一个文件 */
let consuming = false
let installed = false

/**
 * 从原生取一张待处理的分享图片。
 * 返回 File；没有新分享或读取失败返回 null。
 */
export async function consumeSharedImage() {
  if (!isNative() || consuming) return null
  consuming = true
  try {
    const res = await ShareImage.getPending()
    if (!res || !res.path) return null

    // 原生给的是 file:// 绝对路径；convertFileSrc 转成 WebView 能 fetch 的
    // https://localhost/_capacitor_file_/... 形式（content:// 也能转）。
    const src = Capacitor.convertFileSrc(res.path)
    const response = await fetch(src)
    if (!response.ok) {
      console.warn('[sharedImage] read failed:', response.status, res.path)
      return null
    }
    const blob = await response.blob()
    const name = res.name || 'shared-image.jpg'
    const type = res.mimeType || blob.type || 'image/jpeg'
    return new File([blob], name, { type })
  } catch (e) {
    console.warn('[sharedImage] consume failed:', e)
    return null
  } finally {
    consuming = false
  }
}

/**
 * 取图并交给页面。router 用来在收到分享时切到「以图搜作品」页。
 * 已经在那个页面时不重复 push（页面自己会 watch 到新图片）。
 */
async function pullSharedImage(router) {
  const file = await consumeSharedImage()
  if (!file) return

  pendingSharedImage.value = file
  if (!router) return

  // 冷启动时可能还在初始化，等路由就绪再跳
  try {
    await router.isReady()
  } catch {
    /* 路由异常时至少图片已经交出去了，页面自己 watch 得到 */
  }
  if (router.currentRoute.value.path !== '/browse/image') {
    router.push('/browse/image')
  }
}

let installedRouter = null

/**
 * 装全局接收：
 * - 原生事件 shareImage（热启动：App 已在后台，用户从别的应用分享过来）
 * - App 回到前台时拉一次（处理事件丢失的情况）
 * - 启动时拉一次（冷启动：App 没在运行，直接从分享面板拉起来）
 */
export function installSharedImageWatcher(router) {
  if (installed || !isNative()) return
  installed = true
  installedRouter = router

  ShareImage.addListener('shareImage', () => {
    pullSharedImage(installedRouter)
  })

  import('@capacitor/app')
    .then(({ App }) => {
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) pullSharedImage(installedRouter)
      })
    })
    .catch(() => {
      /* 插件不可用（纯 Web 调试）时忽略 */
    })

  // 冷启动：原生在 Activity 创建时就已经捕获了分享 Intent，等路由就绪再拉
  router
    .isReady()
    .then(() => pullSharedImage(installedRouter))
    .catch(() => {
      /* 路由异常时忽略，不影响 App 启动 */
    })
}
