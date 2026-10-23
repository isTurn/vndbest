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

        <!-- 识别来源切换：两套服务各有所长，让用户自己挑 -->
        <div class="grid grid-cols-2 gap-2 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
          <button
            v-for="option in sourceOptions"
            :key="option.value"
            type="button"
            class="cursor-pointer rounded-lg px-3 py-2 text-xs font-medium transition"
            :class="
              source === option.value
                ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-100'
                : 'text-neutral-500 dark:text-neutral-400'
            "
            @click="switchSource(option.value)"
          >
            {{ option.label }}
          </button>
        </div>

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
          <img
            :src="previewUrl"
            alt=""
            class="mx-auto max-h-[52vh] w-full cursor-zoom-in object-contain"
            @click="showFull = true"
          />
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
            class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/45 px-4 text-center text-sm text-white"
          >
            <Icon icon="eos-icons:loading" class="h-5 w-5 animate-spin" />
            <span>{{ statusText || t('image_search.recognizing') }}</span>
          </div>
        </div>

        <!-- 全屏看大图：点任意处关闭 -->
        <Teleport to="body">
          <div
            v-if="showFull && previewUrl"
            class="fixed inset-0 z-[9998] flex items-center justify-center bg-black/95 p-2"
            @click="showFull = false"
          >
            <img :src="previewUrl" alt="" class="max-h-full max-w-full cursor-zoom-out object-contain" />
            <button
              type="button"
              class="absolute right-4 top-[calc(1rem+var(--safe-area-inset-top,env(safe-area-inset-top,0px)))] grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-white/15 text-white backdrop-blur-sm"
              @click.stop="showFull = false"
            >
              <Icon icon="lucide:x" class="h-4 w-4" />
            </button>
          </div>
        </Teleport>

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

        <!-- SearchBox 结果：作品卡 + 角色 + AI 总结 -->
        <template v-if="phase === 'done' && source === 'searchbox'">
          <div
            v-if="!sbWorks.length && !sbCharacters.length && !sbAnswer"
            class="rounded-xl border border-neutral-200 px-4 py-10 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
          >
            {{ t('image_search.no_result') }}
          </div>

          <template v-else>
            <section v-if="sbWorks.length" class="space-y-2">
              <p class="text-[11px] font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                {{ t('image_search.vndb_matches') }}
              </p>
              <button
                v-for="work in sbWorks"
                :key="work.id"
                type="button"
                class="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 bg-white p-2.5 text-left transition hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/60"
                @click="openSearchBoxWork(work)"
              >
                <img
                  v-if="work.image"
                  :src="work.image"
                  alt=""
                  class="h-14 w-10 shrink-0 rounded object-cover"
                />
                <span
                  v-else
                  class="flex h-14 w-10 shrink-0 items-center justify-center rounded bg-neutral-100 text-neutral-400 dark:bg-neutral-800"
                >
                  <Icon icon="lucide:image" class="h-4 w-4" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">{{ work.title }}</span>
                  <span v-if="work.subtitle" class="mt-0.5 block truncate text-xs text-neutral-500 dark:text-neutral-400">{{ work.subtitle }}</span>
                  <span v-if="work.tags.length" class="mt-1 flex flex-wrap gap-1">
                    <span
                      v-for="tag in work.tags.slice(0, 4)"
                      :key="tag"
                      class="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                    >
                      {{ tag }}
                    </span>
                  </span>
                </span>
                <Icon icon="lucide:chevron-right" class="h-4 w-4 shrink-0 text-neutral-400" />
              </button>
            </section>

            <section v-if="sbCharacters.length" class="space-y-2">
              <p class="text-[11px] font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                {{ t('image_search.searchbox_characters') }}
              </p>
              <div
                v-for="character in sbCharacters"
                :key="character.title"
                class="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-2.5 dark:border-neutral-700 dark:bg-neutral-900"
              >
                <img
                  v-if="character.image"
                  :src="character.image"
                  alt=""
                  class="h-10 w-10 shrink-0 rounded object-cover"
                />
                <span
                  v-else
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-neutral-100 text-neutral-400 dark:bg-neutral-800"
                >
                  <Icon icon="lucide:user" class="h-4 w-4" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{{ character.title }}</span>
                  <span v-if="character.subtitle" class="mt-0.5 block truncate text-xs text-neutral-500 dark:text-neutral-400">{{ character.subtitle }}</span>
                </span>
              </div>
            </section>

            <section v-if="sbAnswer" class="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900">
              <p class="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">{{ sbAnswer }}</p>
            </section>

            <p class="pt-1 text-center text-[11px] text-neutral-400 dark:text-neutral-500">
              {{ t('image_search.searchbox_credits') }}
            </p>
          </template>
        </template>

        <!-- AnimeTrace 结果（原逻辑保持不变） -->
        <template v-if="phase === 'done' && source === 'animetrace'">
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
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { IonPage, IonContent } from '@ionic/vue'
import { Icon } from '@iconify/vue'
import AppHeader from '@/components/AppHeader.vue'
import { searchByImage, prepareImageFile } from '@/utils/imageSearch'
import { searchByImageOnSearchBox, prepareImageForSearchBox } from '@/utils/searchboxSearch'
import { getVnList } from '@/api/vndb'
import { translateError } from '@/utils/errorMessage'
import { pendingSharedImage } from '@/utils/sharedImage'

