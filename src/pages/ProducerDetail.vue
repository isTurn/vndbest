<script setup>
import { ref, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import AppHeader from '@/components/AppHeader.vue'
import { getVnList, getProducerDetail } from '@/api/vndb'
import VnList from '@/components/VnList.vue'
import LanguageFlag from '@/components/LanguageFlag.vue'
import { useToast } from '@/composables/useToast'
import { useFavorites } from '@/composables/useFavorites'
import { fetchProducerPage, getCachedProducerPage, clearProducerPageCache, relationCodeOf } from '@/utils/producerInfo'
import { IonPage, IonContent } from '@ionic/vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { showToast } = useToast()
const { isFavorite, toggleFavorite } = useFavorites()

const producerId = ref(route.params.id)
const producer = ref(null)
const isProducerLoading = ref(true)

const isCurrentProducerFavorite = computed(() => {
  return isFavorite(producer.value?.id)
})

function handleToggleProducerFavorite() {
  if (!producer.value?.id) return
  const isFav = toggleFavorite({
    id: producer.value.id,
    type: 'producer',
    title: producer.value.name || '',
    subtitle: producer.value.original || producer.value.id,
    extra: {
      type: producer.value.type,
      lang: producer.value.lang
    }
  })
  showToast(isFav ? t('common.favorite_added') : t('common.favorite_removed'), isFav ? 'success' : 'info')
}

const items = ref([])
const isLoading = ref(true)
const hasMore = ref(false)
const page = ref(1)
const resultsPerPage = 20

// 排序状态
const sortBy = ref('released')
const reverse = ref(true)

async function fetchProducerInfo() {
  isProducerLoading.value = true
  try {
    const res = await getProducerDetail(producerId.value)
    if (res && res.results && res.results.length > 0) {
      producer.value = res.results[0]
    }
  } catch (err) {
    console.error('获取会社详情失败:', err)
  } finally {
    isProducerLoading.value = false
  }
}

async function fetchList(reset = true) {
  if (reset) {
    page.value = 1
    items.value = []
  }

  isLoading.value = true
  try {
    const filters = ['developer', '=', ['id', '=', producerId.value]]
    const res = await getVnList(filters, {
      page: page.value,
      results: resultsPerPage,
      sort: sortBy.value,
      reverse: reverse.value
    })

    if (res && res.results) {
      if (reset) {
        items.value = res.results
      } else {
        items.value = [...items.value, ...res.results]
      }
      hasMore.value = res.more || false
    }
  } catch (err) {
    console.error('获取开发商VN列表失败:', err)
  } finally {
    isLoading.value = false
  }
}

async function loadMore() {
  if (isLoading.value || !hasMore.value) return
  page.value += 1
  await fetchList(false)
}

function handleSortChange(s) {
  sortBy.value = s
  fetchList(true)
}

function handleReverseChange(r) {
  reverse.value = r
  fetchList(true)
}

// ── 折叠区：会社信息（别名 / 类型 / 语言 / 官网 / 关联会社） ──────────────
const infoExpanded = ref(false)

// ── 关联会社：Kana API 没有 producer relations，只能解析 vndb.org 页面 ──────
const pageInfo = ref(null)
const pageLoading = ref(false)
const pageError = ref('')

const relations = computed(() => {
  const list = pageInfo.value?.relations || []
  return list.map((r) => {
    const code = relationCodeOf(r.relationLabel)
    return {
      ...r,
      code,
      label: code ? t(`producer.relation.${code}`) : r.relationLabel
    }
  })
})

// 按关系类型分组，保持 PRODUCER_RELATION 的固定顺序
const relationGroups = computed(() => {
  const order = ['old', 'new', 'spa', 'ori', 'sub', 'par', 'imp', 'ipa']
  const groups = new Map()
  for (const r of relations.value) {
    const key = r.code || r.relationLabel
    if (!groups.has(key)) groups.set(key, { key, label: r.label, items: [] })
    groups.get(key).items.push(r)
  }
  return [...groups.values()].sort((a, b) => {
    const ai = order.indexOf(a.key)
    const bi = order.indexOf(b.key)
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
  })
})

const aliasesText = computed(() => {
  const fromApi = Array.isArray(producer.value?.aliases) ? producer.value.aliases.filter(Boolean) : []
  const fromPage = pageInfo.value?.alias ? [pageInfo.value.alias] : []
  return [...new Set([...fromApi, ...fromPage])]
})

async function loadProducerPage(force = false) {
  const id = producerId.value
  if (!id) return
  if (force) clearProducerPageCache(id)
  const cached = !force ? getCachedProducerPage(id) : null
  if (cached) {
    pageInfo.value = cached
    pageError.value = ''
    return
  }
  pageLoading.value = true
  pageError.value = ''
  try {
    const res = await fetchProducerPage(id, { useCache: !force })
    if (res.ok && res.page) {
      pageInfo.value = res.page
    } else {
      pageError.value = res.error || 'UNKNOWN'
    }
  } catch (e) {
    pageError.value = e?.message || String(e)
  } finally {
    pageLoading.value = false
  }
}

function toggleInfo() {
  infoExpanded.value = !infoExpanded.value
  if (infoExpanded.value && !pageInfo.value && !pageLoading.value) {
    loadProducerPage(false)
  }
}

// ── 关联会社弹出小卡 ────────────────────────────────────────────────────
const relationCard = ref(null)
const relationCardLoading = ref(false)

async function openRelationCard(rel) {
  relationCard.value = {
    id: rel.id,
    name: rel.name,
    original: rel.original,
    label: rel.label,
    type: '',
    lang: '',
    loading: true
  }
  relationCardLoading.value = true
  try {
    const res = await getProducerDetail(rel.id)
    const p = res?.results?.[0]
    if (p && relationCard.value && relationCard.value.id === rel.id) {
      relationCard.value = {
        ...relationCard.value,
        name: p.name || relationCard.value.name,
        original: p.original || relationCard.value.original,
        type: p.type || '',
        lang: p.lang || '',
        loading: false
      }
    } else if (relationCard.value) {
      relationCard.value.loading = false
    }
  } catch (e) {
    if (relationCard.value) relationCard.value.loading = false
  } finally {
    relationCardLoading.value = false
  }
}

function closeRelationCard() {
  relationCard.value = null
}

function goRelationDetail() {
  const id = relationCard.value?.id
  if (!id) return
  closeRelationCard()
  router.push(`/producer/${id}`)
}

// 当前已加载的制作商 ID，用于避免从子页面返回时重复加载
const currentLoadedId = ref(null)

watch(
  () => route.params.id,
  (newId) => {
    if (newId) {
      // 如果 ID 没变（从子页面返回），跳过重新加载以保留数据/位置状态
      if (newId === currentLoadedId.value) return
      currentLoadedId.value = newId
      producerId.value = newId
      // 切换会社时重置折叠区与关联会社数据
      infoExpanded.value = false
      pageInfo.value = null
      pageError.value = ''
      relationCard.value = null
      fetchProducerInfo()
      fetchList(true)
    }
  },
  { immediate: true }
)

const sortOptions = [
  { value: 'released', label: 'vn.released' },
  { value: 'rating', label: 'vn.rating' },
  { value: 'title', label: 'list.sort.title' }
]

const getProducerTypeLabel = (type) => {
  return t(`producer_type.${type}`, type)
}

function cleanDescription(text) {
  return String(text || '').replace(/\[\/?\w+.*?\]/g, '')
}
</script>

<template>
  <ion-page>
  <ion-content>
  <div class="page-container space-y-6">
    <AppHeader
      mode="detail"
      :title="producer?.name || t('vn.producer_details')"
      :subtitle="String(producerId)"
    >
      <template #actions>
        <button
          v-if="producer"
          type="button"
          @click="handleToggleProducerFavorite"
          class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-xs hover:bg-neutral-50 dark:hover:bg-neutral-700 active:scale-95 transition cursor-pointer"
          :title="isCurrentProducerFavorite ? t('favorites.remove') : t('favorites.title')"
        >
          <Icon
            :icon="isCurrentProducerFavorite ? 'lucide:heart' : 'lucide:heart'"
            class="h-4 w-4 transition"
            :class="isCurrentProducerFavorite ? 'fill-red-500 text-red-500' : 'text-neutral-500 dark:text-neutral-400'"
          />
        </button>
      </template>
    </AppHeader>

    <!-- Producer Info Section -->
    <div v-if="isProducerLoading" class="flex justify-center py-10">
      <Icon icon="eos-icons:loading" class="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
    </div>
    <div v-else-if="producer" class="space-y-4">
      <div class="flex items-start justify-between gap-4">
        <div class="space-y-1 min-w-0">
          <h2 class="text-2xl font-black tracking-tight text-neutral-900 dark:text-neutral-100">{{ producer.name }}</h2>
          <p v-if="producer.original" class="text-sm text-neutral-500 dark:text-neutral-400 font-medium">{{ producer.original }}</p>
        </div>
        <div class="flex flex-col items-end gap-2 shrink-0">
           <span class="inline-flex items-center rounded-full bg-neutral-100 dark:bg-neutral-800 px-2.5 py-0.5 text-xs font-semibold text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700">
            {{ getProducerTypeLabel(producer.type) }}
          </span>
          <span v-if="producer.lang" class="inline-flex items-center gap-1 text-xs font-bold text-neutral-400 dark:text-neutral-500 tracking-tighter bg-neutral-50 dark:bg-neutral-800 px-2 py-0.5 rounded border border-neutral-100 dark:border-neutral-700">
            <LanguageFlag :lang="producer.lang" class="h-3 w-3" />
            <span>{{ t(`metadata.lang.${producer.lang}`, producer.lang) }}</span>
          </span>
        </div>
      </div>

      <!-- 折叠区：会社信息（别名 / 类型 / 语言 / 官网 / 关联会社） -->
      <div class="rounded-2xl border border-neutral-200 dark:border-neutral-700 overflow-hidden bg-white dark:bg-neutral-900">
        <button
          type="button"
          class="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/60 transition-colors cursor-pointer"
          @click="toggleInfo"
        >
          <Icon
            :icon="infoExpanded ? 'lucide:chevron-down' : 'lucide:chevron-right'"
            class="h-4 w-4 shrink-0 text-neutral-400 dark:text-neutral-500"
          />
          <Icon icon="lucide:info" class="h-4 w-4 shrink-0 text-neutral-500 dark:text-neutral-400" />
          <span class="text-sm font-bold text-neutral-900 dark:text-neutral-100">{{ t('producer.info_title') }}</span>
          <span class="ml-auto text-[10px] font-medium text-neutral-400 dark:text-neutral-500 truncate hidden sm:inline">{{ t('producer.info_hint') }}</span>
          <span
            v-if="relations.length"
            class="ml-1 shrink-0 rounded-full bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-[10px] font-bold text-neutral-500 dark:text-neutral-400"
          >{{ relations.length }}</span>
        </button>

        <div v-show="infoExpanded" class="px-3 pb-3 pt-1 space-y-3 border-t border-neutral-100 dark:border-neutral-800">
          <!-- 别名 -->
          <div class="flex items-start gap-2">
            <span class="w-16 shrink-0 pt-0.5 text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">{{ t('producer.aliases') }}</span>
            <div class="min-w-0 flex-1 flex flex-wrap gap-1">
              <span
                v-for="a in aliasesText"
                :key="a"
                class="rounded-md bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-600 dark:text-neutral-300 break-all"
              >{{ a }}</span>
              <span v-if="!aliasesText.length" class="text-[11px] text-neutral-400 dark:text-neutral-500">—</span>
            </div>
          </div>

          <!-- 类型 + 主语言 -->
          <div class="flex items-start gap-2">
            <span class="w-16 shrink-0 pt-0.5 text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">{{ t('producer.type') }}</span>
            <div class="min-w-0 flex-1 flex flex-wrap items-center gap-1.5">
              <span class="rounded-md bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-600 dark:text-neutral-300">{{ getProducerTypeLabel(producer.type) }}</span>
              <span class="text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 ml-2">{{ t('producer.lang') }}</span>
              <span v-if="producer.lang" class="inline-flex items-center gap-1 rounded-md bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-600 dark:text-neutral-300">
                <LanguageFlag :lang="producer.lang" class="h-3 w-3" />
                {{ t(`metadata.lang.${producer.lang}`, producer.lang) }}
              </span>
              <span v-else class="text-[11px] text-neutral-400 dark:text-neutral-500">—</span>
            </div>
          </div>

          <!-- 官网 / 外链 -->
          <div class="flex items-start gap-2">
            <span class="w-16 shrink-0 pt-0.5 text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">{{ t('producer.website') }}</span>
            <div class="min-w-0 flex-1 flex flex-wrap gap-1.5">
              <a
                v-for="link in producer.extlinks || []"
                :key="link.url"
                :href="link.url"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1 rounded-md bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 px-1.5 py-0.5 text-[11px] font-medium text-neutral-700 dark:text-neutral-300 hover:border-neutral-400 dark:hover:border-neutral-500 transition-colors"
              >
                <Icon icon="lucide:external-link" class="h-3 w-3 text-neutral-400 dark:text-neutral-500" />
                {{ link.label }}
              </a>
              <span v-if="!producer.extlinks?.length" class="text-[11px] text-neutral-400 dark:text-neutral-500">—</span>
            </div>
          </div>

          <!-- 关联会社 -->
          <div class="flex items-start gap-2">
            <span class="w-16 shrink-0 pt-0.5 text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">{{ t('producer.relations') }}</span>
            <div class="min-w-0 flex-1 space-y-1.5">
              <div v-if="pageLoading" class="flex items-center gap-1.5 text-[11px] text-neutral-400 dark:text-neutral-500">
                <Icon icon="lucide:loader-2" class="h-3 w-3 animate-spin" />
                {{ t('producer.relations_loading') }}
              </div>
              <div v-else-if="pageError" class="space-y-1">
                <p class="text-[11px] text-amber-600 dark:text-amber-400 break-all">{{ t('producer.relations_error', { error: pageError }) }}</p>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-md border border-neutral-200 dark:border-neutral-700 px-1.5 py-0.5 text-[11px] text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer"
                  @click="loadProducerPage(true)"
                >
                  <Icon icon="lucide:refresh-cw" class="h-3 w-3" />
                  {{ t('producer.relations_refresh') }}
                </button>
              </div>
              <template v-else-if="relationGroups.length">
                <div v-for="group in relationGroups" :key="group.key" class="flex flex-wrap items-center gap-1">
                  <span class="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mr-0.5">{{ group.label }}</span>
                  <button
                    v-for="rel in group.items"
                    :key="rel.id"
                    type="button"
                    class="inline-flex items-center gap-1 rounded-full border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-700 dark:text-neutral-300 hover:border-neutral-400 dark:hover:border-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-700 active:scale-95 transition cursor-pointer"
                    @click="openRelationCard(rel)"
                  >
                    {{ rel.name }}
                  </button>
                </div>
              </template>
              <span v-else class="text-[11px] text-neutral-400 dark:text-neutral-500">{{ t('producer.relations_empty') }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Description -->
      <div v-if="producer.description" class="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700">
        <p class="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed whitespace-pre-wrap">
          {{ cleanDescription(producer.description) }}
        </p>
      </div>
    </div>

    <!-- Works List Section -->
    <div class="space-y-4 pt-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="h-4 w-1 rounded-full bg-neutral-900 dark:bg-neutral-100"></div>
          <h3 class="text-sm font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider">{{ t('producer.developed_works') }}</h3>
        </div>
        <span class="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full">
          {{ items.length }}{{ hasMore ? '+' : '' }}
        </span>
      </div>

      <VnList
        :items="items"
        :is-loading="isLoading"
        :has-more="hasMore"
        :sort-by="sortBy"
        :reverse="reverse"
        :custom-sort-options="sortOptions"
        storage-key="vndb_producer_layout"
        @load-more="loadMore"
        @sort-change="handleSortChange"
        @reverse-change="handleReverseChange"
      />
    </div>
  </div>

  <!-- 关联会社弹出小卡 -->
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="relationCard"
        class="fixed inset-0 z-[210] flex items-end sm:items-center justify-center"
        @click.self="closeRelationCard"
      >
        <div class="absolute inset-0 bg-black/40" @click="closeRelationCard"></div>
        <div class="relative z-10 w-full sm:w-[380px] bg-white dark:bg-neutral-900 sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200">
          <div class="flex items-center justify-between px-4 py-3 border-b border-neutral-100 dark:border-neutral-800">
            <div class="flex items-center gap-2 min-w-0">
              <Icon icon="lucide:building-2" class="h-4 w-4 shrink-0 text-neutral-400 dark:text-neutral-500" />
              <h3 class="text-sm font-bold text-neutral-900 dark:text-neutral-100 truncate">{{ t('producer.relations') }}</h3>
            </div>
            <button
              type="button"
              class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
              @click="closeRelationCard"
            >
              <Icon icon="lucide:x" class="h-4 w-4" />
            </button>
          </div>

          <div class="px-4 py-3 space-y-2">
            <p v-if="relationCard.label" class="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">{{ relationCard.label }}</p>
            <h4 class="text-lg font-black leading-tight text-neutral-900 dark:text-neutral-100 break-words">{{ relationCard.name || relationCard.id }}</h4>
            <p v-if="relationCard.original" class="text-xs text-neutral-500 dark:text-neutral-400 break-words">{{ relationCard.original }}</p>

            <div class="flex flex-wrap items-center gap-1.5 pt-1">
              <span v-if="relationCard.loading" class="inline-flex items-center gap-1 text-[11px] text-neutral-400 dark:text-neutral-500">
                <Icon icon="lucide:loader-2" class="h-3 w-3 animate-spin" />
                {{ t('common.loading') }}
              </span>
              <template v-else>
                <span v-if="relationCard.type" class="rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">{{ getProducerTypeLabel(relationCard.type) }}</span>
                <span v-if="relationCard.lang" class="inline-flex items-center gap-1 rounded-full bg-neutral-50 dark:bg-neutral-800 px-2 py-0.5 text-[11px] font-bold text-neutral-400 dark:text-neutral-500">
                  <LanguageFlag :lang="relationCard.lang" class="h-3 w-3" />
                  {{ t(`metadata.lang.${relationCard.lang}`, relationCard.lang) }}
                </span>
                <span class="rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-[11px] font-mono text-neutral-500 dark:text-neutral-400">{{ relationCard.id }}</span>
              </template>
            </div>
          </div>

          <div class="flex items-center gap-2 px-4 py-3 border-t border-neutral-100 dark:border-neutral-800">
            <button
              type="button"
              class="flex-1 rounded-xl border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer"
              @click="closeRelationCard"
            >{{ t('producer.close') }}</button>
            <button
              type="button"
              class="flex-1 rounded-xl bg-neutral-900 dark:bg-neutral-100 px-3 py-2 text-sm font-bold text-white dark:text-neutral-900 hover:opacity-90 cursor-pointer"
              @click="goRelationDetail"
            >{{ t('producer.view_detail') }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
  </ion-content>
  </ion-page>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
