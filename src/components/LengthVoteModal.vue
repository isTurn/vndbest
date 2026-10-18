<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="show"
        class="fixed inset-0 z-[210] flex items-end sm:items-center justify-center"
      >
        <div class="absolute inset-0 bg-black/40" @click="close"></div>

        <div class="relative z-10 w-full sm:w-[440px] max-h-[88vh] bg-white dark:bg-neutral-900 sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200">
          <!-- 顶部栏 -->
          <div class="flex items-center justify-between px-4 pt-4 pb-2">
            <h3 class="text-base font-bold text-neutral-900 dark:text-neutral-100">{{ t('vn.length_vote.title') }}</h3>
            <button
              @click="close"
              class="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <Icon icon="lucide:x" class="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
            </button>
          </div>

          <!-- 两个 Tab：我的填写 / 大家的投票 -->
          <div class="px-4 pb-2">
            <div class="flex items-center gap-1 rounded-full bg-neutral-200/70 dark:bg-neutral-700/60 p-0.5">
              <button
                v-for="tab in tabs"
                :key="tab.value"
                type="button"
                @click="switchTab(tab.value)"
                class="flex-1 whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-medium leading-none transition-all cursor-pointer"
                :class="activeTab === tab.value
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 font-semibold shadow-xs'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'"
              >{{ tab.label }}</button>
            </div>
          </div>

          <!-- ========== Tab 1：我的填写 ========== -->
          <div v-if="activeTab === 'edit'" class="px-4 pb-4 space-y-4 overflow-y-auto flex-1">
            <!-- 从 VNDB 拉取自己账号上已有记录的状态 -->
            <div
              v-if="mineLoading || mineError || mineLoaded"
              class="flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-[10px] leading-tight"
              :class="mineError
                ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                : 'bg-neutral-50 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400'"
            >
              <span class="inline-flex items-center gap-1 min-w-0">
                <Icon v-if="mineLoading" icon="lucide:loader-2" class="h-3 w-3 shrink-0 animate-spin" />
                <Icon v-else-if="mineError" icon="lucide:alert-triangle" class="h-3 w-3 shrink-0" />
                <Icon v-else icon="lucide:download-cloud" class="h-3 w-3 shrink-0" />
                <span class="truncate">
                  {{ mineLoading
                    ? t('vn.length_vote.mine_loading')
                    : (mineError ? t('vn.length_vote.mine_error', { error: mineError }) : t('vn.length_vote.mine_loaded')) }}
                </span>
              </span>
              <button
                v-if="!mineLoading"
                type="button"
                @click="loadMine()"
                class="shrink-0 text-[10px] underline-offset-2 hover:underline cursor-pointer"
              >{{ t('vn.length_vote.mine_retry') }}</button>
            </div>

            <!-- 社区平均 -->
            <div class="flex items-center justify-between gap-2 rounded-lg bg-neutral-50 dark:bg-neutral-800 px-3 py-2">
              <span class="text-[11px] text-neutral-500 dark:text-neutral-400">{{ t('vn.length_vote.community_avg') }}</span>
              <span class="text-[11px] font-semibold text-neutral-800 dark:text-neutral-200 text-right">{{ communityText || '—' }}</span>
            </div>

            <!-- 时长：标题与输入同一排 -->
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <label class="shrink-0 text-xs font-medium text-neutral-500 dark:text-neutral-400">{{ t('vn.length_vote.playtime') }}</label>
                <div class="flex items-center gap-1 min-w-0 flex-1 justify-end">
                  <input
                    v-model="form.hours"
                    type="number"
                    inputmode="numeric"
                    min="0"
                    max="435"
                    class="w-14 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 px-2 py-1.5 text-xs text-center outline-none transition focus:border-neutral-400 dark:focus:border-neutral-500 focus:bg-white dark:focus:bg-neutral-700"
                  />
                  <span class="text-[11px] text-neutral-400 dark:text-neutral-500 shrink-0">{{ t('vn.length_vote.hours') }}</span>
                  <input
                    v-model="form.mins"
                    type="number"
                    inputmode="numeric"
                    min="0"
                    max="59"
                    class="w-14 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 px-2 py-1.5 text-xs text-center outline-none transition focus:border-neutral-400 dark:focus:border-neutral-500 focus:bg-white dark:focus:bg-neutral-700"
                  />
                  <span class="text-[11px] text-neutral-400 dark:text-neutral-500 shrink-0">{{ t('vn.length_vote.minutes') }}</span>
                </div>
              </div>
              <p v-if="totalMinutes === 0" class="text-[10px] text-rose-500 dark:text-rose-400">{{ t('vn.length_vote.time_required') }}</p>
              <p v-else-if="Number(form.mins) >= 60" class="text-[10px] text-rose-500 dark:text-rose-400">{{ t('vn.length_vote.mins_invalid') }}</p>
            </div>

            <!-- 投票类型：标题与选项同一排 -->
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <label class="shrink-0 text-xs font-medium text-neutral-500 dark:text-neutral-400">{{ t('vn.length_vote.vote_type') }}</label>
                <div class="flex items-stretch gap-1 flex-1 min-w-0 justify-end">
                  <button
                    v-for="opt in voteTypeOptions"
                    :key="opt.value"
                    type="button"
                    @click="form.voteType = opt.value"
                    class="flex-1 min-w-0 flex items-center justify-center gap-1 rounded-lg border px-1.5 py-1.5 text-center transition cursor-pointer"
                    :class="form.voteType === opt.value
                      ? 'border-neutral-900 dark:border-neutral-100 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900'
                      : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/80 text-neutral-700 dark:text-neutral-300 hover:border-neutral-300 dark:hover:border-neutral-600'"
                  >
                    <Icon
                      :icon="form.voteType === opt.value ? 'lucide:check-circle' : 'lucide:circle'"
                      class="h-3 w-3 shrink-0"
                    />
                    <span class="block text-[10px] font-medium leading-none whitespace-nowrap">{{ opt.label }}</span>
                  </button>
                </div>
              </div>
              <p class="text-[10px] leading-relaxed text-neutral-400 dark:text-neutral-500">{{ voteTypeDesc }}</p>
            </div>

            <!-- 阅读速度：只有「计入平均」时才需要 -->
            <div v-if="form.voteType === 'counted'" class="space-y-2">
              <label class="text-xs font-medium text-neutral-500 dark:text-neutral-400">{{ t('vn.length_vote.speed') }}</label>
              <div class="flex items-center gap-1 rounded-full bg-neutral-200/70 dark:bg-neutral-700/60 p-0.5">
                <button
                  v-for="opt in speedOptions"
                  :key="String(opt.value)"
                  type="button"
                  @click="form.speed = opt.value"
                  class="flex-1 whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-medium leading-none transition-all cursor-pointer"
                  :class="form.speed === opt.value
                    ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 font-semibold shadow-xs'
                    : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'"
                >{{ opt.label }}</button>
              </div>
            </div>

            <!-- 语言（先选语言，版本列表会按语言筛选） -->
            <div v-if="availableLangs.length" class="space-y-2">
              <div class="flex items-center justify-between gap-2">
                <label class="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  {{ t('vn.length_vote.langs') }}
                </label>
                <span v-if="langLimited" class="text-[10px] text-neutral-400 dark:text-neutral-500">
                  {{ t('vn.length_vote.langs_limited', '仅显示所选版本的语言') }}
                </span>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="lang in availableLangs"
                  :key="lang"
                  type="button"
                  @click="toggleLang(lang)"
                  class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition cursor-pointer"
                  :class="form.lang.includes(lang)
                    ? 'border-neutral-900 dark:border-neutral-100 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-medium'
                    : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400'"
                >
                  <LanguageFlag :lang="lang" class="h-3.5 w-3.5" />
                  {{ t(`metadata.lang.${lang}`, lang) }}
                </button>
              </div>
            </div>

            <!-- 版本（可按语言筛选） -->
            <div v-if="allReleases.length" class="space-y-2">
              <div class="flex items-center justify-between gap-2">
                <label class="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  {{ t('vn.length_vote.releases') }}
                  <span v-if="form.lang.length" class="ml-1 text-[10px] font-normal text-neutral-400 dark:text-neutral-500">
                    ({{ visibleReleases.length }}/{{ allReleases.length }})
                  </span>
                </label>
                <div class="flex items-center gap-2">
                  <button
                    v-if="form.lang.length"
                    type="button"
                    @click="form.lang = []"
                    class="text-[10px] text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition cursor-pointer"
                  >{{ t('vn.length_vote.filter_clear') }}</button>
                  <button
                    type="button"
                    @click="toggleAllReleases"
                    class="text-[10px] text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition cursor-pointer"
                  >{{ allVisibleReleasesSelected ? t('vn.length_vote.clear') : t('vn.length_vote.select_all') }}</button>
                </div>
              </div>
              <p v-if="form.lang.length && !visibleReleases.length" class="text-[10px] text-neutral-400 dark:text-neutral-500">
                {{ t('vn.length_vote.filter_empty') }}
              </p>
              <div class="space-y-1 max-h-40 overflow-y-auto">
                <button
                  v-for="rel in visibleReleases"
                  :key="rel.id"
                  type="button"
                  @click="toggleRelease(rel.id)"
                  class="w-full flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition cursor-pointer"
                  :class="form.rid.includes(rel.id)
                    ? 'border-neutral-900 dark:border-neutral-100 bg-neutral-100 dark:bg-neutral-800'
                    : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900'"
                >
                  <Icon
                    :icon="form.rid.includes(rel.id) ? 'lucide:check-square' : 'lucide:square'"
                    class="h-3.5 w-3.5 shrink-0 text-neutral-500 dark:text-neutral-400"
                  />
                  <span class="min-w-0 flex-1">
                    <span class="block text-[11px] font-medium text-neutral-800 dark:text-neutral-200 truncate">{{ rel.alttitle || rel.title }}</span>
                    <span class="flex items-center gap-1 text-[10px] text-neutral-400 dark:text-neutral-500 min-w-0">
                      <span class="shrink-0">{{ rel.id }} · {{ rel.released || '—' }}</span>
                      <template v-if="releaseLangs(rel).length">
                        <span class="shrink-0">·</span>
                        <span class="inline-flex items-center gap-1 min-w-0">
                          <LanguageFlag
                            v-for="l in releaseLangs(rel)"
                            :key="`${rel.id}-${l}`"
                            :lang="l"
                            class="h-3 w-3 shrink-0"
                          />
                          <span class="truncate">{{ releaseLangs(rel).map((l) => t(`metadata.lang.${l}`, l)).join(' / ') }}</span>
                        </span>
                      </template>
                    </span>
                  </span>
                </button>
              </div>
            </div>

            <!-- 备注 -->
            <div class="space-y-2">
              <label class="text-xs font-medium text-neutral-500 dark:text-neutral-400">{{ t('vn.length_vote.notes') }}</label>
              <textarea
                v-model="form.notes"
                rows="3"
                :placeholder="t('vn.length_vote.notes_placeholder')"
                class="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 px-3 py-2 text-xs leading-relaxed outline-none transition focus:border-neutral-400 dark:focus:border-neutral-500 focus:bg-white dark:focus:bg-neutral-700 placeholder-neutral-400 dark:placeholder-neutral-500 resize-none"
              ></textarea>
            </div>

            <!-- 同步结果 -->
            <p v-if="feedback" class="text-[11px] leading-relaxed" :class="feedbackType === 'error' ? 'text-rose-500 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'">
              {{ feedback }}
            </p>
            <p class="text-[10px] leading-relaxed text-neutral-400 dark:text-neutral-500">{{ t('vn.length_vote.sync_hint') }}</p>
          </div>

          <!-- ========== Tab 2：大家的投票 ========== -->
          <div v-else class="px-4 pb-4 overflow-y-auto flex-1 space-y-3">            <!-- 统计表 -->
            <div v-if="stats.length" class="rounded-lg bg-neutral-50 dark:bg-neutral-800 px-3 py-2 space-y-1">
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">{{ t('vn.length_vote.stats_title') }}</span>
                <button
                  type="button"
                  @click="loadVotes()"
                  class="text-[10px] text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition cursor-pointer"
                >{{ t('vn.length_vote.refresh') }}</button>
              </div>
              <div class="grid grid-cols-5 gap-1 text-[10px] text-neutral-400 dark:text-neutral-500 pb-1 border-b border-neutral-200/70 dark:border-neutral-700/70">
                <span>{{ t('vn.length_vote.stat_speed') }}</span>
                <span class="text-right">{{ t('vn.length_vote.stat_median') }}</span>
                <span class="text-right">{{ t('vn.length_vote.stat_avg') }}</span>
                <span class="text-right">{{ t('vn.length_vote.stat_count') }}</span>
                <span></span>
              </div>
              <div
                v-for="s in stats"
                :key="s.label"
                class="grid grid-cols-5 gap-1 text-[11px] text-neutral-700 dark:text-neutral-300"
              >
                <span class="truncate">{{ s.label }}</span>
                <span class="text-right font-medium">{{ s.median || '—' }}</span>
                <span class="text-right font-medium">{{ s.avg || '—' }}</span>
                <span class="text-right">{{ s.count }}</span>
                <span></span>
              </div>
            </div>

            <!-- 加载 / 空 / 错误 -->
            <div v-if="votesLoading" class="flex flex-col items-center justify-center py-8 gap-2">
              <Icon icon="lucide:loader-2" class="h-5 w-5 animate-spin text-neutral-300 dark:text-neutral-600" />
              <span class="text-[10px] text-neutral-400 dark:text-neutral-500">{{ t('vn.length_vote.list_loading') }}</span>
            </div>
            <p v-else-if="votesError" class="text-[11px] text-rose-500 dark:text-rose-400 leading-relaxed">
              {{ t('vn.length_vote.list_error', { error: votesError }) }}
            </p>
            <p v-else-if="!votes.length" class="text-center py-6 text-[11px] text-neutral-400 dark:text-neutral-500">
              {{ t('vn.length_vote.list_empty') }}
            </p>

            <!-- 投票列表 -->
            <div v-else class="space-y-2">
              <p class="text-[10px] text-neutral-400 dark:text-neutral-500">{{ t('vn.length_vote.vote_count', { count: votes.length }) }} · {{ t('vn.length_vote.list_hint') }}</p>
              <div
                v-for="(v, i) in votes"
                :key="`${v.uid}-${i}`"
                class="rounded-lg border border-neutral-200 dark:border-neutral-700 px-2.5 py-2 space-y-1"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="min-w-0 inline-flex items-center gap-1 text-[11px] font-medium text-neutral-800 dark:text-neutral-200">
                    <Icon icon="lucide:user" class="h-3 w-3 shrink-0 text-neutral-400 dark:text-neutral-500" />
                    <span class="truncate">{{ v.user || t('vn.length_vote.anonymous') }}</span>
                  </span>
                  <span class="shrink-0 text-[11px] font-bold text-neutral-900 dark:text-neutral-100">{{ formatPlayTime(v.minutes) || '—' }}</span>
                </div>
                <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-neutral-400 dark:text-neutral-500">
                  <span v-if="v.date">{{ v.date }}</span>
                  <span v-if="v.speed !== null && v.speed !== undefined">{{ speedLabel(v.speed) }}</span>
                  <span class="inline-flex items-center gap-0.5" v-for="l in v.langs" :key="l">
                    <LanguageFlag :lang="l" class="h-3 w-3 shrink-0" />{{ t(`metadata.lang.${l}`, l) }}
                  </span>
                  <span v-for="r in v.rels" :key="r">{{ r }}</span>
                </div>
                <p class="text-[10px] leading-relaxed text-neutral-500 dark:text-neutral-400 whitespace-pre-wrap break-words">
                  {{ v.notes ? v.notes.replace(/^\(private\)\s*/, '') : t('vn.length_vote.notes_none') }}
                </p>
              </div>
            </div>
          </div>

          <!-- 底部按钮 -->
          <div class="flex items-center gap-2 px-4 py-3 border-t border-neutral-100 dark:border-neutral-800">
            <button
              @click="close"
              class="px-3 py-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition cursor-pointer"
            >{{ t('vn.length_vote.cancel') }}</button>
            <span class="flex-1"></span>
            <template v-if="activeTab === 'edit'">
            <button
              @click="saveLocal"
              :disabled="saving"
              class="px-3 py-2 text-sm font-medium rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition disabled:opacity-50 cursor-pointer"
            >{{ t('vn.length_vote.save') }}</button>
            <button
              @click="sync"
              :disabled="syncing || saving"
              class="px-3 py-2 text-sm font-medium text-white dark:text-neutral-900 bg-neutral-900 dark:bg-neutral-100 hover:bg-neutral-800 dark:hover:bg-neutral-200 rounded-lg transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
            >
              <Icon v-if="syncing" icon="lucide:loader-2" class="h-3.5 w-3.5 animate-spin" />
              <Icon v-else icon="lucide:upload" class="h-3.5 w-3.5" />
              {{ syncing ? t('vn.length_vote.syncing') : t('vn.length_vote.sync') }}
            </button>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import LanguageFlag from '@/components/LanguageFlag.vue'
