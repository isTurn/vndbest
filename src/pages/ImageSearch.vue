<template>
  <ion-page>
    <AppHeader
      mode="back"
      :title="t('image_search.title')"
      :subtitle="t('image_search.subtitle')"
    />
    <ion-content>
      <div class="page-container pb-24 space-y-5">
        <input ref="fileInput" type="file" accept="image/*" class="sr-only" @change="onFileChange" />

        <!-- 没选图：虚线大按钮，点一下调起系统相册/文件选择器 -->
        <button
          v-if="!previewUrl"
          type="button"
          class="flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-neutral-200 bg-white px-6 py-12 text-center transition hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/60"
          @click="pickImage"
        >
          <span class="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            <Icon icon="lucide:image-plus" class="h-6 w-6" />
          </span>
          <span class="text-sm font-medium text-neutral-900 dark:text-neutral-100">{{ t('image_search.pick') }}</span>
          <span class="text-xs text-neutral-500 dark:text-neutral-400">{{ t('image_search.pick_hint') }}</span>
        </button>

        <!-- 已选图：预览 + 识别中的遮罩 -->
        <div v-else class="relative overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800">
          <img :src="previewUrl" alt="" class="mx-auto max-h-[45vh] w-full object-contain" />
          <div class="absolute right-2 top-2 flex gap-2">
            <button
              type="button"
              class="cursor-pointer rounded-full bg-black/60 px-3 py-1.5 text-xs text-white backdrop-blur-sm transition hover:bg-black/75"
              @click="pickImage"
            >
              {{ t('image_search.change') }}
            </button>
            <button
              type="button"
              class="cursor-pointer rounded-full bg-black/60 px-3 py-1.5 text-xs text-white backdrop-blur-sm transition hover:bg-black/75"
              @click="reset"
            >
              {{ t('image_search.clear') }}
            </button>
          </div>
          <div
            v-if="phase === 'recognizing'"
            class="absolute inset-0 flex items-center justify-center gap-2 bg-black/45 text-sm text-white"
          >
            <Icon icon="eos-icons:loading" class="h-5 w-5 animate-spin" />
            <span>{{ t('image_search.recognizing') }}</span>
          </div>
        </div>

        <!-- 失败提示 -->
        <div
          v-if="phase === 'error'"
          class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
        >
          <div class="flex items-start gap-2">
            <Icon icon="lucide:alert-triangle" class="mt-0.5 h-4 w-4 shrink-0" />
            <div class="flex-1">
              <p>{{ errorMessage }}</p>
              <button
                v-if="lastFile"
                type="button"
                class="mt-2 cursor-pointer rounded-lg border border-red-300 px-2.5 py-1 text-xs font-medium transition hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/40"
                @click="runSearch(lastFile)"
              >
                {{ t('common.retry') }}
              </button>
            </div>
          </div>
        </div>

        <!-- 结果 -->
        <template v-if="phase === 'done'">
          <div v-if="!works.length" class="rounded-xl border border-neutral-200 px-4 py-10 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            {{ t('image_search.no_result') }}
          </div>

          <template v-else>
            <div class="flex flex-wrap items-center gap-2">
              <p class="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {{ t('image_search.works_found', { count: works.length }) }}
              </p>
              <span
                v-if="aiGenerated"
                class="rounded-full bg-fuchsia-100 px-2 py-0.5 text-[11px] font-medium text-fuchsia-700 dark:bg-fuchsia-950/60 dark:text-fuchsia-300"
              >
                {{ t('image_search.ai_generated') }}
              </span>
            </div>

            <section
              v-for="work in works"
              :key="work.name"
              class="space-y-2 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <h2 class="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">{{ work.name }}</h2>
                  <p v-if="work.characters.length" class="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
                    {{ t('image_search.characters', { names: work.characters.join('、') }) }}
                  </p>
                </div>
                <span
                  v-if="!work.confident"
                  class="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                >
                  {{ t('image_search.not_confident') }}
                </span>
              </div>

              <template v-if="work.vns.length">
                <p class="text-[11px] font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                  {{ t('image_search.vndb_matches') }}
                </p>
                <button
                  v-for="vn in work.vns"
                  :key="vn.id"
                  type="button"
                  class="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-neutral-200 px-2 py-2 text-left transition hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/60"
                  @click="openVn(vn)"
                >
                  <img
                    v-if="vn.image?.thumbnail || vn.image?.url"
                    :src="vn.image.thumbnail || vn.image.url"
                    alt=""
                    class="h-11 w-8 shrink-0 rounded object-cover"
                  />
                  <span
                    v-else
                    class="flex h-11 w-8 shrink-0 items-center justify-center rounded bg-neutral-100 text-neutral-400 dark:bg-neutral-800"
                  >
                    <Icon icon="lucide:image" class="h-4 w-4" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{{ vn.title }}</span>
                    <span v-if="vn.alttitle" class="block truncate text-xs text-neutral-500 dark:text-neutral-400">{{ vn.alttitle }}</span>
                    <span v-if="vn.released" class="block text-xs text-neutral-400 dark:text-neutral-500">{{ String(vn.released).slice(0, 4) }}</span>
                  </span>
                  <Icon icon="lucide:chevron-right" class="h-4 w-4 shrink-0 text-neutral-400" />
                </button>
              </template>

              <!-- VNDB 没匹配到：给一个跳转搜索的出口，别让用户卡死 -->
              <button
                v-else
                type="button"
                class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-200 px-3 py-2 text-xs text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-700 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:text-neutral-200"
                @click="searchVndb(work.name)"
              >
                <Icon icon="lucide:search" class="h-3.5 w-3.5" />
                {{ t('image_search.search_vndb', { name: work.name }) }}
              </button>
            </section>
          </template>

          <p class="pt-1 text-center text-[11px] text-neutral-400 dark:text-neutral-500">{{ t('image_search.credits') }}</p>
        </template>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { IonPage, IonContent } from '@ionic/vue'
