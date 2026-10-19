import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import i18n from './i18n'
import { IonicVue, createAnimation } from '@ionic/vue'
import { registerAppIcons } from './icons/register-icons'
import { installLinkInterceptor } from './utils/linkOpener'
import { installCookieKeeper } from './utils/cookieKeeper'
import { installTranslatorForInAppBrowser } from './utils/vndbTranslator'
import { installExternalButtonWatcher } from './utils/inAppBrowserTools'
import { installRedirectSkipWatcher } from './utils/redirectSkip'
import './style.css'

registerAppIcons()
// 外链按设置走内置浏览器或系统浏览器（TouchGal 等带 data-native 的链接自己处理）
installLinkInterceptor()
// 内置浏览器的登录态落盘（会话 cookie → 持久 cookie），避免重进软件要重新登录
installCookieKeeper()
// 内置浏览器打开 vndb.org 时注入中文化脚本（等同内置了「VNDB优先原文和中文化」油猴脚本）
installTranslatorForInAppBrowser()
// 内置浏览器工具栏上的「用外部浏览器打开」按钮（点击后把当前页交给系统/自选浏览器）
installExternalButtonWatcher()
// TouchGal 的外链过渡页（「即将离开…5 秒」）自动跳过
installRedirectSkipWatcher()

// 根据 .env 中的 VITE_VCONSOLE 环境变量决定是否启用 vConsole 调试面板
if (import.meta.env.VITE_VCONSOLE === 'true') {
  const VConsole = (await import('vconsole')).default
  new VConsole()
}

const LEAVING_CLASS = 'app-page-leaving'
const PAGE_STYLE_KEYS = [
  'opacity',
  'transform',
  'visibility',
  'pointer-events',
  'z-index',
  'display'
]

// 当前正在做页面过渡的两个元素（用于让 afterEach 的兜底清理避开动画中途）
let activeTransition = null
let transitionTimer = 0

function isAnimating(el) {
  if (!activeTransition || !el) return false
  return el === activeTransition.enteringEl || el === activeTransition.leavingEl
}

/** 清掉页面上可能残留的过渡内联样式（Capacitor WebView 二次进入尤其关键） */
function resetPageChrome(el) {
  if (!el) return
  el.classList.remove('ion-page-invisible', 'ion-page-hidden', LEAVING_CLASS)
  for (const key of PAGE_STYLE_KEYS) {
    el.style.removeProperty(key)
  }
  // 兜底：若仍只剩空 style，去掉属性，避免 WebView 怪异残留
  if (el.getAttribute('style')?.trim() === '') {
    el.removeAttribute('style')
  }
}

/**
 * 只清理「会让页面永久不可见」的残留（二次进入白屏兜底用）。
 *
 * 绝不能像 resetPageChrome 那样连 opacity / transform / z-index 和 Ionic 的
 * ion-page-invisible 一起清掉：路由 afterEach 的时机可能早于 Ionic 启动转场，
 * 此时进入页正是靠 ion-page-invisible（opacity:0）藏着的，一旦被清掉，
 * 新页会先整页画一帧再被动画拉回 opacity:0 重新淡入 —— 观感就是「切一次闪一下」。
 */
function clearStuckChrome(el) {
  if (!el) return
  el.classList.remove(LEAVING_CLASS)
  el.style.removeProperty('visibility')
  el.style.removeProperty('display')
  if (el.getAttribute('style')?.trim() === '') {
    el.removeAttribute('style')
  }
}

/**
 * 底部 Tab 之间的切换不做动画。
 *
 * 原因：交叉淡出时两张页面同时处于半透明状态，而页面背景（尤其开启自定义背景后）
 * 是透明的，于是页面底色会从中间透出来 —— 观感就是「切一次闪一下」。
 * 让 Tab 之间瞬时切换，既没有空档也没有底色透出。
 */
let nextNavInstant = false

/**
 * 自定义页面切换动画（尽量不污染内联样式）：
 * - 新页：短淡入 + 轻微位移，叠在旧页之上（zIndex 101）
 * - 旧页：**完全不动**，保持不透明垫在下面，等 Ionic 动画结束后自己加 ion-page-hidden
 *
 * 关键：旧页绝对不能淡出。两张半透明页叠在背景上会让页面底色透出来（闪一下）；
 * 旧页也不能提前 visibility:hidden，否则「旧页已消失、新页还是 opacity:0」出现空档。
 */