import {
  getLengthVote,
  saveLengthVote,
  syncLengthVote,
  fetchLengthVotes,
  fetchMyLengthVote,
  formatPlayTime
} from '@/utils/lengthVote'
import { useToast } from '@/composables/useToast'

const props = defineProps({
  show: { type: Boolean, default: false },
  vnId: { type: String, default: '' },
  releases: { type: Array, default: () => [] },
  communityText: { type: String, default: '' }
})

const emit = defineEmits(['update:show', 'saved'])

const { t } = useI18n()
const { showToast } = useToast()

const activeTab = ref('edit')
const tabs = computed(() => [
  { value: 'edit', label: t('vn.length_vote.tab_edit') },
  { value: 'list', label: t('vn.length_vote.tab_list') }
])

const votes = ref([])
const stats = ref([])
const votesLoading = ref(false)
const votesError = ref('')
let votesLoadedFor = ''

function switchTab(tab) {
  activeTab.value = tab
  if (tab === 'list' && !votesLoadedFor) {
    loadVotes()
  }
}

// ==================== 打开弹窗前先拉取自己账号上的记录 ====================
const mineLoading = ref(false)
const mineError = ref('')
const mineLoaded = ref(false)

/**
 * 从 VNDB 把当前用户在这部作品上的时长记录拉回来，覆盖本地并回填表单。
 * 「修改前先获取」的意义：网站上的记录可能被别处改过，本地缓存不一定最新。
 */
