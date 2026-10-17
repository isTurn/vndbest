<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'

// 年龄分级徽章：用心形颜色区分（对齐 VNDB 官网的彩色 ❤ 表达）
// 红 = R18（18+） / 绿 = R18 无码（18+ 且 uncensored） / 蓝 = 15+ / 琥珀 = 6~14 / 灰 = 全年龄
const props = defineProps({
  minage: {
    type: Number,
    default: null
  },
  // 是否无码（VNDB release.uncensored）。仅在 minage >= 18 时参与配色
  uncensored: {
    type: Boolean,
    default: null
  },
  // compact: 更小的尺寸，用于列表卡片
  compact: {
    type: Boolean,
    default: false
  },
  // 是否显示文字（列表卡片通常只显示心形）
  showText: {
    type: Boolean,
    default: true
  }
})

const { t } = useI18n()

const valid = computed(() => props.minage !== null && props.minage !== undefined)

// uncensored 在 API 里大量是 null（未知），只有 true 才算无码
const isUncensored = computed(() => props.uncensored === true)

const colorClass = computed(() => {
  const age = props.minage
  if (age === 0) return 'text-neutral-400 dark:text-neutral-500'
  if (age >= 18) {
    return isUncensored.value
      ? 'text-emerald-500 dark:text-emerald-400'
      : 'text-red-500 dark:text-red-400'
  }
  if (age >= 15) return 'text-sky-500 dark:text-sky-400'
  return 'text-amber-500 dark:text-amber-400'
})

const label = computed(() => {
  if (!valid.value) return ''
  if (props.minage === 0) return t('release.all_ages')
  if (props.minage >= 18 && isUncensored.value) return `${props.minage}+ · ${t('release.uncensored')}`
  return `${props.minage}+`
})

const iconSize = computed(() => (props.compact ? 'h-2.5 w-2.5' : 'h-3 w-3'))
</script>

<template>
  <span
    v-if="valid"
    class="inline-flex items-center gap-0.5 shrink-0"
    :title="label"
  >
    <Icon
      icon="lucide:heart"
      :class="[iconSize, colorClass, minage > 0 ? 'fill-current' : '']"
    />
    <span
      v-if="showText"
      class="font-bold leading-none"
      :class="[colorClass, compact ? 'text-[8px]' : 'text-[9px]']"
    >{{ label }}</span>
  </span>
</template>
