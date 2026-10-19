<script setup>
defineOptions({ name: 'Library' })

import { ref, computed, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import AppHeader from '@/components/AppHeader.vue'
import { IonPage, IonContent } from '@ionic/vue'
import { prefetchImages } from '@/utils/imagePrefetch'
import { getReleaseImageUrl } from '@/utils/releaseImage'
import { useSearchHistory } from '@/composables/useSearchHistory'
import {
  getVnList,
  getReleaseList,
  getProducerList,
  getStaffList,
  getCharacterList,
  getTagList,
  getTraitList
} from '@/api/vndb'

const router = useRouter()
const { t } = useI18n()

// 分类入口（第一项是作品/视觉小说，其余为 VNDB 其他数据库分类）
const libraryItems = computed(() => [
  {
    id: 'vn',
    title: t('library.vn'),
    icon: 'lucide:gamepad-2',
    color: 'text-blue-500',
    bgColor: 'bg-blue-50',
    path: '/browse/vn'
  },
  {
    id: 'releases',
    title: t('library.releases'),
    icon: 'lucide:package',
    color: 'text-purple-500',
    bgColor: 'bg-purple-50',
    path: '/browse/releases'
  },
  {
    id: 'producers',
    title: t('library.producers'),
    icon: 'lucide:building-2',
    color: 'text-orange-500',
    bgColor: 'bg-orange-50',
    path: '/browse/producers'
  },
  {
    id: 'staff',
    title: t('library.staff'),
    icon: 'lucide:users',
    color: 'text-green-500',
    bgColor: 'bg-green-50',
    path: '/browse/staff'
  },
  {
    id: 'characters',
    title: t('library.characters'),
    icon: 'lucide:user-circle',
    color: 'text-pink-500',
    bgColor: 'bg-pink-50',
    path: '/browse/characters'
  },
  {
    id: 'tags',
    title: t('library.tags'),
    icon: 'lucide:tags',
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-50',
    path: '/browse/tags'
  },
  {
    id: 'traits',
    title: t('library.traits'),
    icon: 'lucide:fingerprint',
    color: 'text-amber-500',
    bgColor: 'bg-amber-50',
    path: '/browse/traits'
  }
])

function navigateTo(path) {
  router.push(path)
}

// ============ 全局搜索（对齐 VNDB 官网：搜索后按类型分组展示）============
const query = ref('')
const isSearching = ref(false)
const hasSearched = ref(false)
const groups = ref([])

const {
  list: searchHistory,
  isEmpty: searchHistoryEmpty,
  add: addSearchHistory,
  remove: removeSearchHistory,
  clear: clearSearchHistory
} = useSearchHistory()

let debounceTimer = null

/** 从命中作品的 staff 里汇总职员（同一个人可能有多条 role，合并展示） */
function collectVnStaff(vnItems) {
  const map = new Map()
  vnItems.forEach((it) => {
    ;(it.staff || []).forEach((st) => {
      if (!st?.id) return
      const prev = map.get(st.id)
      if (prev) {
        if (st.role && !prev.roles.includes(st.role)) prev.roles.push(st.role)
      } else {
        map.set(st.id, { ...st, roles: st.role ? [st.role] : [] })
      }
    })
  })
  return [...map.values()].slice(0, 8)
}

/** 单个分组：并行发起多类请求，任何一类失败都不影响其他分组 */
async function runSearch(keyword) {
  const kw = keyword.trim()
  if (!kw) {
    groups.value = []
    hasSearched.value = false
    isSearching.value = false
    return
  }

  isSearching.value = true
  hasSearched.value = true

  // 第一层：作品搜索（VNDB 的 search 覆盖 title / alttitle / titles，中文名也能命中）
  // 其余类型同时并行搜索，互不阻塞
  const directTasks = [
    {
      key: 'releases',
      labelKey: 'library.releases',
      icon: 'lucide:package',
      color: 'text-purple-500',
      fetch: () => getReleaseList(['search', '=', kw], { results: 6 })
    },
    {
      key: 'producers',
      labelKey: 'library.producers',
      icon: 'lucide:building-2',
      color: 'text-orange-500',
      fetch: () => getProducerList(['search', '=', kw], { results: 6 })
    },
    {
      key: 'staff',
      labelKey: 'library.staff',
      icon: 'lucide:users',
      color: 'text-green-500',
      fetch: () => getStaffList(['search', '=', kw], { results: 6 })
    },
    {
      key: 'characters',
      labelKey: 'library.characters',
      icon: 'lucide:user-circle',
      color: 'text-pink-500',
      fetch: () => getCharacterList(['search', '=', kw], { results: 6 })
    },
    {
      key: 'tags',
      labelKey: 'library.tags',
      icon: 'lucide:tags',
      color: 'text-indigo-500',
      fetch: () => getTagList(['search', '=', kw], { results: 6 })
    },
    {
      key: 'traits',
      labelKey: 'library.traits',
      icon: 'lucide:fingerprint',
      color: 'text-amber-500',
      fetch: () => getTraitList(['search', '=', kw], { results: 6 })
    }
  ]

  const [vnSettled, directSettled] = await Promise.all([
    getVnList(['search', '=', kw], {
      results: 4,
      // developers 用于反查会社（纯文本搜索命不中会社的日文/英文名）
      // tags / staff 让「作品自己的标签和职员」也能直接出现在搜索结果里
      fields: 'id, title, alttitle, titles{lang,title}, image{url,thumbnail,sexual}, released, rating, votecount, length_minutes, developers{id,name}, staff{id,role,name,original}'
    }).then(
      (value) => ({ status: 'fulfilled', value }),
      (reason) => ({ status: 'rejected', reason })
    ),
    Promise.allSettled(directTasks.map((task) => task.fetch()))
  ])

  const vnItems = vnSettled.status === 'fulfilled' ? (vnSettled.value?.results || []) : []
  if (vnSettled.status !== 'fulfilled') {
    console.warn('[library] global search failed: vns', vnSettled.reason)
  }

  // 第二层：从命中的作品反查关联条目
  // 这是「搜中文名作品也能看到它的会社和版本」的关键——纯文本搜索命不中会社的日文/英文名
  // 同理，作品自己的角色 / 标签 / 职员也只挂在作品上，纯文本搜索命不中
  const developerIds = []
  const vnIds = []
  vnItems.forEach((it) => {
    if (it.id) vnIds.push(it.id)
    ;(it.developers || []).forEach((d) => {
      if (d?.id && !developerIds.includes(d.id)) developerIds.push(d.id)
    })
  })

  const relatedTasks = []
  if (vnIds.length) {
    relatedTasks.push({
      key: 'releases',
      labelKey: 'library.releases',
      icon: 'lucide:package',
      color: 'text-purple-500',
      // 这组是从作品反查来的版本，跳到版本搜索页按关键词搜不到同样的结果，所以不给「查看更多」
      noMore: true,
      fetch: () => getReleaseList(['or', ...vnIds.map((id) => ['vn', '=', ['id', '=', id]])], { results: 6, sort: 'released' })
    })
    // 命中作品的角色：用 vn 过滤比逐个查快，且天然带 vns 关联
    relatedTasks.push({
      key: 'vn_characters',
      labelKey: 'library.vn_characters',
      icon: 'lucide:user-circle',
      color: 'text-pink-500',
      // 这组是从作品反查来的，跳去角色搜索页按关键词搜不到，所以不给「查看更多」
      noMore: true,
      fetch: () =>
        getCharacterList(
          ['vn', '=', ['or', ...vnIds.map((id) => ['id', '=', id])]],
          { results: 8, fields: 'id, name, original, image{url,sexual}, sex, vns{id,role,spoiler}' }
        )
    })
    // 命中作品的职员：同样从 vn.staff 就地汇总（按人合并，去掉重复角色）
    relatedTasks.push({
      key: 'vn_staff',
      labelKey: 'library.vn_staff',
      icon: 'lucide:users',
      color: 'text-green-500',
      noMore: true,
      fetch: () => ({ results: collectVnStaff(vnItems) })
    })
  }
  if (developerIds.length) {
    relatedTasks.push({
      key: 'producers',
      labelKey: 'library.producers',
      icon: 'lucide:building-2',
      color: 'text-orange-500',
      fetch: () => getProducerList(['or', ...developerIds.map((id) => ['id', '=', id])], { results: 6 })
    })
  }

  const relatedSettled = await Promise.allSettled(relatedTasks.map((task) => task.fetch()))

  // 请求期间用户又改了关键词 → 丢弃这批结果
  if (keyword.trim() !== query.value.trim()) return

  const result = []

  // 作品分组（不进分类入口，只在搜索结果里出现）
  if (vnItems.length) {
    result.push({
      key: 'vns',
      labelKey: 'library.vn',
      icon: 'lucide:gamepad-2',
      color: 'text-sky-500',
      hasMore: Boolean(vnSettled.value?.more),
      items: vnItems.map((it) => normalizeItem('vns', it))
    })
  }

  // 直接命中的类型
  const directGroups = {}
  directSettled.forEach((res, idx) => {
    const task = directTasks[idx]
    if (res.status !== 'fulfilled') {
      console.warn('[library] global search failed:', task.key, res.reason)
      return
    }
    const items = res.value?.results || []
    if (!items.length) return
    directGroups[task.key] = {
      key: task.key,
      labelKey: task.labelKey,
      icon: task.icon,
      color: task.color,
      // VNDB API 不返回总数，只返回 more 标记；noMore 的分组不提供「查看更多」
      hasMore: !task.noMore && Boolean(res.value?.more),
      items: items.map((it) => normalizeItem(task.key, it))
    }
  })

  // 关联命中的类型：与直接命中按 id 合并去重（直接命中的排在前面）
  relatedSettled.forEach((res, idx) => {
    const task = relatedTasks[idx]
    if (res.status !== 'fulfilled') {
      console.warn('[library] related search failed:', task.key, res.reason)
      return
    }
    const items = res.value?.results || []
    if (!items.length) return
    const existing = directGroups[task.key]
    const normalized = items.map((it) => normalizeItem(task.key, it))
    if (!existing) {
      directGroups[task.key] = {
        key: task.key,
        labelKey: task.labelKey,
        icon: task.icon,
        color: task.color,
        hasMore: !task.noMore && Boolean(res.value?.more),
        items: normalized
      }
      return
    }
    const seen = new Set(existing.items.map((it) => it.id))
    normalized.forEach((it) => {
      if (!seen.has(it.id) && existing.items.length < 8) {
        seen.add(it.id)
        existing.items.push(it)
      }
    })
    if (!task.noMore) existing.hasMore = existing.hasMore || Boolean(res.value?.more)
  })

  // 作品角色 / 作品职员 与直接命中的角色 / 人物 会同时出现（同一批人重复两次），
  // 这里合并成一组：以作品侧为基准，把直接命中的条目按 id 去重后并进去。
  const mergeInto = (targetKey, sourceKey) => {
    const target = directGroups[targetKey]
    const source = directGroups[sourceKey]
    if (!target || !source) return
    const seen = new Set(target.items.map((it) => it.id))
    source.items.forEach((it) => {
      if (!seen.has(it.id) && target.items.length < 8) {
        seen.add(it.id)
        target.items.push(it)
      }
    })
    // 直接命中说明是「搜到了具体角色/人物」，用通用标题更准确
    target.labelKey = source.labelKey
    target.hasMore = false
    delete directGroups[sourceKey]
  }
  mergeInto('vn_characters', 'characters')
  mergeInto('vn_staff', 'staff')

  // 固定顺序：作品 → 版本 → 会社 → 角色 → 职员 → 标签 → 特征
  // characters / staff 保留在顺序里：没有命中作品时它们就是唯一来源
  const order = ['vns', 'releases', 'producers', 'vn_characters', 'characters', 'vn_staff', 'staff', 'tags', 'traits']
  order.forEach((key) => {
    if (directGroups[key]) result.push(directGroups[key])
  })

  groups.value = result
  // 搜索结果的封面也预热，避免逐条滑到才加载
  prefetchImages(
    result.flatMap((g) => (g.items || []).map((it) => it.image)).filter(Boolean),
    { priority: true }
  )
  isSearching.value = false
}

/** 从 titles 里挑一个中文标题（有中文名时优先显示，便于确认搜到的是哪部作品） */
function pickZhTitle(it) {
  const list = it.titles || []
  const zh = list.find((x) => x.lang === 'zh-Hans') || list.find((x) => x.lang === 'zh-Hant')
  return zh?.title || ''
}

/** 把不同类型的结果归一成统一渲染结构 */
function normalizeItem(type, it) {
  if (type === 'vns') {
    const zhTitle = pickZhTitle(it)
    const altTitle = it.alttitle && it.alttitle !== it.title ? it.alttitle : ''
    return {
      id: it.id,
      title: it.title || it.alttitle || it.id,
      subtitle: [zhTitle, altTitle, it.released].filter(Boolean).join(' · '),
      image: it.image?.thumbnail || it.image?.url || '',
      // 评分 / 时长作为右侧补充信息
      meta: [
        typeof it.rating === 'number' ? `${(it.rating / 10).toFixed(1)}★` : '',
        it.length_minutes ? t('library.hours_short', { hours: (it.length_minutes / 60).toFixed(0) }) : ''
      ].filter(Boolean).join(' · '),
      to: `/vn/${it.id}`
    }
  }
  if (type === 'releases') {
    // 版本：汉字/日文原名放主标题，罗马音/英文放副标题（与版本列表保持一致）
    const latin = it.alttitle && it.title && it.alttitle !== it.title ? it.title : ''
    return {
      id: it.id,
      title: it.alttitle || it.title || it.id,
      subtitle: [it.released, latin].filter(Boolean).join(' · '),
      image: getReleaseImageUrl(it) || '',
      to: `/release/${it.id}`
    }
  }
  if (type === 'producers') {
    return {
      id: it.id,
      title: it.name || it.original || it.id,
      subtitle: [it.original && it.original !== it.name ? it.original : '', it.type ? t(`metadata.producer_type.${it.type}`, it.type) : ''].filter(Boolean).join(' · '),
      to: `/producer/${it.id}`
    }
  }
  if (type === 'staff') {
    return {
      id: it.id,
      title: it.name || it.original || it.id,
      subtitle: it.original && it.original !== it.name ? it.original : '',
      to: `/staff/${it.id}`
    }
  }
  if (type === 'characters' || type === 'vn_characters') {
    return {
      id: it.id,
      title: it.name || it.original || it.id,
      subtitle: it.original && it.original !== it.name ? it.original : '',
      image: it.image?.url || '',
      to: `/character/${it.id}`
    }
  }
  if (type === 'vn_staff') {
    return {
      id: it.id,
      title: it.name || it.original || it.id,
      subtitle: [
        it.original && it.original !== it.name ? it.original : '',
        (it.roles || []).map((r) => t(`metadata.staff_role.${r}`, r)).join(' / ')
      ].filter(Boolean).join(' · '),
      to: `/staff/${it.id}`
    }
  }
  if (type === 'tags') {
    return {
      id: it.id,
      title: it.name || it.id,
      subtitle: typeof it.vn_count === 'number' ? t('library.tag_vn_count', { count: it.vn_count }) : '',
      to: `/browse/vn?tag=${encodeURIComponent(it.id)}`
    }
  }
  return {
    id: it.id,
    title: it.name || it.id,
    subtitle: typeof it.char_count === 'number' ? t('library.trait_char_count', { count: it.char_count }) : '',
    to: `/browse/characters?trait=${encodeURIComponent(it.id)}`
  }
}

function onInput(e) {
  query.value = e.target.value
}

/** 「查看更多」：带着关键词跳到对应的搜索页 */
function openFullSearch(groupKey) {
  const kw = query.value.trim()
  // 角色 / 职员：只有当这组完全来自「关键词直接命中」时才有「查看更多」，
  // 混了作品反查条目的分组已在 runSearch 里把 hasMore 关掉，所以这里可以照常跳。
  const paths = {
    vns: '/browse/vn',
    releases: '/browse/releases',
    producers: '/browse/producers',
    characters: '/browse/characters',
    staff: '/browse/staff',
    tags: '/browse/tags',
    traits: '/browse/traits'
  }
  const path = paths[groupKey]
  if (!path) return
  router.push({ path, query: kw ? { q: kw } : {} })
}

function clearQuery() {
  query.value = ''
  groups.value = []
  hasSearched.value = false
  isSearching.value = false
}

function submitSearch() {
  if (debounceTimer) clearTimeout(debounceTimer)
  addSearchHistory(query.value)
  runSearch(query.value)
}

/** 点历史词条：填回输入框并立刻搜索 */
function pickHistory(keyword) {
  if (debounceTimer) clearTimeout(debounceTimer)
  query.value = keyword
  addSearchHistory(keyword)
  runSearch(keyword)
}

/** 点搜索结果：这次搜索被用上了，记进历史 */
function openResult(item) {
  addSearchHistory(query.value)
  navigateTo(item.to)
}

// 输入防抖 400ms 自动搜索
watch(query, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (!val.trim()) {
    groups.value = []
    hasSearched.value = false
    isSearching.value = false
    return
  }
  debounceTimer = setTimeout(() => runSearch(val), 400)
})

onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})
</script>

<template>
  <ion-page>
  <ion-content>
  <div class="page-container pb-24 space-y-6">
    <AppHeader mode="page" icon="lucide:search" :title="t('library.title')" :subtitle="t('library.description')" />

    <!-- 全局搜索框 -->
    <div class="relative">
      <Icon
        v-if="!isSearching"
        icon="lucide:search"
        class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
      />
      <Icon
        v-else
        icon="eos-icons:loading"
        class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
      />
      <input
        :value="query"
        @input="onInput"
        @keydown.enter="submitSearch"
        type="text"
        :placeholder="t('library.search_placeholder')"
        class="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 pl-9 pr-9 py-2.5 text-sm text-neutral-900 dark:text-neutral-100 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/5 placeholder-neutral-400 dark:placeholder-neutral-500"
      />
      <button
        v-if="query"
        @click="clearQuery"
        class="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 cursor-pointer"
      >
        <Icon icon="lucide:x" class="h-3.5 w-3.5" />
      </button>
    </div>

    <!-- 搜索历史：仅在还没开始搜索时展示，避免占满结果区 -->
    <section v-if="!hasSearched && !searchHistoryEmpty" class="space-y-2">
      <div class="flex items-center justify-between">
        <h2 class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
          <Icon icon="lucide:history" class="h-3.5 w-3.5" />
          {{ t('library.search_history') }}
        </h2>
        <button
          @click="clearSearchHistory"
          class="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-neutral-400 transition hover:bg-neutral-100 hover:text-red-500 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-red-400 cursor-pointer"
        >
          <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
          {{ t('library.search_history_clear') }}
        </button>
      </div>
      <div class="flex flex-wrap gap-1.5">
        <div
          v-for="kw in searchHistory"
          :key="kw"
          class="group flex max-w-full items-center gap-0.5 rounded-full border border-neutral-100 bg-white pl-3 pr-1 py-1 dark:border-neutral-700 dark:bg-neutral-900"
        >
          <button
            @click="pickHistory(kw)"
            class="min-w-0 truncate text-xs text-neutral-700 transition hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100 cursor-pointer"
          >{{ kw }}</button>
          <button
            @click.stop="removeSearchHistory(kw)"
            :title="t('library.search_history_remove')"
            class="shrink-0 rounded-full p-1 text-neutral-300 transition hover:bg-neutral-100 hover:text-red-500 dark:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-red-400 cursor-pointer"
          >
            <Icon icon="lucide:x" class="h-3 w-3" />
          </button>
        </div>
      </div>
    </section>

    <!-- 搜索结果：按类型分组 -->
    <template v-if="hasSearched">
      <div v-if="isSearching && !groups.length" class="flex flex-col items-center justify-center py-16 text-neutral-400 dark:text-neutral-500 space-y-3">
        <Icon icon="eos-icons:loading" class="h-7 w-7" />
        <p class="text-sm">{{ t('library.searching') }}</p>
      </div>

      <div v-else-if="!groups.length" class="flex flex-col items-center justify-center py-16 text-neutral-400 dark:text-neutral-500 space-y-3">
        <div class="p-4 rounded-full bg-neutral-50 dark:bg-neutral-800">
          <Icon icon="lucide:search-x" class="h-7 w-7" />
        </div>
        <p class="text-sm">{{ t('library.search_empty') }}</p>
      </div>

      <div v-else class="space-y-5">
        <section v-for="group in groups" :key="group.key" class="space-y-2">
          <div class="flex items-center justify-between">
            <h3 class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              <Icon :icon="group.icon" :class="['h-3.5 w-3.5', group.color]" />
              {{ t(group.labelKey) }}
            </h3>
            <button
              v-if="group.hasMore"
              @click="openFullSearch(group.key)"
              class="text-[10px] text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 cursor-pointer"
            >{{ t('common.more') }}</button>
          </div>
          <div class="rounded-xl border border-neutral-100 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden">
            <button
              v-for="item in group.items"
              :key="item.id"
              @click="openResult(item)"
              class="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-neutral-50 dark:hover:bg-neutral-800 active:scale-[0.99] border-b border-neutral-50 dark:border-neutral-800 last:border-b-0"
            >
              <img
                v-if="item.image"
                :src="item.image"
                alt=""
                loading="lazy"
                class="h-11 w-8 shrink-0 rounded object-cover bg-neutral-100 dark:bg-neutral-800"
              />
              <div v-else class="grid h-11 w-8 shrink-0 place-items-center rounded bg-neutral-50 dark:bg-neutral-800">
                <Icon :icon="group.icon" :class="['h-4 w-4', group.color]" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{{ item.title }}</p>
                <p v-if="item.subtitle" class="truncate text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">{{ item.subtitle }}</p>
              </div>
              <span v-if="item.meta" class="shrink-0 text-[10px] font-medium text-neutral-400 dark:text-neutral-500">{{ item.meta }}</span>
              <Icon icon="lucide:chevron-right" class="h-4 w-4 shrink-0 text-neutral-300 dark:text-neutral-600" />
            </button>
          </div>
        </section>
      </div>
    </template>

    <!-- 默认：分类入口卡片网格 -->
    <template v-else>
      <div class="flex items-center gap-1.5">
        <Icon icon="lucide:layout-grid" class="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
        <h2 class="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
          {{ t('library.categories') }}
        </h2>
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          v-for="item in libraryItems"
          :key="item.id"
          @click="navigateTo(item.path)"
          class="flex items-center gap-4 p-4 rounded-xl border border-neutral-100 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-sm transition-all hover:border-neutral-300 dark:hover:border-neutral-600 hover:shadow-md active:scale-[0.98] text-left group"
        >
          <div :class="['grid h-12 w-12 place-items-center rounded-lg transition-colors group-hover:scale-110', item.bgColor]">
            <Icon :icon="item.icon" :class="['h-6 w-6', item.color]" />
          </div>
          <div class="flex-1">
            <h3 class="font-bold text-neutral-900 dark:text-neutral-100">{{ item.title }}</h3>
            <p class="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">{{ t('library.view_list', { name: item.title }) }}</p>
          </div>
          <Icon icon="lucide:chevron-right" class="h-5 w-5 text-neutral-300 dark:text-neutral-600 group-hover:text-neutral-500 dark:group-hover:text-neutral-400 transition-colors" />
        </button>
      </div>
    </template>
  </div>
  </ion-content>
  </ion-page>
</template>