async function loadMine() {
  if (!props.vnId) return
  mineLoading.value = true
  mineError.value = ''
  try {
    const res = await fetchMyLengthVote(props.vnId)
    if (res.ok) {
      mineLoaded.value = true
      // 服务器有记录 → 用它回填；没有记录则保留本地/默认值
      if (res.votes && res.votes.length) {
        applyRemoteVote(res.votes[0])
      }
      // 服务器返回的可用版本可以补全 releases 缺失语言的情况
      if (res.releases && res.releases.length) remoteReleases.value = res.releases
    } else if (res.error === 'NOT_NATIVE') {
      mineError.value = ''
      mineLoaded.value = false
    } else {
      mineError.value = translateSyncError(res.error)
    }
  } catch (e) {
    mineError.value = String(e?.message || e)
  } finally {
    mineLoading.value = false
  }
}

/** 把服务器上的记录回填进表单（字段与 buildEntry 对齐） */
function applyRemoteVote(vote) {
  const minutes = Math.max(0, Math.round(Number(vote.length) || 0))
  const isPrivate = !!vote.private
  const isUncounted = !isPrivate && (vote.speed === null || vote.speed === undefined)
  form.value = {
    hours: minutes ? Math.floor(minutes / 60) : '',
    mins: minutes ? minutes % 60 : '',
    voteType: isPrivate ? 'private' : isUncounted ? 'uncounted' : 'counted',
    speed: isUncounted || isPrivate ? 1 : Number(vote.speed),
    rid: Array.isArray(vote.rid) ? [...vote.rid] : [],
    lang: Array.isArray(vote.lang) ? [...vote.lang] : [],
    notes: vote.notes || ''
  }
  feedback.value = ''
  feedbackType.value = 'success'
}

