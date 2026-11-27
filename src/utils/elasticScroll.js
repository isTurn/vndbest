/**
 * 中间滚动区域的「橡皮筋」回弹。
 *
 * 为什么要自己写：
 * Android WebView 的 overscroll stretch 作用在**视口**层面，整幅画面（含底部 fixed 的
 * TabBar）会一起被拉伸变形，所以之前三层把它全关了：
 *   1) html/body 的 overscroll-behavior: none；
 *   2) 文档自身不滚动，滚动全交给 ion-content；
 *   3) MainActivity 里 setOverScrollMode(OVER_SCROLL_NEVER)。
 * 但副作用是内容滚到边界后硬邦邦地停住，一点回馈都没有。而 WebView 里 `overscroll-behavior: auto`
 * 对内容层不产生视觉回弹（stretch 只在视口级），所以只能在滚动容器上自己做一个：
 * 只位移 ion-content 内部的滚动容器（shadow 里的 .inner-scroll，即 part="scroll"），
 * 底部 TabBar 是 App.vue 里独立的 fixed 层，完全不受影响。
 *
 * 做法：
 *   1) touchstart：记录起点，判断这次手势是不是从边界（顶/底）开始，以及是不是落在
 *      嵌套滚动容器 / fixed 弹层 / 输入框里（这些一律不接管）；
 *   2) touchmove：竖直方向为主时，若已经在边界还继续往外拖，按阻尼公式给 .inner-scroll
 *      一个 translate3d 位移（越拖越沉，不会线性跑飞）；
 *   3) touchend/touchcancel：用一段短过渡把位移收回 0，然后清掉内联样式。
 *
 * 注意：这里**不**调用 preventDefault，监听器全部 passive —— 原生滚动不被阻断，
 * 只在已经滚到边界、原生无事可做的时候才叠加位移，因此不会拖慢滚动、也不会吞掉点击。
 *
 * 若以后要改回系统级回弹：删掉这个文件与 main.js 里的安装，并把
 * MainActivity 的 setOverScrollMode 去掉、style.css 里 ion-content::part(scroll)
 * 的 overscroll-behavior 改回 auto —— 但 TabBar 会重新跟着整页弹性变形。
 */

/** 判定手势方向前的最小位移（px），避免手抖误判 */
const GESTURE_SLOP = 6
/** 阻尼系数，越小越「硬」 */
const RUBBER_CONSTANT = 0.55
/** 最大过拖距离占可视高度的比例，防止长拖把内容甩出屏幕 */
const MAX_OVERSCROLL_RATIO = 0.32
/** 松手回弹时长与缓动 */
const SNAP_BACK_MS = 320
const SNAP_BACK_EASING = 'cubic-bezier(0.22, 0.61, 0.36, 1)'

/**
 * 橡皮筋衰减：位移越大，增益越小。
 * distance 为手指越过边界的距离，dimension 为滚动容器可视高度。
 */
export function rubberBand(distance, dimension) {
  if (!(distance > 0) || !(dimension > 0)) return 0
  const damped =
    (distance * dimension * RUBBER_CONSTANT) / (dimension + RUBBER_CONSTANT * distance)
  return Math.min(damped, dimension * MAX_OVERSCROLL_RATIO)
}

/**
 * 从触摸点往上走到 ion-content，检查是否有「不该被接管」的祖先：
 * - 能竖直滚动的嵌套容器（里面的滚动交还给原生）；
 * - position: fixed 的弹层（ActionSheet / 自定义 Modal 等，别让背后页面跟着弹）；
 * - 输入框 / 可编辑区域（那是选文本，不是滚动）。
 */