defineOptions({ name: 'ImageSearch' })

const router = useRouter()
const { t } = useI18n()

const SOURCE_KEY = 'vndb_image_search_source'

const fileInput = ref(null)
const previewUrl = ref('')
const phase = ref('idle') // idle | recognizing | done | error
const errorMessage = ref('')
const statusText = ref('')
const works = ref([])
const aiGenerated = ref(false)
const lastFile = ref(null)
const showFull = ref(false)

// SearchBox 的结果单独放：结构是「VNDB 作品卡 + 角色 + 一段 AI 总结」
const sbWorks = ref([])
const sbCharacters = ref([])
const sbAnswer = ref('')

/** 识别来源：animetrace（快、轻） / searchbox（慢但信息全，带 VNDB 链接与角色） */
const source = ref('animetrace')

const sourceOptions = [
  { value: 'animetrace', label: 'AnimeTrace' },
  { value: 'searchbox', label: 'SearchBox' }
]

function switchSource(value) {
  if (source.value === value) return
  source.value = value
  try {
    localStorage.setItem(SOURCE_KEY, value)
  } catch {
    /* 隐私模式下 localStorage 可能不可用，忽略 */
  }
  // 换了服务，旧结果就别留着了，避免张冠李戴
  reset()
}

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

function clearResults() {
  works.value = []
  aiGenerated.value = false
  sbWorks.value = []
  sbCharacters.value = []
  sbAnswer.value = ''
}

function reset() {
  revokePreview()
  showFull.value = false
  phase.value = 'idle'
  errorMessage.value = ''
  statusText.value = ''
  lastFile.value = null
  clearResults()
}

async function runSearch(file) {
  lastFile.value = file
  showFull.value = false
  revokePreview()
  phase.value = 'recognizing'
  errorMessage.value = ''
  statusText.value = ''
  clearResults()

  try {
    if (source.value === 'searchbox') {
      await runSearchBox(file)
    } else {
      await runAnimeTrace(file)
    }
    phase.value = 'done'
  } catch (err) {
    phase.value = 'error'
    errorMessage.value = translateError(err, t, 'image_search.error_generic')
  }
}

async function runAnimeTrace(file) {
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
}

async function runSearchBox(file) {
  const prepared = await prepareImageForSearchBox(file)
  previewUrl.value = prepared.previewUrl

  // SearchBox 是个带工具的大模型，会先把「正在识别图片…」之类的进度推过来
  const result = await searchByImageOnSearchBox(prepared.dataUrl, {
    onStatus: (text) => {
      statusText.value = text
    }
  })
  sbWorks.value = result.works
  sbCharacters.value = result.characters
  sbAnswer.value = result.answer
}

function openVn(vn) {
  router.push(`/vn/${vn.id}`)
}

/** SearchBox 返回的条目本身就是 VNDB 链接，直接跳详情 */
function openSearchBoxWork(work) {
  if (work.id) router.push(`/vn/${work.id}`)
}

function searchVndb(name) {
  router.push({ path: '/browse/vn', query: { q: name } })
}

/**
 * 别的应用分享图片进来（相册 / QQ 等）：直接拿这张图开始识别。
 * 取走后立刻清空 pendingSharedImage，避免返回本页时又重跑一遍。
 */
function takeSharedImage() {
  const file = pendingSharedImage.value
  if (!file) return
  pendingSharedImage.value = null
  runSearch(file)
}

watch(pendingSharedImage, takeSharedImage)

onMounted(() => {
  try {
    const saved = localStorage.getItem(SOURCE_KEY)
    if (saved === 'searchbox' || saved === 'animetrace') source.value = saved
  } catch {
    /* ignore */
  }
  takeSharedImage()
})

onUnmounted(revokePreview)
</script>