/** 读取公开的时长时间列表（含其他人的备注） */
async function loadVotes() {
  if (!props.vnId) return
  votesLoading.value = true
  votesError.value = ''
  try {
    const res = await fetchLengthVotes(props.vnId)
    if (res.ok) {
      votes.value = res.votes || []
      stats.value = res.stats || []
      votesLoadedFor = props.vnId
    } else {
      votesError.value = translateSyncError(res.error)
    }
  } catch (e) {
    votesError.value = String(e?.message || e)
  } finally {
    votesLoading.value = false
  }
}

function speedLabel(speed) {
  if (speed === 0) return t('vn.length_vote.speed_slow')
  if (speed === 2) return t('vn.length_vote.speed_fast')
  return t('vn.length_vote.speed_normal')
}

const form = ref({
  hours: '',
  mins: '',
  voteType: 'counted',
  speed: 1,
  rid: [],
  lang: [],
  notes: ''
})
const saving = ref(false)
const syncing = ref(false)
const feedback = ref('')
const feedbackType = ref('success')

const voteTypeOptions = computed(() => [
  { value: 'counted', label: t('vn.length_vote.counted'), desc: t('vn.length_vote.counted_hint') },
  { value: 'uncounted', label: t('vn.length_vote.uncounted'), desc: t('vn.length_vote.uncounted_hint') },
  { value: 'private', label: t('vn.length_vote.private'), desc: t('vn.length_vote.private_hint') }
])