const pageTransition = (_baseEl, opts = {}) => {
  const enteringEl = opts.enteringEl
  const leavingEl = opts.leavingEl
  const backDirection = opts.direction === 'back'
  const instant = nextNavInstant
  nextNavInstant = false
  const DURATION = instant ? 1 : 200

  activeTransition = { enteringEl, leavingEl }
  clearTimeout(transitionTimer)
  transitionTimer = setTimeout(() => {
    activeTransition = null
    // 兜底：只清「永久不可见」类残留，不动 opacity —— 见 clearStuckChrome 注释
    if (enteringEl) clearStuckChrome(enteringEl)
    if (leavingEl) clearStuckChrome(leavingEl)
  }, DURATION + 120)

  const root = createAnimation().duration(DURATION).easing('cubic-bezier(0.32, 0.72, 0, 1)')

  if (enteringEl) {
    const fromX = backDirection ? '-12px' : '12px'
    const enter = createAnimation()
      .addElement(enteringEl)
      .beforeAddWrite(() => {
        resetPageChrome(enteringEl)
      })
      .beforeStyles({
        // 瞬时切换时不改透明度，避免任何一帧半透明
        opacity: instant ? '1' : '0',
        transform: `translateX(${instant ? '0px' : fromX})`,
        zIndex: '101'
      })
      /**
       * 动画一结束就把内联 opacity / transform 清掉。
       *
       * 这是闪屏的第二个成因：Web Animation 带 fill:'both'，Ionic 在过渡结束后
       * 会 animation.destroy() → cancel()，动画值被撤掉，内联样式重新生效。
       * 若此处仍留着 beforeStyles 写入的 opacity:0，新页会在动画结束瞬间整页变透明，
       * 直到定时器（DURATION+120ms）把它清掉 —— 那 100 多毫秒就是用户看到的「闪一下」。
       * 用 afterClearStyles 在动画收尾的同一帧清掉，中间没有任何空档。
       *
       * 注意只清 opacity / transform，**不清 zIndex**：zIndex 需要保留到 Ionic
       * 把旧页标记 ion-page-hidden 之后，否则新页会瞬间沉到旧页下面。
       */
      .afterClearStyles(['opacity', 'transform'])

    if (!instant) {
      enter
        .fromTo('opacity', '0', '1')
        .fromTo('transform', `translateX(${fromX})`, 'translateX(0px)')
    }

    root.addAnimation(enter)
  }

  if (leavingEl) {
    // 只做清理，不加淡出：旧页保持不透明垫底，由 Ionic 在过渡结束后隐藏
    const leave = createAnimation()
      .addElement(leavingEl)
      .beforeAddWrite(() => {
        leavingEl.classList.remove('ion-page-hidden', LEAVING_CLASS)
        leavingEl.style.removeProperty('visibility')
        leavingEl.style.removeProperty('display')
        leavingEl.style.opacity = '1'
      })
      // 空转关键帧：保证子动画有合法 keyframes，同时不改变任何视觉
      .fromTo('opacity', '1', '1')
      .afterClearStyles(['opacity'])

    root.addAnimation(leave)
  }

  return root
}

const app = createApp(App)
app.use(IonicVue, {
  animated: true,
  navAnimation: pageTransition
})
app.use(router)
app.use(i18n)

// 全局错误兜底：避免单个组件异常导致整页白屏
app.config.errorHandler = (err, instance, info) => {
  console.error('[vndbest] unhandled error:', info, err)
}

// 底部 Tab 之间（主页 / 搜索 / 列表 / 设置）的切换一律瞬时完成，
// 只有进入详情页、返回列表这类层级跳转才保留淡入位移动画。
router.beforeEach((to, from) => {
  const toTab = to.meta?.showTabBar !== false
  const fromTab = from.meta?.showTabBar !== false
  nextNavInstant = Boolean(toTab && fromTab && to.path !== from.path)
  return true
})

// 路由懒加载 chunk 拉取失败（弱网/更新后旧 chunk 失效）时自动重载一次
router.onError((err, to) => {
  console.error('[vndbest] router error:', to?.fullPath, err)
  const KEY = 'vndbest_chunk_reload'
  try {
    if (sessionStorage.getItem(KEY) === to?.fullPath) {
      sessionStorage.removeItem(KEY)
      return
    }
    sessionStorage.setItem(KEY, to?.fullPath || '')
  } catch {
    return
  }
  if (/Failed to fetch dynamically imported module|Importing a module script failed/i.test(String(err))) {
    window.location.reload()
  }
})

// 路由完成后再次清理当前可见页（APP 二次进入白屏兜底）
// 注意：这里只清「永久不可见」类的残留，绝不能清 opacity / ion-page-invisible ——
// 该时机可能早于 Ionic 启动转场，进入页此刻正是靠 ion-page-invisible 藏着的。
router.afterEach(() => {
  requestAnimationFrame(() => {
    const outlet = document.querySelector('ion-router-outlet')
    if (!outlet) return
    const pages = Array.from(outlet.children).filter((el) => el.classList?.contains('ion-page'))
    for (const page of pages) {
      if (!page.classList.contains('ion-page-hidden') && !isAnimating(page)) {
        clearStuckChrome(page)
      }
    }
    // 再补一帧，覆盖 Ionic 动画结束后的写回
    setTimeout(() => {
      for (const page of pages) {
        if (!page.classList.contains('ion-page-hidden') && !isAnimating(page)) {
          clearStuckChrome(page)
        }
      }
    }, 260)
  })
})

app.mount('#app')
