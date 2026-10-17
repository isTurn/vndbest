<script setup>
import { ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  show: { type: Boolean, default: false },
  /** 已有的名称列表，用于重名检查 */
  existingNames: { type: Array, default: () => [] },
  /** 最大字符数 */
  maxLength: { type: Number, default: 8 },
  /** 预填名称（编辑模式） */
  initialName: { type: String, default: '' }
})

const emit = defineEmits(['confirm', 'cancel'])
const { t } = useI18n()

const nameInput = ref('')
const errorMsg = ref('')
const inputRef = ref(null)

watch(() => props.show, async (val) => {
  if (val) {
    nameInput.value = props.initialName || ''
    errorMsg.value = ''
    await nextTick()
    inputRef.value?.focus()
  }
})

function handleConfirm() {
  const name = nameInput.value.trim()
  if (!name) {
    errorMsg.value = t('save_search.name_required')
    return
  }
  if (name.length > props.maxLength) {
    errorMsg.value = t('save_search.name_too_long', { max: props.maxLength })
    return
  }
  if (props.existingNames.includes(name)) {
    errorMsg.value = t('save_search.name_exists')
    return
  }
  emit('confirm', name)
}

function handleCancel() {
  emit('cancel')
}

function handleBackdropClick(e) {
  if (e.target === e.currentTarget) {
    handleCancel()
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div
        v-if="show"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-6"
        @click="handleBackdropClick"
      >
        <div class="w-full max-w-sm bg-white dark:bg-neutral-900 rounded-2xl shadow-xl p-6">
          <!-- 标题 -->
          <h3 class="text-lg font-bold text-neutral-900 dark:text-neutral-100 mb-1">{{ t('save_search.title') }}</h3>
          <p class="text-sm text-neutral-500 dark:text-neutral-400 mb-4">{{ t('save_search.hint', { max: maxLength }) }}</p>

          <!-- 输入框 -->
          <input
            ref="inputRef"
            v-model="nameInput"
            :maxlength="maxLength"
            type="text"
            :placeholder="t('save_search.placeholder')"
            class="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-900 text-base outline-none transition-colors focus:border-neutral-400 focus:bg-white dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-neutral-500 dark:focus:bg-neutral-900"
            @keyup.enter="handleConfirm"
          />

          <!-- 错误提示 -->
          <p v-if="errorMsg" class="mt-2 text-sm text-red-500">{{ errorMsg }}</p>

          <!-- 字数统计 -->
          <p class="mt-1 text-xs text-neutral-400 dark:text-neutral-500 text-right">{{ nameInput.length }}/{{ maxLength }}</p>

          <!-- 按钮 -->
          <div class="flex gap-3 mt-5">
            <button
              class="flex-1 py-2.5 rounded-xl border border-neutral-200 bg-white text-neutral-700 font-medium text-sm active:scale-95 transition-transform cursor-pointer dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
              @click="handleCancel"
            >
              {{ t('common.cancel') }}
            </button>
            <button
              class="flex-1 py-2.5 rounded-xl bg-neutral-900 text-white font-medium text-sm active:scale-95 transition-transform cursor-pointer dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
              @click="handleConfirm"
            >
              {{ t('common.save') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