const voteTypeDesc = computed(
  () => voteTypeOptions.value.find((o) => o.value === form.value.voteType)?.desc || ''
)

const speedOptions = computed(() => [
  { value: 0, label: t('vn.length_vote.speed_slow') },
  { value: 1, label: t('vn.length_vote.speed_normal') },
  { value: 2, label: t('vn.length_vote.speed_fast') }
])

const totalMinutes = computed(() => {
  const h = Number(form.value.hours) || 0
  const m = Number(form.value.mins) || 0
  return Math.max(0, Math.round(h * 60 + m))
})

/** 只保留已发售的版本：未发售的版本 VNDB 不接受 */
const releasedReleases = computed(() =>
  (props.releases || []).filter((r) => r && r.id && r.released)
)

/** 从 /lengthvote 页面拿回来的「可投票版本」，用于补全页面数据缺失的情况 */
const remoteReleases = ref([])

/** 版本下拉实际用到的列表：props.releases 优先，缺的用服务器返回的补 */
const allReleases = computed(() => {
  const byId = new Map()
  for (const r of releasedReleases.value) byId.set(r.id, r)
  for (const r of remoteReleases.value || []) {
    if (!r || !r.id) continue
    if (byId.has(r.id)) continue
    // 服务器返回的 released 字段是字符串，lang 是数组
    if (!r.released) continue
    byId.set(r.id, { id: r.id, title: r.title || r.id, released: r.released, languages: r.lang || [] })
  }
  return Array.from(byId.values())
})