import { Icon } from '@iconify/vue'
import AppHeader from '@/components/AppHeader.vue'
import { searchByImage, prepareImageFile } from '@/utils/imageSearch'
import { getVnList } from '@/api/vndb'
import { translateError } from '@/utils/errorMessage'

defineOptions({ name: 'ImageSearch' })

const router = useRouter()
const { t } = useI18n()

const fileInput = ref(null)
const previewUrl = ref('')
const phase = ref('idle') // idle | recognizing | done | error
const errorMessage = ref('')
const works = ref([])
const aiGenerated = ref(false)
const lastFile = ref(null)

function pickImage() {
  fileInput.value?.click()
}

function onFileChange(event) {
  const file = event.target.files?.[0]
  // 立刻清空，否则用户重选同一张图不会触发 change
  event.target.value = ''
  if (file) runSearch(file)
}

function revokePreview() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
}

function reset() {
  revokePreview()
  phase.value = 'idle'
  errorMessage.value = ''
  works.value = []
  aiGenerated.value = false
  lastFile.value = null
}

async function runSearch(file) {
  lastFile.value = file
  revokePreview()
  phase.value = 'recognizing'
  errorMessage.value = ''
  works.value = []
  aiGenerated.value = false

  try {
    const prepared = await prepareImageFile(file)
    previewUrl.value = prepared.previewUrl

    const result = await searchByImage(prepared.blob)
    aiGenerated.value = result.ai
    works.value = result.works.map((work) => ({ ...work, vns: [], lookupFailed: false }))

    // 作品名 → VNDB 作品页：日文原名也能命中 search 过滤，单条失败不影响其它结果
    await Promise.all(
      works.value.map(async (work) => {
        try {
          const res = await getVnList(['search', '=', work.name], { results: 3 })
          work.vns = res?.results || []
        } catch {
          work.lookupFailed = true
        }
      })
    )

    phase.value = 'done'
  } catch (err) {
    phase.value = 'error'
    errorMessage.value = translateError(err, t, 'image_search.error_generic')
  }
}

function openVn(vn) {
  router.push(`/vn/${vn.id}`)
}

function searchVndb(name) {
  router.push({ path: '/browse/vn', query: { q: name } })
}

onUnmounted(revokePreview)
</script>
