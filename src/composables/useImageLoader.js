import { reactive, onScopeDispose } from 'vue'

/**
 * 从 VNDB 缩略图 URL 推导原图 URL
 * t.vndb.org 的缩略图目录形如 cv.t / sf.t / ch.t / st.t，原图去掉 .t 即可
 * 例: https://t.vndb.org/cv.t/12/79412.jpg → https://t.vndb.org/cv/12/79412.jpg
 * 非缩略图 URL 原样返回
 */
export function thumbFallback(src) {
  if (!src || typeof src !== 'string') return ''
  return src.replace(/\/([a-z]{2,4})\.t\//i, '/$1/')
}

/**
 * 图片加载状态管理 composable
 *
 * 用法:
 *   const imageLoader = useImageLoader()
 *
 * 模板中:
 *   <div class="image-wrapper relative">
 *     <ion-img
 *       v-if="url"
 *       :key="`img-${key}-${imageLoader.getRetryCount(key)}`"
 *       :src="imageLoader.resolveSrc(key, url)"
 *       class="transition-opacity duration-500"
 *       :class="{ 'opacity-0': !imageLoader.isSuccess(key) }"
 *       @ionImgWillLoad="imageLoader.onWillLoad(key)"
 *       @ionImgDidLoad="imageLoader.onLoad(key)"
 *       @ionError="imageLoader.onError(key)"
 *     />
 *     <ion-spinner v-if="url && imageLoader.isLoading(key)" name="crescent" class="absolute inset-0 m-auto" style="width:24px;height:24px" />
 *     <div v-if="url && imageLoader.isError(key)" @click="imageLoader.retry(key)" class="absolute inset-0 flex items-center justify-center cursor-pointer">
 *       <Icon icon="lucide:refresh-cw" class="h-5 w-5 text-neutral-400" />
 *     </div>
 *   </div>
 *
 * 缩略图 404 自动回退:
 *   VNDB 的 image.thumbnail 字段并不保证真实存在（约 1% 的 release 图片，
 *   尤其是 dig / pkgcontent 这类补丁盘、光盘图，thumbnail 会返回 404，
 *   但原图正常）。onError 检测到失败的是缩略图时，自动改写为原图 URL 并
 *   重新加载一次，只有原图也失败才显示错误态。
 *
 * 加载超时兜底:
 *   ion-img 的 @ionImgWillLoad 触发时启动计时器，超过 LOAD_TIMEOUT 仍未
 *   成功也未报错，就按失败处理（同样会先尝试回退到原图）。避免网络卡在
 *   TCP/TLS 阶段时图片永远转圈。
 */
export function useImageLoader() {
  // 每个 key 的状态: 'loading' | 'success' | 'error'
  const states = reactive({})
  // 每个 key 的重试次数（用于强制重新渲染 ion-img）
  const retries = reactive({})
  // 每个 key 已确认 404 的缩略图 URL（响应式：写入后模板改用原图）
  const failedSrc = reactive({})
  // 每个 key 当前实际渲染的 src（非响应式，避免渲染期写入触发递归更新）
  const currentSrc = {}
  // 每个 key 的加载超时计时器（非响应式）
  const timers = {}

  /** 单张图片的最长等待时间，超时按失败处理 */
  const LOAD_TIMEOUT = 15000

  /** 清除某个 key 的超时计时器 */
  function clearTimer(key) {
    if (timers[key]) {
      clearTimeout(timers[key])
      delete timers[key]
    }
  }

  /** 组件卸载时清掉所有未完成的计时器，避免泄漏 */
  onScopeDispose(() => {
    Object.keys(timers).forEach(clearTimer)
  })

  /** 获取状态，未注册的 key 默认 'loading' */
  function getStatus(key) {
    return states[key] || 'loading'
  }

  function isLoading(key) {
    return getStatus(key) === 'loading'
  }

  function isSuccess(key) {
    return getStatus(key) === 'success'
  }

  function isError(key) {
    return getStatus(key) === 'error'
  }

  /**
   * 解析实际应渲染的 src：缩略图 404 过则返回原图
   * 需在模板中代替裸 src 使用
   */
  function resolveSrc(key, src) {
    if (!src) {
      currentSrc[key] = ''
      return ''
    }
    const fallback = thumbFallback(src)
    const use = fallback && fallback !== src && failedSrc[key] === src ? fallback : src
    currentSrc[key] = use
    return use
  }

  /** 图片加载成功 */
  function onLoad(key) {
    clearTimer(key)
    states[key] = 'success'
  }

  /** 图片开始真正请求（ion-img 的 IntersectionObserver 命中后才触发） */
  function onWillLoad(key) {
    clearTimer(key)
    timers[key] = setTimeout(() => {
      delete timers[key]
      onError(key)
    }, LOAD_TIMEOUT)
  }

  /** 图片加载失败：缩略图 404 时自动换原图重试，原图也失败才置 error */
  function onError(key) {
    clearTimer(key)
    const src = currentSrc[key]
    const fallback = thumbFallback(src)
    if (src && fallback && fallback !== src && failedSrc[key] !== src) {
      failedSrc[key] = src
      states[key] = 'loading'
      retries[key] = (retries[key] || 0) + 1
      return
    }
    states[key] = 'error'
  }

  /** 重试加载（重置为 loading 并增加重试计数） */
  function retry(key) {
    clearTimer(key)
    states[key] = 'loading'
    retries[key] = (retries[key] || 0) + 1
  }

  /** 获取重试次数，用作 ion-img 的 :key 强制重新渲染 */
  function getRetryCount(key) {
    return retries[key] || 0
  }

  return {
    states,
    getStatus,
    isLoading,
    isSuccess,
    isError,
    resolveSrc,
    onWillLoad,
    onLoad,
    onError,
    retry,
    getRetryCount
  }
}