function releaseLangs(rel) {
  if (!Array.isArray(rel?.languages)) return []
  return rel.languages.map((l) => (typeof l === 'string' ? l : l.lang)).filter(Boolean)
}

/** 全部版本支持的语言（未按版本筛选） */
const allAvailableLangs = computed(() => {
  const set = new Set()
  for (const rel of allReleases.value) {
    for (const l of releaseLangs(rel)) set.add(l)
  }
  return Array.from(set)
})

const availableLangs = computed(() => {
  const checked = form.value.rid
  // 勾了版本：只显示这些版本支持的语言（已投过票时就是自己玩过的语言）；
  // 全部取消勾选后 checked 为空，退回显示所有语言。
  const set = new Set()
  for (const rel of allReleases.value) {
    if (checked.length && !checked.includes(rel.id)) continue
    for (const l of releaseLangs(rel)) set.add(l)
  }
  // 记录里已选的语言始终保留，避免版本数据缺失时 chip 突然消失
  for (const l of form.value.lang) set.add(l)
  return Array.from(set)
})

/** 语言是否正被所选版本限制（用于标题旁提示） */
const langLimited = computed(
  () => form.value.rid.length > 0 && allAvailableLangs.value.length > availableLangs.value.length
)

/** 版本列表按「当前已选语言」筛选：选了语言就只显示包含该语言的版本 */
const visibleReleases = computed(() => {
  const langs = form.value.lang
  if (!langs.length) return allReleases.value
  return allReleases.value.filter((rel) =>
    releaseLangs(rel).some((l) => langs.includes(l))
  )
})