function shouldIgnoreTarget(target, content) {
  if (target.closest('input, textarea, select, [contenteditable="true"]')) return true
  let el = target
  while (el && el !== content) {
    const style = getComputedStyle(el)
    if (style.position === 'fixed') return true
    const overflowY = style.overflowY
    if (
      (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
      el.scrollHeight - el.clientHeight > 2
    ) {
      return true
    }
    el = el.parentElement
  }
  return false
}

/**
 * 安装全局弹性滚动。重复调用无副作用（幂等）。
 */
export function installElasticScroll() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (window.__vndbestElasticScroll) return
  window.__vndbestElasticScroll = true

  /** 当前手势接管的滚动容器（shadow 内的 .inner-scroll） */
  let scroller = null
  let startX = 0
  let startY = 0
  /** null 未定 | 'v' 竖直（接管） | 'h' 水平（放过） */
  let direction = null
  /** 0 未进入边界过拖 | 1 顶部下拉 | -1 底部上拉 */
  let overscrollDir = 0
  /** 进入边界过拖那一刻的手指位置，位移从它开始算 */
  let anchorY = 0
  let startedAtTop = false
  let startedAtBottom = false
  let offset = 0
  let snapTimer = 0
  let snapEl = null

  function clearInline(el) {
    if (!el) return
    el.style.removeProperty('transition')
    el.style.removeProperty('transform')
    el.style.removeProperty('will-change')
  }

  function cancelSnapBack() {
    if (snapTimer) {
      clearTimeout(snapTimer)
      snapTimer = 0
    }
    if (snapEl) {
      clearInline(snapEl)
      snapEl = null
    }
  }

  function resetState() {
    scroller = null
    direction = null
    overscrollDir = 0
    offset = 0
  }

  function applyOffset(value) {
    if (!scroller) return
    offset = value
    if (Math.abs(value) < 0.5) {
      scroller.style.removeProperty('transform')
      return
    }
    scroller.style.willChange = 'transform'
    scroller.style.transform = `translate3d(0, ${value.toFixed(2)}px, 0)`
  }

  function settle() {
    const el = scroller
    if (!el) return
    clearTimeout(snapTimer)
    snapTimer = 0
    if (Math.abs(offset) < 0.5) {
      clearInline(el)
      resetState()
      return
    }
    el.style.willChange = 'transform'
    el.style.transition = `transform ${SNAP_BACK_MS}ms ${SNAP_BACK_EASING}`
    // 强制一次样式计算：保证 transition 先落地，再改 transform，否则会瞬移
    void el.offsetWidth
    el.style.transform = 'translate3d(0, 0px, 0)'
    snapEl = el
    snapTimer = setTimeout(() => {
      snapTimer = 0
      clearInline(snapEl)
      snapEl = null
    }, SNAP_BACK_MS + 60)
    resetState()
  }

  /**
   * 取手势真正落到的元素。
   *
   * ion-content 的滚动容器在 shadow DOM 里，touch 事件虽然是 composed 的，
   * 但在 document 上拿到的 event.target 已被重定向成宿主元素（ion-content），
   * 于是「点的是不是输入框」永远为否。composedPath 则能拿到真实的叶子节点。
   */
  function resolveTargets(event) {
    const path =
      typeof event.composedPath === 'function' ? event.composedPath() : []
    const origin = path.find((node) => node instanceof Element) || event.target
    if (!(origin instanceof Element)) return null
    const content = path.find(
      (node) => node instanceof Element && node.localName === 'ion-content'
    )
    return { origin, content: content || origin.closest('ion-content') }
  }

  function onTouchStart(event) {
    cancelSnapBack()
    if (!event.touches || event.touches.length !== 1) return
    const touch = event.touches[0]
    const targets = resolveTargets(event)
    if (!targets) return
    const target = targets.origin
    const content = targets.content

    if (!content || !content.shadowRoot) return
    const inner = content.shadowRoot.querySelector('.inner-scroll')
    if (!inner) return
    if (shouldIgnoreTarget(target, content)) return

    scroller = inner
    startX = touch.clientX
    startY = touch.clientY
    direction = null
    overscrollDir = 0
    offset = 0
    startedAtTop = inner.scrollTop <= 0
    startedAtBottom = inner.scrollTop + inner.clientHeight >= inner.scrollHeight - 1
  }

  function onTouchMove(event) {
    if (!scroller || !event.touches || event.touches.length !== 1) return
    const touch = event.touches[0]
    const dx = touch.clientX - startX
    const dy = touch.clientY - startY

    if (direction === null) {
      if (Math.abs(dx) < GESTURE_SLOP && Math.abs(dy) < GESTURE_SLOP) return
      direction = Math.abs(dy) >= Math.abs(dx) ? 'v' : 'h'
      if (direction === 'h') return
    }
    if (direction !== 'v') return

    const el = scroller
    const dimension = el.clientHeight
    if (dimension <= 0) return

    if (overscrollDir === 0) {
      const scrollTop = el.scrollTop
      const atTop = scrollTop <= 0
      const atBottom = scrollTop + dimension >= el.scrollHeight - 1
      if (dy > 0 && atTop) {
        overscrollDir = 1
        // 手势一开始就在顶部：整段位移都算过拖；中途才滚到顶：从这一刻算，
        // 否则会把之前正常滚动的距离一次性折算成位移，出现「跳一下」。
        anchorY = startedAtTop ? startY : touch.clientY
      } else if (dy < 0 && atBottom) {
        overscrollDir = -1
        anchorY = startedAtBottom ? startY : touch.clientY
      } else {
        return
      }
    }

    const distance =
      overscrollDir === 1 ? touch.clientY - anchorY : anchorY - touch.clientY
    if (distance <= 0) {
      // 往回拖过了锚点，交还给原生滚动
      overscrollDir = 0
      applyOffset(0)
      return
    }
    applyOffset(rubberBand(distance, dimension) * overscrollDir)
  }

  function onTouchEnd(event) {
    if (!scroller) return
    if (event.touches && event.touches.length > 0) return
    settle()
  }

  function onTouchCancel() {
    if (!scroller) return
    settle()
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      cancelSnapBack()
      resetState()
    }
  }

  document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true })
  document.addEventListener('touchmove', onTouchMove, { passive: true, capture: true })
  document.addEventListener('touchend', onTouchEnd, { passive: true, capture: true })
  document.addEventListener('touchcancel', onTouchCancel, { passive: true, capture: true })
  document.addEventListener('visibilitychange', onVisibilityChange)
}
