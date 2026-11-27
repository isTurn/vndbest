<script setup>
/**
 * 页面顶栏组件。
 *
 * 布局位置：顶栏必须渲染在 <ion-content> **之外**（<ion-page> 的直接子节点），
 * 不能放回 .page-container 里。原因：中间内容的橡皮筋回弹是位移 ion-content
 * 内部滚动容器的（见 src/utils/elasticScroll.js），凡是躺在滚动容器里的元素
 * （包括 position: sticky 的）都会跟着一起被拖动；只有放在滚动容器外面的
 * 固定条才能做到「内容弹、顶栏纹丝不动」。
 *
 * 状态栏：顶部内边距用 Capacitor SystemBars 注入的 --safe-area-inset-top
 * （WebView ≥140 且 viewport-fit=cover 时才注入），env() 只在浏览器/旧机型兜底。
 * 之前只写 env() 取到 0，顶栏就和设备通知栏叠在一起了。
 *
 * 模式:
 * - page:   左侧图标 + 大标题/副标题（Home / Library / Settings 根）
 * - back:   返回按钮 + 大标题/副标题（Login / Search / Settings 子页）
 * - detail: 返回按钮 + 中号标题 + ID 副标题（Character/Producer/Staff 详情）
 * - center: 紧凑返回 + 居中小标题（VnDetail / ReleaseDetail）
 *
 * 插槽:
 * - leading: 覆盖左侧图标/按钮区域
 * - actions: 右侧操作区
 * - default: 完全自定义中间内容（少用）
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'

const props = defineProps({
  /** 布局模式 */
  mode: {
    type: String,
    default: 'page',
    validator: (v) => ['page', 'back', 'detail', 'center'].includes(v)
  },
  /** 主标题 */
  title: {
    type: String,
    default: ''
  },
  /** 副标题 / 描述 / ID */
  subtitle: {
    type: String,
    default: ''
  },
  /** page 模式左侧图标 (lucide:xxx) */
  icon: {
    type: String,
    default: ''
  },
  /**
   * 内边距尺寸:
   * - md: 默认 .app-header
   * - lg: .app-header--lg（详情页，上下留白更大）
   * center 模式固定用 md
   */
  size: {
    type: String,
    default: null,
    validator: (v) => v == null || ['md', 'lg'].includes(v)
  },
  /** 是否显示返回按钮（back/detail/center 默认 true；page 默认 false） */
  showBack: {
    type: Boolean,
    default: undefined
  },
  /** 自定义返回行为；不传则 router.back() */
  onBack: {
    type: Function,
    default: null
  }
})

const emit = defineEmits(['back'])

const router = useRouter()

const resolvedShowBack = computed(() => {
  if (props.showBack !== undefined) return props.showBack
  return props.mode !== 'page'
})

const resolvedSize = computed(() => {
  if (props.size) return props.size
  return props.mode === 'detail' ? 'lg' : 'md'
})

/** 外层：整条固定横栏（背景 / 模糊 / 状态栏内边距） */
const rootClass = computed(() => {
  const classes = ['app-header']
  if (resolvedSize.value === 'lg') classes.push('app-header--lg')
  return classes.join(' ')
})

/** 内层：与 .page-container 同宽居中的一行，承载各模式的排布 */
const barClass = computed(() => {
  if (props.mode === 'center') {
    return 'mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4'
  }
  if (props.mode === 'detail') {
    return 'mx-auto flex w-full max-w-2xl items-center gap-4 px-4'
  }
  // page / back：有 actions 时两端对齐
  return 'mx-auto flex w-full max-w-2xl items-center gap-3 px-4'
})

function handleBack() {
  emit('back')
  if (props.onBack) {
    props.onBack()
    return
  }
  router.back()
}
</script>

<template>
  <div :class="rootClass">
    <div :class="barClass">
      <!-- ===== center 模式 ===== -->
      <template v-if="mode === 'center'">
        <button
          v-if="resolvedShowBack"
          type="button"
          @click="handleBack"
          class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 active:bg-neutral-100 dark:active:bg-neutral-600 transition active:scale-95 cursor-pointer"
        >
          <Icon icon="lucide:chevron-left" class="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
        </button>
        <div v-else class="w-8" />

        <slot>
          <span class="text-xs font-semibold text-neutral-500 dark:text-neutral-400">{{ title }}</span>
        </slot>

        <div class="min-w-8 flex items-center justify-end">
          <slot name="actions">
            <div class="w-8" />
          </slot>
        </div>
      </template>

      <!-- ===== page / back / detail ===== -->
      <template v-else>
        <!-- 左侧 leading -->
        <slot name="leading">
          <button
            v-if="resolvedShowBack"
            type="button"
            @click="handleBack"
            class="grid h-10 w-10 place-items-center rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-xs active:scale-95 transition-transform cursor-pointer shrink-0"
          >
            <Icon icon="lucide:chevron-left" class="h-5 w-5 text-neutral-800 dark:text-neutral-200" />
          </button>
          <div
            v-else-if="icon"
            class="grid h-10 w-10 place-items-center rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-xs shrink-0"
          >
            <Icon :icon="icon" class="h-5 w-5 text-neutral-800 dark:text-neutral-200" />
          </div>
        </slot>

        <!-- 标题区 -->
        <div class="flex-1 min-w-0">
          <slot>
            <h1
              class="font-bold tracking-tight text-neutral-900 dark:text-neutral-100"
              :class="mode === 'detail'
                ? 'text-lg truncate'
                : 'text-2xl'"
            >
              {{ title }}
            </h1>
            <p
              v-if="subtitle"
              :class="mode === 'detail'
                ? 'text-[10px] text-neutral-400 dark:text-neutral-500 uppercase tracking-widest'
                : 'text-xs text-neutral-500 dark:text-neutral-400'"
            >
              {{ subtitle }}
            </p>
          </slot>
        </div>

        <!-- 右侧操作 -->
        <div v-if="$slots.actions" class="shrink-0 flex items-center">
          <slot name="actions" />
        </div>
      </template>
    </div>
  </div>
</template>