/** 版本筛选面板是否展开 */
const releaseFilterOpen = ref(false)

/** 当前可见（筛选后）的版本是否已全选 */
const allVisibleReleasesSelected = computed(
  () =>
    visibleReleases.value.length > 0 &&
    visibleReleases.value.every((r) => form.value.rid.includes(r.id))
)

const allReleasesSelected = computed(
  () =>
    allReleases.value.length > 0 &&
    allReleases.value.every((r) => form.value.rid.includes(r.id))
)

function resetForm() {
  const local = getLengthVote(props.vnId)

  if (local) {
    const localType = local.private
      ? 'private'
      : local.speed === null || local.speed === undefined
        ? 'uncounted'
        : 'counted'
    form.value = {
      hours: local.hours || '',
      mins: local.mins || '',
      voteType: localType,
      speed: local.speed === null || local.speed === undefined ? 1 : local.speed,
      rid: Array.isArray(local.rid) ? [...local.rid] : [],
      lang: Array.isArray(local.lang) ? [...local.lang] : [],
      notes: local.notes || ''
    }
  } else {
    // 游玩版本默认全不选，由用户自己勾
    form.value = {
      hours: '',
      mins: '',
      voteType: 'counted',
      speed: 1,
      rid: [],
      lang: [],
      notes: ''
    }
  }
  feedback.value = ''
  feedbackType.value = 'success'
}

watch(
  () => props.show,
  (v) => {
    if (!v) return
    // 每次打开都先清空上一次的远程状态，再本地回填，最后异步拉服务器记录覆盖
    mineLoaded.value = false
    mineError.value = ''
    remoteReleases.value = []
    resetForm()
    loadMine()
  }
)

// 版本变化时不主动删掉已选语言（否则会悄悄改掉用户已有的投票），
// 只剔除所有版本都不支持的语言，避免提交被服务端拒绝。
watch(
  () => form.value.rid.slice().sort().join(','),
  () => {
    const all = allAvailableLangs.value
    if (!all.length) return
    const kept = form.value.lang.filter((l) => all.includes(l))
    if (kept.length !== form.value.lang.length) form.value.lang = kept
  }
)

