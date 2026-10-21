<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import { CapacitorHttp } from '@capacitor/core'
import AppHeader from '@/components/AppHeader.vue'
import ErrorState from '@/components/ErrorState.vue'
import SkeletonCard from '@/components/SkeletonCard.vue'
import { getTraitList, getCharacterList } from '@/api/vndb'
import { translateError } from '@/utils/errorMessage'
import { useTranslation } from '@/composables/useTranslation'
import { useImageLoader } from '@/composables/useImageLoader'
import { SEX_ICONS } from '@/icons/icon-names'
import { IonPage, IonContent, IonImg, IonSpinner } from '@ionic/vue'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const { translateTraitName } = useTranslation()
const imageLoader = useImageLoader()

const traitId = computed(() => (typeof route.params.id === 'string' ? route.params.id : ''))

const trait = ref(null)
const traitLoading = ref(true)
const traitError = ref('')

const chars = ref([])
const charsLoading = ref(true)
const charsError = ref('')
const charsHasMore = ref(false)
const page = ref(1)
const RESULTS_PER_PAGE = 24

// 简介翻译（与 TagDetail 一致：用户主动点击才请求）
const translated = ref('')
const translating = ref(false)
const translateErr = ref('')
const translateSource = ref('')

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

const descriptionText = computed(() => cleanDescription(trait.value?.description))

function getSexIcon(sex) {
  if (!Array.isArray(sex) || sex.length === 0) return ''
  // VNDB 的 sex 是 [实际性别, 表现性别]，这里只取第一个显示
  return SEX_ICONS[sex[0]] || ''
}

async function fetchTrait() {
  if (!traitId.value) return
  traitLoading.value = true
  traitError.value = ''
  translated.value = ''
  translateSource.value = ''
  try {
    // trait 端点没有单独的详情函数，用 getTraitList 精确查一条
    const res = await getTraitList(['id', '=', traitId.value], {
      fields: 'id, name, description, group_id, group_name, char_count, aliases, applicable, searchable',
      results: 1
    })
    const item = res?.results?.[0]
    if (item) {
      trait.value = item
    } else {
      traitError.value = t('vn.not_found')
    }
  } catch (err) {
    console.error('获取特征详情失败:', err)
    traitError.value = translateError(err, t, 'common.error')
  } finally {
    traitLoading.value = false
  }
}

async function fetchChars(reset = true) {
  if (!traitId.value) return
  if (reset) {
    page.value = 1
    chars.value = []
    charsHasMore.value = false
  }
  charsLoading.value = true
  charsError.value = ''
  try {
    const res = await getCharacterList(['trait', '=', traitId.value], {
      page: page.value,
      results: RESULTS_PER_PAGE
    })
    const list = res?.results || []
    chars.value = reset ? list : [...chars.value, ...list]
    charsHasMore.value = !!res?.more
  } catch (err) {
    console.error('获取特征角色失败:', err)
    charsError.value = translateError(err, t, 'list.error_fetching')
  } finally {
    charsLoading.value = false
  }
}

function loadMore() {
  if (charsLoading.value || !charsHasMore.value) return
  page.value += 1
  fetchChars(false)
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
  translateErr.value = ''
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
    console.error('翻译特征简介失败:', err)
    translateErr.value = err?.response?.data?.error || err?.message || t('vn.translation.failed')
  } finally {
    translating.value = false
  }
}

watch(
  traitId,
  (id) => {
    if (!id) return
    fetchTrait()
    fetchChars(true)
  },
  { immediate: true }
)

function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace('/browse/traits')
}

function goToCharacter(id) {
  router.push(`/character/${id}`)
}
</script>

