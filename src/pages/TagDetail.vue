<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import { CapacitorHttp } from '@capacitor/core'
import AppHeader from '@/components/AppHeader.vue'
import VnList from '@/components/VnList.vue'
import ErrorState from '@/components/ErrorState.vue'
import SkeletonCard from '@/components/SkeletonCard.vue'
import { getTagList, getVnList } from '@/api/vndb'
import { translateError } from '@/utils/errorMessage'
import { useTranslation } from '@/composables/useTranslation'
import { IonPage, IonContent } from '@ionic/vue'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const { translateTagName } = useTranslation()

const tagId = computed(() => (typeof route.params.id === 'string' ? route.params.id : ''))

const tag = ref(null)
const tagLoading = ref(true)
const tagError = ref('')

const vns = ref([])
const vnsLoading = ref(true)
const vnsError = ref('')
const vnsHasMore = ref(false)
const page = ref(1)
const RESULTS_PER_PAGE = 25
// vn 端点支持的排序字段（length / lastmod / added 在 /vn 上会 400）
const sortOptions = [
  { value: 'rating', label: 'list.sort.vote' },
  { value: 'votecount', label: 'list.sort.votecount' },
  { value: 'released', label: 'list.sort.released' },
  { value: 'title', label: 'list.sort.title' }
]
const sortBy = ref('rating')
const reverse = ref(true)

// 简介翻译（与 TagChip 一致，走 hekinyan 翻译服务，用户主动点击才请求）
const translated = ref('')
const translating = ref(false)
const translateError2 = ref('')
const translateSource = ref('')

const categoryClass = computed(() => {
  const c = tag.value?.category
  const map = {
    cont: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/30 dark:border-blue-800/50',
    tech: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/30 dark:border-amber-800/50',
    ero: 'text-rose-600 bg-rose-50 border-rose-200 dark:text-rose-400 dark:bg-rose-900/30 dark:border-rose-800/50'
  }
  return map[c] || 'text-neutral-600 bg-neutral-50 border-neutral-200 dark:text-neutral-400 dark:bg-neutral-800 dark:border-neutral-700'
})