function toggleRelease(id) {
  if (form.value.rid.includes(id)) {
    form.value.rid = form.value.rid.filter((x) => x !== id)
  } else {
    form.value.rid = [...form.value.rid, id]
  }
}

function toggleAllReleases() {
  // 只作用于当前筛选后可见的版本，避免把被筛掉的版本也一起勾上
  const visible = visibleReleases.value.map((r) => r.id)
  if (allVisibleReleasesSelected.value) {
    form.value.rid = form.value.rid.filter((id) => !visible.includes(id))
  } else {
    form.value.rid = Array.from(new Set([...form.value.rid, ...visible]))
  }
}

function toggleLang(lang) {
  if (form.value.lang.includes(lang)) {
    form.value.lang = form.value.lang.filter((x) => x !== lang)
  } else {
    form.value.lang = [...form.value.lang, lang]
  }
}

function buildEntry() {
  const isPrivate = form.value.voteType === 'private'
  // counted: private=false + speed(0/1/2)；uncounted: private=false + speed=null；private: private=true + speed=null
  const isCounted = form.value.voteType === 'counted'
  return {
    hours: Number(form.value.hours) || 0,
    mins: Number(form.value.mins) || 0,
    speed: isCounted ? form.value.speed : null,
    private: isPrivate,
    notes: form.value.notes,
    rid: [...form.value.rid],
    lang: [...form.value.lang]
  }
}

function validate() {
  if (totalMinutes.value <= 0) {
    feedback.value = t('vn.length_vote.time_required')
    feedbackType.value = 'error'
    return false
  }
  if (Number(form.value.mins) >= 60) {
    feedback.value = t('vn.length_vote.mins_invalid')
    feedbackType.value = 'error'
    return false
  }
  if (!form.value.rid.length) {
    feedback.value = t('vn.length_vote.releases_required')
    feedbackType.value = 'error'
    return false
  }
  if (!form.value.lang.length) {
    feedback.value = t('vn.length_vote.langs_required')
    feedbackType.value = 'error'
    return false
  }
  return true
}

function close() {
  emit('update:show', false)
}

function saveLocal() {
  if (!validate()) return
  saving.value = true
  try {
    const entry = saveLengthVote(props.vnId, buildEntry())
    emit('saved', entry)
    showToast(t('vn.length_vote.saved_local'), 'success')
    close()
  } finally {
    saving.value = false
  }
}

/** 同步失败时把错误码翻译成人话 */
function translateSyncError(code) {
  const map = {
    NOT_NATIVE: 'sync_not_native',
    TIMEOUT: 'sync_timeout',
    FORBIDDEN: 'sync_forbidden',
    NOT_LOGGED_IN: 'sync_not_logged_in',
    NO_PAGEVARS: 'sync_not_logged_in',
    NO_WIDGET: 'sync_no_widget',
    NO_RELEASES: 'sync_no_widget',
    NO_LANG: 'sync_no_widget',
    NO_TIME: 'time_required'
  }
  const key = map[code]
  if (key) return t(`vn.length_vote.${key}`)
  return t('vn.length_vote.sync_error', { error: code })
}

async function sync() {
  if (!validate()) return
  syncing.value = true
  feedback.value = ''
  try {
    const entry = saveLengthVote(props.vnId, buildEntry())
    emit('saved', entry)
    const res = await syncLengthVote(props.vnId, entry)
    if (res.ok) {
      feedbackType.value = 'success'
      feedback.value = t('vn.length_vote.sync_success')
      showToast(t('vn.length_vote.sync_success'), 'success')
      setTimeout(() => close(), 900)
    } else {
      feedbackType.value = 'error'
      feedback.value = translateSyncError(res.error)
    }
  } catch (e) {
    feedbackType.value = 'error'
    feedback.value = String(e?.message || e)
  } finally {
    syncing.value = false
  }
}

// 供父组件在打开时手动刷新（避免 watch 早于 releases 到位）
defineExpose({ resetForm, formatPlayTime })
</script>

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
