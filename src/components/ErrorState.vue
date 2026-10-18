<script setup>
/**
 * 统一错误状态块。
 *
 * 背景：此前搜索页在 catch 里只 console.error，用户看到的是「空列表」，
 * 把网络失败/限流伪装成了「查无此项」。本组件把失败态与空态显式区分开。
 */
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'

defineOptions({ name: 'ErrorState' })

defineProps({
  // 已本地化的错误文案（调用方用 translateError 生成）
  message: {
    type: String,
    default: ''
  },
  // 是否显示重试按钮
  retryable: {
    type: Boolean,
    default: true
  },
  // 紧凑模式（用于列表内嵌）
  compact: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['retry'])
const { t } = useI18n()
</script>

<template>
  <div
    class="rounded-xl border border-red-200/70 dark:border-red-900/50 bg-red-50/60 dark:bg-red-950/20 text-center shadow-xs"
    :class="compact ? 'p-6 space-y-2' : 'p-10 space-y-3'"
    role="alert"
  >
    <div
      class="mx-auto grid place-items-center rounded-full bg-red-100 dark:bg-red-900/40"
      :class="compact ? 'h-10 w-10' : 'h-12 w-12'"
    >
      <Icon
        icon="lucide:cloud-alert"
        class="text-red-500 dark:text-red-400"
        :class="compact ? 'h-4 w-4' : 'h-5 w-5'"
      />
    </div>
    <div class="space-y-1">
      <h3 class="text-sm font-semibold text-red-700 dark:text-red-300">{{ t('common.error') }}</h3>
      <p class="text-xs text-red-600/80 dark:text-red-400/80 max-w-xs mx-auto leading-relaxed">
        {{ message || t('error.network') }}
      </p>
    </div>
    <button
      v-if="retryable"
      type="button"
      class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-red-500 hover:bg-red-600 active:scale-[0.98] text-white text-xs font-medium transition cursor-pointer"
      @click="emit('retry')"
    >
      <Icon icon="lucide:refresh-cw" class="h-3.5 w-3.5" />
      {{ t('common.retry') }}
    </button>
  </div>
</template>