// VNDB 的简介是 BBCode，去掉标记后按纯文本展示
function cleanDescription(desc) {
  if (!desc) return ''
  return desc
    .replace(/\[quote\][\s\S]*?\[\/quote\]/gi, ' ')
    .replace(/\[url=.*?\](.*?)\[\/url\]/gi, '$1')
    .replace(/\[img\].*?\[\/img\]/gi, ' ')
    .replace(/\[\/?.+?\]/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const descriptionText = computed(() => cleanDescription(tag.value?.description))

async function fetchTag() {
  if (!tagId.value) return
  tagLoading.value = true
  tagError.value = ''
  translated.value = ''
  translateSource.value = ''
  try {
    const res = await getTagList(['id', '=', tagId.value], {
      fields: 'id, name, description, category, vn_count, aliases, applicable, searchable',
      results: 1
    })
    const item = res?.results?.[0]
    if (item) {
      tag.value = item
    } else {
      tagError.value = t('vn.not_found')
    }
  } catch (err) {
    console.error('获取标签详情失败:', err)
    tagError.value = translateError(err, t, 'common.error')
  } finally {
    tagLoading.value = false
  }
}

async function fetchVns(reset = true) {
  if (!tagId.value) return
  if (reset) {
    page.value = 1
    vns.value = []
    vnsHasMore.value = false
  }
  vnsLoading.value = true
  vnsError.value = ''
  try {
    const res = await getVnList(['tag', '=', tagId.value], {
      page: page.value,
      results: RESULTS_PER_PAGE,
      sort: sortBy.value,
      reverse: reverse.value
    })
    const list = res?.results || []
    vns.value = reset ? list : [...vns.value, ...list]
    vnsHasMore.value = !!res?.more
  } catch (err) {
    console.error('获取标签作品失败:', err)
    vnsError.value = translateError(err, t, 'list.error_fetching')
  } finally {
    vnsLoading.value = false
  }
}

function loadMore() {
  if (vnsLoading.value || !vnsHasMore.value) return
  page.value += 1
  fetchVns(false)
}

function handleSortChange(s) {
  sortBy.value = s
  fetchVns(true)
}

function handleReverseChange(r) {
  reverse.value = r
  fetchVns(true)
}

async function translateDescription() {
  const sourceText = descriptionText.value
  if (!sourceText || translating.value) return
  if (translated.value && translateSource.value === sourceText) {
    translated.value = ''
    translateSource.value = ''
    return
  }
  translating.value = true
  translateError2.value = ''
  try {
    const response = await CapacitorHttp.post({
      url: 'https://workers.hekinyan.vip/v1/translate',
      headers: { 'Content-Type': 'application/json' },
      data: {
        locale: locale.value,
        messages: [{ role: 'user', content: sourceText }]
      }
    })
    const content = response?.data?.choices?.[0]?.message?.content?.trim()
    if (!content) throw new Error(t('vn.translation.empty'))
    translated.value = content
    translateSource.value = sourceText
  } catch (err) {
    console.error('翻译标签简介失败:', err)
    translateError2.value = err?.response?.data?.error || err?.message || t('vn.translation.failed')
  } finally {
    translating.value = false
  }
}

watch(
  tagId,
  (id) => {
    if (!id) return
    fetchTag()
    fetchVns(true)
  },
  { immediate: true }
)

function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace('/browse/tags')
}
</script>

<template>
  <ion-page>
    <ion-content>
      <div class="page-container space-y-4">
        <AppHeader
          mode="detail"
          :title="tag ? translateTagName(tag.name) : t('tag.detail')"
          :subtitle="tagId"
          :on-back="goBack"
        />

        <!-- 加载 -->
        <div v-if="tagLoading" class="flex justify-center py-16">
          <Icon icon="eos-icons:loading" class="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
        </div>

        <!-- 错误 -->
        <ErrorState
          v-else-if="tagError"
          :message="tagError"
          @retry="fetchTag"
        />

        <template v-else-if="tag">
          <!-- 标签抬头 -->
          <div class="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-xl font-black tracking-tight text-neutral-900 dark:text-neutral-100">
                {{ translateTagName(tag.name) }}
              </h2>
              <span
                v-if="tag.category"
                class="shrink-0 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase"
                :class="categoryClass"
              >
                {{ t(`metadata.tag_category.${tag.category}`, tag.category) }}
              </span>
            </div>

            <div class="flex flex-wrap items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
              <span class="inline-flex items-center gap-1 rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 font-bold">
                <Icon icon="lucide:book-open" class="h-3 w-3" />
                {{ t('common.count_vn', { count: tag.vn_count }) }}
              </span>
              <span class="font-mono text-neutral-400 dark:text-neutral-500">{{ tag.id }}</span>
            </div>

            <!-- 别名 -->
            <div v-if="tag.aliases?.length" class="flex flex-wrap gap-1.5">
              <span
                v-for="alias in tag.aliases"
                :key="alias"
                class="rounded-md bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-600 dark:text-neutral-400"
              >
                {{ alias }}
              </span>
            </div>

            <!-- 简介 -->
            <div v-if="descriptionText" class="space-y-2 pt-1">
              <div class="flex items-center justify-between gap-2">
                <span class="text-[11px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                  {{ t('vn.description') }}
                </span>
                <button
                  @click="translateDescription"
                  :disabled="translating"
                  class="inline-flex items-center gap-1 rounded-full border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-1 text-[10px] font-semibold text-neutral-600 dark:text-neutral-300 transition hover:border-neutral-300 dark:hover:border-neutral-600 disabled:opacity-50 cursor-pointer"
                >
                  <Icon :icon="translating ? 'eos-icons:loading' : 'lucide:languages'" class="h-3 w-3" />
                  {{ translated ? t('vn.translation.retranslate') : t('vn.translation.action') }}
                </button>
              </div>
              <p class="whitespace-pre-wrap text-[12px] leading-relaxed text-neutral-600 dark:text-neutral-400">
                {{ descriptionText }}
              </p>
              <div
                v-if="translated"
                class="rounded-lg border border-violet-200 dark:border-violet-800/50 bg-violet-50/60 dark:bg-violet-900/20 p-3"
              >
                <p class="whitespace-pre-wrap text-[12px] leading-relaxed text-violet-800 dark:text-violet-300">
                  {{ translated }}
                </p>
              </div>
              <p v-else-if="translateError2" class="text-[11px] text-red-500">{{ translateError2 }}</p>
            </div>
          </div>

          <!-- 作品列表 -->
          <div class="space-y-3">
            <h3 class="text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 px-1">
              {{ t('tag.related_vns') }}
            </h3>

            <ErrorState
              v-if="vnsError && vns.length === 0"
              :message="vnsError"
              @retry="fetchVns(true)"
            />
            <SkeletonCard v-else-if="vnsLoading && vns.length === 0" layout="list" :count="6" />
            <div
              v-else-if="vns.length === 0"
              class="py-10 text-center text-xs text-neutral-400 dark:text-neutral-500"
            >
              {{ t('tag.no_results') }}
            </div>
            <VnList
              v-else
              :items="vns"
              :is-loading="vnsLoading"
              :has-more="vnsHasMore"
              :sort-by="sortBy"
              :reverse="reverse"
              :custom-sort-options="sortOptions"
              default-layout="list"
              title-mode="ja-romaji"
              storage-key="vndb_tag_vn_layout"
              @load-more="loadMore"
              @sort-change="handleSortChange"
              @reverse-change="handleReverseChange"
            />
          </div>
        </template>
      </div>
    </ion-content>
  </ion-page>
</template>
