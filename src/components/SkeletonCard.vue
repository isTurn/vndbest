<script setup>
/**
 * 列表骨架屏。
 *
 * 背景：此前加载态是一个居中转圈图标，首屏从「白」直接跳到「有内容」。
 * 骨架屏按目标布局给出占位形状，感知上更快、也没有转圈造成的焦虑感。
 *
 * 三种形态与 VnList / ReleaseList 的 layout 对应：
 *  - list：横向卡片（左封面 + 右文字）
 *  - card：纵向网格卡（上封面 + 下文字）
 *  - text：纯文本行
 */
defineOptions({ name: 'SkeletonCard' })

defineProps({
  layout: {
    type: String,
    default: 'list'
  },
  count: {
    type: Number,
    default: 6
  }
})
</script>

<template>
  <!-- 纯文本行 -->
  <div
    v-if="layout === 'text'"
    class="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden shadow-xs divide-y divide-neutral-100 dark:divide-neutral-800"
  >
    <div v-for="i in count" :key="i" class="px-4 py-3 flex items-center justify-between gap-4">
      <div class="flex flex-col gap-1.5 min-w-0 flex-1">
        <div class="sk h-3.5 rounded" :style="{ width: `${58 + ((i * 13) % 30)}%` }" />
        <div class="sk h-2.5 rounded opacity-60" :style="{ width: `${34 + ((i * 17) % 24)}%` }" />
      </div>
      <div class="sk h-3 w-8 rounded shrink-0" />
    </div>
  </div>

  <!-- 纵向网格卡 -->
  <div v-else-if="layout === 'card'" class="grid grid-cols-2 gap-3">
    <div
      v-for="i in count"
      :key="i"
      class="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden shadow-xs"
    >
      <div class="sk aspect-[3/4] w-full" />
      <div class="p-2.5 space-y-2">
        <div class="sk h-3 rounded" :style="{ width: `${62 + ((i * 11) % 26)}%` }" />
        <div class="sk h-2.5 rounded opacity-60" :style="{ width: `${38 + ((i * 7) % 22)}%` }" />
      </div>
    </div>
  </div>

  <!-- 横向列表卡 -->
  <div
    v-else
    class="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden shadow-xs divide-y divide-neutral-100 dark:divide-neutral-800"
  >
    <div v-for="i in count" :key="i" class="flex gap-3 p-3">
      <div class="sk h-[72px] w-[54px] rounded-lg shrink-0" />
      <div class="flex-1 min-w-0 flex flex-col justify-center gap-2">
        <div class="sk h-3.5 rounded" :style="{ width: `${54 + ((i * 13) % 32)}%` }" />
        <div class="sk h-2.5 rounded opacity-60" :style="{ width: `${32 + ((i * 19) % 26)}%` }" />
        <div class="flex gap-1.5 pt-0.5">
          <div class="sk h-4 w-10 rounded-full opacity-50" />
          <div class="sk h-4 w-8 rounded-full opacity-50" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 骨架占位块的统一外观 + 流光动画 */
.sk {
  background-image: linear-gradient(
    90deg,
    var(--sk-base) 0%,
    var(--sk-shine) 50%,
    var(--sk-base) 100%
  );
  background-size: 200% 100%;
  animation: sk-shimmer 1.4s ease-in-out infinite;
}

:root {
  --sk-base: rgb(229 229 229);
  --sk-shine: rgb(245 245 245);
}

:global(.dark) .sk {
  --sk-base: rgb(38 38 38);
  --sk-shine: rgb(64 64 64);
}

@keyframes sk-shimmer {
  0% {
    background-position: 150% 0;
  }
  100% {
    background-position: -50% 0;
  }
}

/* 尊重系统「减少动态效果」偏好 */
@media (prefers-reduced-motion: reduce) {
  .sk {
    animation: none;
  }
}
</style>