<template>
  <ion-page>
    <ion-content>
      <div class="page-container space-y-4">
        <AppHeader
          mode="detail"
          :title="trait ? translateTraitName(trait.name) : t('trait.detail')"
          :subtitle="traitId"
          :on-back="goBack"
        />

        <div v-if="traitLoading" class="flex justify-center py-16">
          <Icon icon="eos-icons:loading" class="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
        </div>

        <ErrorState v-else-if="traitError" :message="traitError" @retry="fetchTrait" />

        <template v-else-if="trait">
          <!-- 特征抬头 -->
          <div class="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-xl font-black tracking-tight text-neutral-900 dark:text-neutral-100">
                {{ translateTraitName(trait.name) }}
              </h2>
              <span
                v-if="trait.group_name"
                class="shrink-0 inline-flex items-center gap-1 rounded-md border border-violet-200 dark:border-violet-800/50 bg-violet-50 dark:bg-violet-900/30 px-1.5 py-0.5 text-[9px] font-bold uppercase text-violet-600 dark:text-violet-400"
              >
                <Icon icon="lucide:layers" class="h-2.5 w-2.5" />
                {{ translateTraitName(trait.group_name) }}
              </span>
            </div>

            <div class="flex flex-wrap items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
              <span class="inline-flex items-center gap-1 rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 font-bold">
                <Icon icon="lucide:users-round" class="h-3 w-3" />
                {{ t('common.count_char', { count: trait.char_count }) }}
              </span>
              <span class="font-mono text-neutral-400 dark:text-neutral-500">{{ trait.id }}</span>
            </div>

            <!-- 别名 -->
            <div v-if="trait.aliases?.length" class="flex flex-wrap gap-1.5">
              <span
                v-for="alias in trait.aliases"
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
                  class="inline-flex items-center gap-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-1 text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 transition hover:border-neutral-300 dark:hover:border-neutral-600 disabled:opacity-60 cursor-pointer"
                >
                  <Icon
                    :icon="translating ? 'lucide:loader-circle' : 'lucide:languages'"
                    class="h-3.5 w-3.5"
                    :class="{ 'animate-spin': translating }"
                  />
                  {{ translating ? t('vn.translation.loading') : (translated ? t('vn.translation.retranslate') : t('vn.translation.action')) }}
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
              <p v-else-if="translateErr" class="text-[11px] text-red-500">{{ translateErr }}</p>
            </div>
          </div>

          <!-- 角色列表 -->
          <div class="space-y-3">
            <h3 class="text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 px-1">
              {{ t('trait.related_chars') }}
            </h3>

            <ErrorState
              v-if="charsError && chars.length === 0"
              :message="charsError"
              @retry="fetchChars(true)"
            />
            <SkeletonCard v-else-if="charsLoading && chars.length === 0" layout="list" :count="5" />
            <div
              v-else-if="chars.length === 0"
              class="py-10 text-center text-xs text-neutral-400 dark:text-neutral-500"
            >
              {{ t('trait.no_results') }}
            </div>

            <template v-else>
              <div class="grid grid-cols-1 gap-2">
                <div
                  v-for="item in chars"
                  :key="item.id"
                  @click="goToCharacter(item.id)"
                  class="group flex items-start gap-3 rounded-xl border border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-3 shadow-xs transition-all cursor-pointer hover:border-neutral-200 dark:hover:border-neutral-700 hover:shadow-sm active:scale-[0.99]"
                >
                  <div class="relative h-16 w-12 shrink-0 overflow-hidden rounded-lg border border-neutral-100 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900">
                    <ion-img
                      v-if="item.image?.url"
                      :key="`tr-c-${item.id}-${imageLoader.getRetryCount(`tr-c-${item.id}`)}`"
                      :src="imageLoader.resolveSrc(`tr-c-${item.id}`, item.image.url)"
                      :alt="item.name || ''"
                      class="h-full w-full object-cover transition-opacity duration-500"
                      :class="{ 'opacity-0': !imageLoader.isSuccess(`tr-c-${item.id}`) }"
                      @ionImgWillLoad="imageLoader.onWillLoad(`tr-c-${item.id}`)"
                      @ionImgDidLoad="imageLoader.onLoad(`tr-c-${item.id}`)"
                      @ionError="imageLoader.onError(`tr-c-${item.id}`)"
                    />
                    <ion-spinner
                      v-if="item.image?.url && imageLoader.isLoading(`tr-c-${item.id}`)"
                      name="crescent"
                      class="absolute inset-0 m-auto z-10 text-neutral-400"
                      style="width: 18px; height: 18px"
                    />
                    <div v-if="!item.image?.url" class="flex h-full w-full items-center justify-center">
                      <Icon icon="lucide:user" class="h-5 w-5 text-neutral-200 dark:text-neutral-600" />
                    </div>
                  </div>

                  <div class="min-w-0 flex-1 py-0.5">
                    <div class="flex items-center gap-2">
                      <h3 class="truncate text-sm font-bold text-neutral-900 dark:text-neutral-100">
                        {{ item.original || item.name }}
                      </h3>
                      <Icon
                        v-if="getSexIcon(item.sex)"
                        :icon="getSexIcon(item.sex)"
                        class="h-3 w-3 shrink-0 text-neutral-400 dark:text-neutral-500"
                      />
                    </div>
                    <p
                      v-if="item.original && item.name"
                      class="mt-0.5 truncate text-[10px] font-medium text-neutral-400 dark:text-neutral-500"
                    >
                      {{ item.name }}
                    </p>
                  </div>

                  <Icon
                    icon="lucide:chevron-right"
                    class="mt-2 h-4 w-4 shrink-0 text-neutral-300 transition-colors group-hover:text-neutral-500 dark:text-neutral-600 dark:group-hover:text-neutral-400"
                  />
                </div>
              </div>

              <!-- 触底加载 -->
              <div class="flex justify-center py-4">
                <button
                  v-if="charsHasMore"
                  @click="loadMore"
                  :disabled="charsLoading"
                  class="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 transition hover:border-neutral-300 dark:hover:border-neutral-600 disabled:opacity-50 cursor-pointer"
                >
                  <Icon
                    :icon="charsLoading ? 'lucide:loader-circle' : 'lucide:chevron-down'"
                    class="h-3.5 w-3.5"
                    :class="{ 'animate-spin': charsLoading }"
                  />
                  {{ t('common.more') }}
                </button>
                <span v-else class="text-[10px] font-bold uppercase tracking-widest text-neutral-300 dark:text-neutral-600">
                  —— {{ t('list.all_loaded') }} ——
                </span>
              </div>
            </template>
          </div>
        </template>
      </div>
    </ion-content>
  </ion-page>
</template>
