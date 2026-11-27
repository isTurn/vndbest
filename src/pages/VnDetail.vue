<script setup>
import { ref, watch, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { translateError } from '@/utils/errorMessage'
import { Icon } from '@iconify/vue'
import AppHeader from '@/components/AppHeader.vue'
import { getVnDetail, getVnReleases, getVnCharacters, getVnQuotes, getVnListItem, patchVnListItem, deleteVnListItem, getUserListLabels } from '@/api/vndb'
import VnList from '@/components/VnList.vue'
import LanguageFlag from '@/components/LanguageFlag.vue'
import LengthVoteModal from '@/components/LengthVoteModal.vue'
import ActionSheet from '@/components/ActionSheet.vue'
import { getLengthVote, formatPlayTime } from '@/utils/lengthVote'
import { fetchVnStats, getCachedVnStats } from '@/utils/vnStats'
import AgeRating from '@/components/AgeRating.vue'
import { usePrivacy, getImageNsfwLevel } from '@/composables/usePrivacy'
import { useTranslation } from '@/composables/useTranslation'
import { useImageLoader } from '@/composables/useImageLoader'
import { getLabelName, getLabelIcon, getLabelColor, isVotedLabel, SYSTEM_LABEL_MAX_ID } from '@/utils/ulistLabels'
import { PLATFORM_ICON_NAMES, APP_ICON_NAMES } from '@/icons/icon-names'
import { buildCrossSearchLinks, buildCrossSearchTitles, pickDefaultTitle, openCrossSearchSite } from '@/utils/crossSearch'
import { openExternalUrl, getReleaseLinkBrowserMode, getCrossSearchBrowserMode } from '@/utils/linkOpener'
import { useClipboard } from '@/composables/useClipboard'
import { useToast } from '@/composables/useToast'
import { useFavorites } from '@/composables/useFavorites'
import { useUlistStatus } from '@/composables/useUlistStatus'
import { IonPage, IonContent, IonImg, IonSpinner, IonToast } from '@ionic/vue'
import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core'

const PhotoGallery = registerPlugin('PhotoGallery')

const { getDetailAction, getScreenshotAction, getCardAction } = usePrivacy()
const imageLoader = useImageLoader()
const { copyText } = useClipboard()
const { showToast: showGlobalToast } = useToast()
// 相关作品列表要显示「在玩/已通关」等收藏状态，这里把详情页拿到的结果同步进缓存
const { setStatusLabels } = useUlistStatus()

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const { translateTagName, translateTraitName } = useTranslation()

const vn = ref(null)
const releases = ref([])
const characters = ref([])
const quotes = ref([])
const loading = ref(true)
const releasesLoading = ref(true)
const charactersLoading = ref(true)
const quotesLoading = ref(true)
const error = ref(null)
const quoteTranslations = ref({})

const { isFavorite, toggleFavorite } = useFavorites()

const isCurrentVnFavorite = computed(() => {
  return isFavorite(vn.value?.id)
})

function handleToggleVnFavorite() {
  if (!vn.value?.id) return
  const isFav = toggleFavorite({
    id: vn.value.id,
    type: 'vn',
    title: getTitle(vn.value),
    subtitle: getAltTitle(vn.value) || vn.value.id,
    image: vn.value.image?.thumbnail || vn.value.image?.url || '',
    extra: {
      rating: vn.value.rating,
      released: vn.value.released
    }
  })
  showGlobalToast(isFav ? t('common.favorite_added') : t('common.favorite_removed'), isFav ? 'success' : 'info')
}

// 详情页中的 Tab 切换选项，默认设置为 'releases' (版本发行)
const activeTab = ref('releases')

// 剧透展示级别，0 = 无剧透，1 = 轻度剧透，2 = 严重剧透
const spoilerLevel = ref(0)
const tempSpoilerLevel = ref(0) // 用于弹窗确认过程中的临时变量

// 标签分类筛选（多选）：'cont'=内容, 'ero'=性内容, 'tech'=技术
const activeTagCategories = ref(['cont', 'ero', 'tech'])

// 标签搜索模式（单选）：'summary'=摘要, 'all'=全部
const tagSearchMode = ref('summary')

// 角色特征筛选：性内容显示开关
const showTraitSexual = ref(false)

// 角色特征剧透等级（与标签共享 spoilerLevel）
const traitSpoilerLevel = ref(0)
const tempTraitSpoilerLevel = ref(0)
const showTraitSpoilerConfirm = ref(false)

// 控制剧透警告确认弹窗的展示
const showSpoilerConfirm = ref(false)

// 控制大图查看器的展示
const showImageLightbox = ref(false)
const lightboxImageIndex = ref(0) // 记录当前查看的图片索引
const lightboxImagesList = ref([]) // 大图画廊的数据列表（可以是截图，也可以是封面等）
const scrollContainer = ref(null) // 滚动容器的 DOM 引用
const ionContentRef = ref(null) // ion-content 的 DOM 引用
let ignoreNextOverlayPopState = false

// 控制简介展开/收起
const isDescriptionExpanded = ref(false)

// 控制笔记展开/收起
const notesExpanded = ref(false)

// 简介 AI 翻译状态
const translatedDescription = ref('')
const translationLoading = ref(false)
const translationError = ref('')
const translationSourceText = ref('')

// 相关作品：同人作开关（默认隐藏非官方关联）
const showDoujin = ref(false)

// 过滤后的相关作品（根据同人作开关）
const filteredRelations = computed(() => {
  if (!vn.value?.relations) return []
  if (showDoujin.value) return vn.value.relations
  return vn.value.relations.filter(r => r.relation_official !== false)
})

// 控制角色详情展开/收起 (存储展开的角色 ID)
const expandedCharIds = ref(new Set())

// 隐私过滤：已揭示的内容 (点击眼睛图标后)
const revealedItems = ref(new Set())

function toggleReveal(key) {
  if (revealedItems.value.has(key)) {
    revealedItems.value.delete(key)
  } else {
    revealedItems.value.add(key)
  }
  // 触发响应式更新
  revealedItems.value = new Set(revealedItems.value)
}

// ==================== 收藏状态管理 ====================

// 用户收藏列表条目（null 表示不在列表中）
const collectionEntry = ref(null)
const collectionLoading = ref(true)
const statusLoading = ref(false)

// 收藏状态加载标记：用于区分"尚未加载"和"加载完毕但无数据"
const collectionLoaded = ref(false)

// Toast 提示
const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref('success') // 'success' | 'error'
let toastTimer = null

const showToast = (message, type = 'success') => {
  toastMessage.value = message
  toastType.value = type
  toastVisible.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastVisible.value = false
  }, 2500)
}

// 预定义标签 ID 到原名的映射（VNDB 默认标签，用户可自定义）
const LABEL_NAMES = {
  1: 'Playing',
  2: 'Finished',
  3: 'Stalled',
  4: 'Dropped',
  5: 'Wishlist',
  6: 'Blacklist',
  7: 'Voted'
}

// 预定义标签的多语言 i18n 映射
const getLabelI18n = (id, fallback) => {
  return getLabelName(id, fallback, t)
}

// 用户所有的标签列表（包括系统预定义与自定义）
const userLabels = ref([])
const userLabelsLoading = ref(false)

// 加载用户的全部标签
const loadUserLabels = async () => {
  const token = localStorage.getItem('vndb_api_token')
  if (!token) {
    userLabels.value = []
    return
  }
  userLabelsLoading.value = true
  try {
    const data = await getUserListLabels()
    if (data && data.labels) {
      userLabels.value = data.labels
    }
  } catch (err) {
    console.error('获取用户全部标签失败:', err)
  } finally {
    userLabelsLoading.value = false
  }
}

// 当前 VN 的状态标签 ID 数组
const currentLabelIds = computed(() => {
  if (!collectionEntry.value?.labels) return []
  return collectionEntry.value.labels.map(l => l.id)
})

// 获取当前所有选中的标签展示信息列表
const currentSelectedLabels = computed(() => {
  if (currentLabelIds.value.length === 0) return []
  return currentLabelIds.value.map(id => {
    const userLbl = userLabels.value.find(l => l.id === id)
    const entryLbl = collectionEntry.value?.labels?.find(l => l.id === id)
    const rawName = userLbl?.label || entryLbl?.label || entryLbl?.name || LABEL_NAMES[id] || ''
    const name = getLabelI18n(id, rawName)
    return {
      id,
      name,
      isSystem: id <= SYSTEM_LABEL_MAX_ID,
      icon: getLabelIcon(id, 'lucide:tag'),
      color: getLabelColor(id, 'text-neutral-400 dark:text-neutral-500')
    }
  })
})

// 获取当前主要状态（展示在详情页主按钮文字）
const currentStatusLabel = computed(() => {
  if (currentSelectedLabels.value.length === 0) return null
  // 如果有多个标签，拼接显示或显示主要标签
  if (currentSelectedLabels.value.length === 1) {
    return currentSelectedLabels.value[0]
  }
  // 多个标签时，优先找优先级最高的主标签，并附带计数，例如 "Playing (+2)"
  const priority = [1, 2, 3, 4, 5, 6]
  for (const id of priority) {
    const found = currentSelectedLabels.value.find(l => l.id === id)
    if (found) {
      return {
        id: found.id,
        icon: found.icon,
        color: found.color,
        name: `${found.name} (+${currentSelectedLabels.value.length - 1})`
      }
    }
  }
  const first = currentSelectedLabels.value[0]
  return {
    id: first.id,
    icon: first.icon,
    color: first.color,
    name: `${first.name} (+${currentSelectedLabels.value.length - 1})`
  }
})

// 控制 ActionSheet 状态选择器的展示
const showStatusActionSheet = ref(false)

// 状态选项列表（供 ActionSheet / 弹窗使用）
const statusOptions = computed(() => {
  const options = []
  
  // 1. "从列表移除 / 无" 选项
  options.push({
    value: 0,
    label: t('vn.status.none'),
    icon: 'lucide:trash-2',
    destructive: true
  })

  // 如果成功拉取到了用户的全部标签（包含自定义标签）
  if (userLabels.value && userLabels.value.length > 0) {
    for (const lbl of userLabels.value) {
      // Voted（id=7）由服务端按是否打过分自动维护，不能手动 set，
      // 放进选项里会导致 PATCH 被拒 → 用户看到「状态更新失败」
      if (isVotedLabel(lbl.id)) continue
      const isSystem = lbl.id >= 1 && lbl.id <= SYSTEM_LABEL_MAX_ID
      const labelText = getLabelI18n(lbl.id, lbl.label)
      options.push({
        value: lbl.id,
        label: labelText,
        count: lbl.count,
        icon: getLabelIcon(lbl.id, 'lucide:tag'),
        color: getLabelColor(lbl.id, null),
        description: lbl.private ? t('vn.status.private') : ''
      })
    }
    return options
  }

  // 兜底：如果还未加载完用户标签列表，但条目本身带有标签，或者默认提供 1~6
  const existingSet = new Set()
  if (collectionEntry.value?.labels) {
    for (const l of collectionEntry.value.labels) {
      if (isVotedLabel(l.id)) continue
      const isSystem = l.id >= 1 && l.id <= SYSTEM_LABEL_MAX_ID
      const labelText = getLabelI18n(l.id, l.label || l.name)
      options.push({
        value: l.id,
        label: labelText,
        icon: getLabelIcon(l.id, 'lucide:tag'),
        color: getLabelColor(l.id, null)
      })
      existingSet.add(l.id)
    }
  }

  for (const [idStr, defaultName] of Object.entries(LABEL_NAMES)) {
    const id = Number(idStr)
    if (isVotedLabel(id)) continue
    if (!existingSet.has(id)) {
      options.push({
        value: id,
        label: getLabelI18n(id, defaultName),
        icon: getLabelIcon(id, 'lucide:tag'),
        color: getLabelColor(id, null)
      })
    }
  }

  return options
})

// 当前选中的值（0 表示"无"）
const currentStatusValue = computed(() => currentStatusLabel.value?.id || 0)

// 加载当前 VN 的收藏状态
const loadCollectionStatus = async (vnId) => {
  const token = localStorage.getItem('vndb_api_token')
  if (!token) {
    collectionLoading.value = false
    collectionLoaded.value = true
    return
  }
  collectionLoading.value = true
  try {
    const data = await getVnListItem(vnId)
    if (data && data.results && data.results.length > 0) {
      collectionEntry.value = data.results[0]
      // 顺手把收藏标签与评分写进 VnList 的状态缓存，相关作品列表就能立刻显示状态与自己的评分
      setStatusLabels(vnId, data.results[0].labels || [], data.results[0].vote ?? null)
    } else {
      collectionEntry.value = null
      setStatusLabels(vnId, [], null)
    }
  } catch (err) {
    console.error('获取收藏状态失败:', err)
  } finally {
    collectionLoading.value = false
    collectionLoaded.value = true
  }
}

// 处理状态标签多选变更（通过 ActionSheet 多选确认）
const handleMultipleLabelsChange = async (selectedLabelIds) => {
  if (!vn.value?.id) return

  const token = localStorage.getItem('vndb_api_token')
  if (!token) {
    router.push('/login')
    return
  }

  statusLoading.value = true
  let patchPayload = null
  let requestMethod = 'PATCH'
  let requestTargetId = collectionEntry.value?.id || vn.value?.id || null

  try {
    let updated = false
    // id=7（Voted）是服务端自动维护的，绝不能出现在 labels_set/labels_unset 里
    const validSelectedIds = (selectedLabelIds || []).filter(id => id && id > 0 && !isVotedLabel(id))

    if (validSelectedIds.length === 0) {
      // 没有任何选中的标签 → 从收藏列表移除
      if (collectionEntry.value) {
        requestMethod = 'DELETE'
        requestTargetId = collectionEntry.value.id
        await deleteVnListItem(collectionEntry.value.id)
        collectionEntry.value = null
        updated = true
      }
    } else if (collectionEntry.value) {
      // 已在列表中：全量覆写标签或根据差集更新
      const oldLabelIds = currentLabelIds.value.filter(id => !isVotedLabel(id))
      const toUnset = oldLabelIds.filter(id => !validSelectedIds.includes(id))
      const toSet = validSelectedIds.filter(id => !oldLabelIds.includes(id))

      const data = {}
      if (toUnset.length > 0) {
        data.labels_unset = toUnset
      }
      if (toSet.length > 0) {
        data.labels_set = toSet
      }

      if (Object.keys(data).length > 0) {
        patchPayload = data
        requestTargetId = collectionEntry.value.id
        const response = await patchVnListItem(collectionEntry.value.id, data)
        updated = response?._status === 204
      } else {
        updated = true
      }
    } else {
      // 不在列表中 → 创建新条目并标记多标签
      patchPayload = { labels: validSelectedIds }
      requestTargetId = vn.value.id
      const response = await patchVnListItem(vn.value.id, patchPayload)
      updated = response?._status === 204
    }

    // 重新加载状态和标签计数
    await Promise.all([
      loadCollectionStatus(vn.value.id),
      loadUserLabels()
    ])

    if (updated) {
      showToast(validSelectedIds.length > 0 ? t('vn.status.update_success') : t('vn.status.remove_success'), 'success')
    }
  } catch (err) {
    console.group('VNDetail Multiple Labels Patch 请求失败')
    console.error('更新多标签状态失败:', err)
    console.groupEnd()
    const isUnauthorized = err?.status === 401 || err?.message?.includes('401')
    showToast(isUnauthorized ? t('vn.status.no_permission') : t('vn.status.update_error'), 'error')
  } finally {
    statusLoading.value = false
  }
}

// ==================== 收藏编辑弹窗 ====================

const showEditModal = ref(false)
const editSaving = ref(false)
const editFeedback = ref({
  type: '',
  message: ''
})
let editSuccessTimer = null

// 弹窗表单数据
const editForm = ref({
  selectedLabelIds: [], // 状态标签 ID 列表
  vote: '',            // 评分 1-10，空字符串表示未评分
  notes: '',           // 笔记
  started: '',         // 开始日期 YYYY-MM-DD
  finished: ''         // 结束日期 YYYY-MM-DD
})

// 星星悬停预览
const hoverVote = ref(null)

// 设置评分（点击星星）
const setVote = (val) => {
  if (editForm.value.vote === val) {
    // 再次点击同一个星星 = 取消评分
    editForm.value.vote = ''
  } else {
    editForm.value.vote = val
  }
}

// 清除评分
const clearVote = () => {
  editForm.value.vote = ''
}

// 切换编辑弹窗内的标签勾选状态
const toggleEditModalLabel = (opt) => {
  if (opt.value === 0 || opt.destructive) {
    editForm.value.selectedLabelIds = []
    return
  }
  const current = [...editForm.value.selectedLabelIds]
  const idx = current.indexOf(opt.value)
  if (idx >= 0) {
    current.splice(idx, 1)
  } else {
    current.push(opt.value)
  }
  editForm.value.selectedLabelIds = current
}

// 格式化评分显示
const formattedVote = computed(() => {
  const vote = collectionEntry.value?.vote
  if (!vote) return null
  return vote / 10  // API 返回 10-100，显示为 1.0-10.0
})

// 打开编辑弹窗，用当前收藏数据填充表单
const resetEditFeedback = () => {
  editFeedback.value = {
    type: '',
    message: ''
  }
  if (editSuccessTimer) {
    clearTimeout(editSuccessTimer)
    editSuccessTimer = null
  }
}

const openEditModal = () => {
  const rawVote = collectionEntry.value?.vote
  editForm.value = {
    selectedLabelIds: [...currentLabelIds.value],
    vote: rawVote ? Math.round(rawVote / 10) : '',
    notes: collectionEntry.value?.notes || '',
    started: collectionEntry.value?.started || '',
    finished: collectionEntry.value?.finished || ''
  }
  hoverVote.value = null
  resetEditFeedback()
  window.history.pushState({ vnEditModal: true }, '')
  showEditModal.value = true
  document.body.style.overflow = 'hidden'
}

// 关闭编辑弹窗
const closeEditModal = (fromPopState = false) => {
  if (!showEditModal.value) return

  if (!fromPopState) {
    ignoreNextOverlayPopState = true
  }

  resetEditFeedback()
  showEditModal.value = false
  document.body.style.overflow = showImageLightbox.value ? 'hidden' : ''

  if (!fromPopState) {
    window.history.back()
  }
}

// 保存编辑弹窗表单
const saveEditForm = async () => {
  if (!vn.value?.id) return

  const token = localStorage.getItem('vndb_api_token')
  if (!token) {
    router.push('/login')
    return
  }

  editSaving.value = true
  resetEditFeedback()
  try {
    const form = editForm.value
    let patchResponse = null

    // 处理状态标签变更
    const newSelectedLabelIds = (form.selectedLabelIds || []).filter(id => id && id > 0)
    const oldLabelIds = currentLabelIds.value

    if (!collectionEntry.value) {
      // 不在列表中 → 创建新条目
      const patchData = {}
      if (newSelectedLabelIds.length > 0) {
        patchData.labels = newSelectedLabelIds
      }
      if (form.vote !== '') {
        patchData.vote = Math.round(Number(form.vote) * 10)
      }
      if (form.notes) {
        patchData.notes = form.notes
      }
      if (form.started) {
        patchData.started = form.started
      }
      if (form.finished) {
        patchData.finished = form.finished
      }
      if (Object.keys(patchData).length > 0) {
        patchResponse = await patchVnListItem(vn.value.id, patchData, { timeout: 15000 })
      }
    } else {
      // 已在列表中 → 更新（仅发送实际变更的字段）
      const entry = collectionEntry.value
      const patchData = {}

      // 状态标签变更
      const labelsToUnset = oldLabelIds.filter(id => !newSelectedLabelIds.includes(id))
      const labelsToSet = newSelectedLabelIds.filter(id => !oldLabelIds.includes(id))
      if (labelsToUnset.length > 0) {
        patchData.labels_unset = labelsToUnset
      }
      if (labelsToSet.length > 0) {
        patchData.labels_set = labelsToSet
      }

      // 评分变更（仅在实际变更时发送）
      const oldVote = entry.vote  // 原始值为整数 10-100 或 null
      const newVote = form.vote !== '' ? Math.round(Number(form.vote) * 10) : null
      if (oldVote !== newVote) {
        patchData.vote = newVote
      }

      // 笔记变更（仅在实际变更时发送）
      const oldNotes = entry.notes || null
      const newNotes = form.notes || null
      if (oldNotes !== newNotes) {
        patchData.notes = newNotes
      }

      // 开始日期变更（仅在实际变更时发送）
      const oldStarted = entry.started || null
      const newStarted = form.started || null
      if (oldStarted !== newStarted) {
        patchData.started = newStarted
      }

      // 完成日期变更（仅在实际变更时发送）
      const oldFinished = entry.finished || null
      const newFinished = form.finished || null
      if (oldFinished !== newFinished) {
        patchData.finished = newFinished
      }

      if (Object.keys(patchData).length > 0) {
        patchResponse = await patchVnListItem(entry.id, patchData, { timeout: 15000 })
      }
    }

    if (patchResponse?._status === 204 || patchResponse === null) {
      editFeedback.value = {
        type: 'success',
        message: t('vn.status.save_success')
      }
      showToast(t('vn.status.save_success'), 'success')
      await Promise.all([
        loadCollectionStatus(vn.value.id),
        loadUserLabels()
      ])
      editSuccessTimer = setTimeout(() => {
        closeEditModal()
      }, 1200)
      return
    }

    throw new Error(t('vn.status.save_error'))
  } catch (err) {
    console.error('保存收藏信息失败:', err)
    const isUnauthorized = err?.status === 401 || err?.message?.includes('401')
    const message = isUnauthorized ? t('vn.status.no_permission') : t('vn.status.save_error')
    editFeedback.value = {
      type: 'error',
      message
    }
    showToast(message, 'error')
  } finally {
    editSaving.value = false
  }
}

// 详情页封面过滤动作
const coverAction = computed(() => {
  if (!vn.value?.image) return 'show'
  return getDetailAction('vn', getImageNsfwLevel(vn.value.image))
})

const toggleCharExpansion = (id) => {
  if (expandedCharIds.value.has(id)) {
    expandedCharIds.value.delete(id)
  } else {
    expandedCharIds.value.add(id)
  }
}

// 获取角色的声优信息
const getCharacterVA = (charId) => {
  if (!vn.value || !vn.value.va) return null
  return vn.value.va.find(v => v.character?.id === charId)
}

// 根据当前选择的剧透级别和性内容过滤器过滤角色特征
const groupTraits = (traits) => {
  if (!traits) return {}
  const filtered = traits.filter(t => {
    // 剧透级别过滤
    if (t.spoiler > traitSpoilerLevel.value) return false
    // 性内容过滤：sexual 是 Bool 类型
    if (!showTraitSexual.value && t.sexual) return false
    return true
  })
  return filtered.reduce((acc, trait) => {
    const group = trait.group_name || 'Other'
    if (!acc[group]) acc[group] = []
    acc[group].push(trait)
    return acc
  }, {})
}

// 根据剧透级别过滤角色本身（角色在当前 VN 中的剧透等级）
const filteredCharacters = computed(() => {
  if (!characters.value) return []
  return characters.value.filter(char => {
    // 获取角色在当前 VN 中的剧透等级
    const vnEntry = char.vns?.find(v => v.id === vn.value?.id)
    const charSpoiler = vnEntry?.spoiler ?? 0
    // 如果角色剧透等级超过当前筛选级别，隐藏整个角色
    if (charSpoiler > traitSpoilerLevel.value) return false
    return true
  })
})

// 处理角色特征剧透级别切换
const handleSelectTraitSpoiler = (level) => {
  if (level === 2) {
    tempTraitSpoilerLevel.value = level
    showTraitSpoilerConfirm.value = true
  } else {
    traitSpoilerLevel.value = level
  }
}

const confirmTraitSpoilerLevel = () => {
  traitSpoilerLevel.value = tempTraitSpoilerLevel.value
  showTraitSpoilerConfirm.value = false
}

const filteredTags = computed(() => {
  if (!vn.value || !vn.value.tags) return []
  return vn.value.tags.filter(tag => {
    // 剧透等级过滤
    if (tag.spoiler > spoilerLevel.value) return false
    // 分类过滤（多选）
    if (!activeTagCategories.value.includes(tag.category)) return false
    // 搜索模式过滤：summary 只显示高相关性标签（rating >= 2.0）
    if (tagSearchMode.value === 'summary' && tag.rating < 2.0) return false
    return true
  })
})

// 切换标签分类（多选，允许全部取消）
const toggleTagCategory = (category) => {
  const idx = activeTagCategories.value.indexOf(category)
  if (idx >= 0) {
    activeTagCategories.value.splice(idx, 1)
  } else {
    activeTagCategories.value.push(category)
  }
}

// 从 releases 数据中提取所有封面图（保留原始 image 对象用于隐私过滤）
const allCovers = computed(() => {
  const list = []
  
  // 1. 主视觉封面图
  if (vn.value?.image?.url) {
    list.push({
      url: vn.value.image.url,
      thumbnail: vn.value.image.thumbnail,
      dims: vn.value.image.dims,
      title: t('vn.cover_main_visual'),
      desc: vn.value.title,
      image: vn.value.image
    })
  }

  // 2. 收集各 Release 的封面大图
  releases.value.forEach(rel => {
    if (rel.images && rel.images.length > 0) {
      rel.images.forEach(img => {
        // 主要是 pkgfront (包装正面) 或 dig (数字封面)
        if (img.url && !list.some(item => item.url === img.url)) {
          let label = t('vn.cover_default')
          if (img.type === 'pkgfront') label = t('vn.cover_pkgfront')
          if (img.type === 'pkgback') label = t('vn.cover_pkgback')
          if (img.type === 'pkgcontent') label = t('vn.cover_pkgcontent')
          if (img.type === 'pkgside') label = t('vn.cover_pkgside')
          if (img.type === 'pkgmed') label = t('vn.cover_pkgmed')
          if (img.type === 'dig') label = t('vn.cover_dig')
          
          list.push({
            url: img.url,
            thumbnail: img.thumbnail,
            dims: img.dims,
            title: `${label} - ${rel.title}`,
            desc: rel.released || t('vn.release_unknown'),
            image: img
          })
        }
      })
    }
  })

  return list
})

// 隐私过滤：封面画册图片
function getCoverAction(cover) {
  return getCardAction('release', getImageNsfwLevel(cover.image))
}

function shouldBlurCover(cover) {
  const action = getCoverAction(cover)
  return action === 'blur' || action === 'blur_card'
}

function isCoverHidden(cover) {
  return getCoverAction(cover) === 'hide'
}

const filteredCovers = computed(() => {
  return allCovers.value.filter(cover => !isCoverHidden(cover))
})

// 获取当前大图的 URL
const currentLightboxImageUrl = computed(() => {
  if (lightboxImagesList.value.length === 0) return ''
  return lightboxImagesList.value[lightboxImageIndex.value]?.url || ''
})

// 处理切换剧透级别的点击事件
const handleSelectSpoiler = (level) => {
  if (level === 2) {
    tempSpoilerLevel.value = level
    showSpoilerConfirm.value = true
  } else {
    spoilerLevel.value = level
  }
}

// 确认切换剧透等级
const confirmSpoilerLevel = () => {
  spoilerLevel.value = tempSpoilerLevel.value
  showSpoilerConfirm.value = false
}

// 点开大图查看器
const openLightbox = (index, imagesArray) => {
  lightboxImagesList.value = imagesArray
  lightboxImageIndex.value = index
  window.history.pushState({ vnLightbox: true }, '')
  showImageLightbox.value = true
  
  // 锁定背景滚动（同时处理 body 和 ion-content）
  document.body.style.overflow = 'hidden'
  // Ionic 的实际滚动容器在 ion-content 内部，需要单独禁用
  nextTick(() => {
    const ionContent = ionContentRef.value?.$el || ionContentRef.value
    if (ionContent) {
      ionContent.style.setProperty('--overflow', 'hidden')
      // 同时禁用 ion-content 内部的滚动容器
      const scrollEl = ionContent.querySelector?.('.inner-scroll, ion-scroll, [class*="scroll"]')
      if (scrollEl) {
        scrollEl.style.overflow = 'hidden'
      }
    }
  })
  
  // 绑定键盘监听
  window.addEventListener('keydown', handleKeyDown)
  
  // 等待 DOM 渲染完成后，滚动到对应图片位置
  nextTick(() => {
    scrollToIndex(index, 'auto')
  })
}

// 关闭大图查看器
const closeLightbox = (fromPopState = false) => {
  if (!showImageLightbox.value) return

  if (!fromPopState) {
    ignoreNextOverlayPopState = true
  }

  showImageLightbox.value = false
  // 恢复背景滚动
  document.body.style.overflow = ''
  const ionContent = ionContentRef.value?.$el || ionContentRef.value
  if (ionContent) {
    ionContent.style.removeProperty('--overflow')
    const scrollEl = ionContent.querySelector?.('.inner-scroll, ion-scroll, [class*="scroll"]')
    if (scrollEl) {
      scrollEl.style.overflow = ''
    }
  }
  window.removeEventListener('keydown', handleKeyDown)

  if (!fromPopState) {
    window.history.back()
  }
}

const handlePopState = () => {
  if (ignoreNextOverlayPopState) {
    ignoreNextOverlayPopState = false
    return
  }

  if (showEditModal.value) {
    closeEditModal(true)
    return
  }

  if (showImageLightbox.value) {
    closeLightbox(true)
  }
}

onMounted(() => {
  window.addEventListener('popstate', handlePopState)
})

onUnmounted(() => {
  window.removeEventListener('popstate', handlePopState)
  window.removeEventListener('keydown', handleKeyDown)
})

const getImageSaveInfo = (url) => {
  try {
    const urlPath = new URL(url).pathname
    const rawName = decodeURIComponent(urlPath.split('/').pop() || '')
    const hasExtension = /\.(jpe?g|png|webp|gif)$/i.test(rawName)
    const fileName = hasExtension ? rawName : `vndbest_${Date.now()}.jpg`
    const extension = fileName.split('.').pop()?.toLowerCase()
    const mimeTypeMap = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif'
    }

    return {
      fileName,
      mimeType: mimeTypeMap[extension] || 'image/jpeg'
    }
  } catch {
    return {
      fileName: `vndbest_${Date.now()}.jpg`,
      mimeType: 'image/jpeg'
    }
  }
}

// 保存当前截图到手机相册
const savingImage = ref(false)
const saveImageToPhone = async () => {
  const url = currentLightboxImageUrl.value
  if (!url || savingImage.value) return

  // 仅在原生平台（Android/iOS）上可用
  if (!Capacitor.isNativePlatform()) {
    showToast(t('vn.lightbox.save_not_supported'), 'error')
    return
  }

  savingImage.value = true
  try {
    const { fileName, mimeType } = getImageSaveInfo(url)
    await PhotoGallery.saveImage({
      url,
      fileName,
      mimeType
    })

    showToast(t('vn.lightbox.save_success'), 'success')
  } catch (err) {
    console.error('保存图片失败:', err)
    showToast(t('vn.lightbox.save_failed'), 'error')
  } finally {
    savingImage.value = false
  }
}

// 将容器滚动到对应的图片索引
// 注意：弹层刚挂载时容器可能还没有布局（clientWidth 为 0），此时滚动会被
// 忽略，画面停在第一张，等布局完成后再滚动就会看到「从第一张快速翻页过去」
// 的动画。所以这里用 rAF 轮询等布局就绪，并且用直接赋值 scrollLeft 的方式
// 做无动画跳转（容器上的 scroll-smooth 会让 scrollTo({behavior:'auto'}) 也走动画）。
let pendingScrollRaf = 0
const scrollToIndex = (index, behavior = 'smooth', attempt = 0) => {
  if (!scrollContainer.value) return
  const el = scrollContainer.value
  const containerWidth = el.clientWidth

  if (containerWidth <= 0) {
    // 最多等约 30 帧（约 0.5s），避免异常情况下无限重试
    if (attempt > 30) return
    cancelAnimationFrame(pendingScrollRaf)
    pendingScrollRaf = requestAnimationFrame(() => scrollToIndex(index, behavior, attempt + 1))
    return
  }

  isProgrammaticScroll = true

  if (behavior === 'auto') {
    // 容器带 scroll-smooth，CSS 的 scroll-behavior 会连 scrollLeft 直接赋值
    // 也走动画，所以这里临时把 scroll-behavior 关掉做真正的瞬时跳转。
    const prevBehavior = el.style.scrollBehavior
    el.style.scrollBehavior = 'auto'
    el.scrollLeft = index * containerWidth
    // 强制读一次布局，确保跳转已经生效
    void el.scrollLeft
    el.style.scrollBehavior = prevBehavior
    requestAnimationFrame(() => {
      isProgrammaticScroll = false
    })
  } else {
    el.scrollTo({ left: index * containerWidth, behavior })
    setTimeout(() => {
      isProgrammaticScroll = false
    }, 350)
  }
}

let isProgrammaticScroll = false

// 监听容器滚动事件，实时更新当前图片索引
const handleScroll = () => {
  if (isProgrammaticScroll || !scrollContainer.value) return
  const scrollLeft = scrollContainer.value.scrollLeft
  const containerWidth = scrollContainer.value.clientWidth
  if (containerWidth > 0) {
    const index = Math.round(scrollLeft / containerWidth)
    if (index !== lightboxImageIndex.value && index >= 0 && index < lightboxImagesList.value.length) {
      lightboxImageIndex.value = index
    }
  }
}

// 切换下一张图片
const nextImage = () => {
  if (lightboxImagesList.value.length === 0) return
  const nextIdx = (lightboxImageIndex.value + 1) % lightboxImagesList.value.length
  lightboxImageIndex.value = nextIdx
  scrollToIndex(nextIdx, 'smooth')
}

// 切换上一张图片
const prevImage = () => {
  if (lightboxImagesList.value.length === 0) return
  const prevIdx = (lightboxImageIndex.value - 1 + lightboxImagesList.value.length) % lightboxImagesList.value.length
  lightboxImageIndex.value = prevIdx
  scrollToIndex(prevIdx, 'smooth')
}

// 处理键盘快捷键
const handleKeyDown = (e) => {
  if (e.key === 'ArrowRight' || e.key === 'Right') {
    nextImage()
  } else if (e.key === 'ArrowLeft' || e.key === 'Left') {
    prevImage()
  } else if (e.key === 'Escape') {
    closeLightbox()
  }
}

// 触摸滑动控制：一次只能滑动一格
let touchStartX = 0
let touchStartY = 0
let isScrolling = false

const handleTouchStart = (e) => {
  touchStartX = e.touches[0].clientX
  touchStartY = e.touches[0].clientY
  isScrolling = false
}

const handleTouchMove = (e) => {
  const deltaX = Math.abs(e.touches[0].clientX - touchStartX)
  const deltaY = Math.abs(e.touches[0].clientY - touchStartY)
  if (deltaX > deltaY) {
    isScrolling = true
  }
  // 始终阻止默认触摸行为，防止 Android 上背景页面滚动
  e.preventDefault()
}

const handleTouchEnd = (e) => {
  if (!isScrolling) return
  
  const touchEndX = e.changedTouches[0].clientX
  const deltaX = touchEndX - touchStartX
  
  if (deltaX > 40) {
    prevImage()
  } else if (deltaX < -40) {
    nextImage()
  } else {
    scrollToIndex(lightboxImageIndex.value, 'smooth')
  }
}

// BBCode 渲染函数
const parseBBCode = (text) => {
  if (!text) return ''
  // 先转义再拼 HTML：VNDB 的描述是用户可编辑内容，不转义直接 v-html 等于 XSS
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

  // 1. [url=link]text[/url]
  escaped = escaped.replace(/\[url=(https?:\/\/[^\]]+)\](.*?)\[\/url\]/gi, (match, url, label) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="underline text-neutral-900 font-semibold hover:text-neutral-600 transition-colors">${label}</a>`
  })

  // 2. [url]link[/url]
  escaped = escaped.replace(/\[url\](https?:\/\/[^\[]+)\[\/url\]/gi, (match, url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="underline text-neutral-900 font-semibold hover:text-neutral-600 transition-colors">${url}</a>`
  })

  return escaped
}

// 格式化时长（对齐 VNDB 官网风格：Medium (11h from 4 votes)）
const formatLength = (vnData) => {
  const hasCategory = !!vnData.length
  const hasMinutes = !!vnData.length_minutes
  const votes = vnData.length_votes || 0

  if (!hasCategory && !hasMinutes) return t('metadata.length.unknown')

  // 平均时长文案：>= 1h 用 "11h 30m"，不足 1h 用 "45m"
  let duration = ''
  if (hasMinutes) {
    const hours = Math.floor(vnData.length_minutes / 60)
    const mins = vnData.length_minutes % 60
    if (hours > 0) duration = mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
    else duration = `${mins}m`
  }

  const category = hasCategory ? (t(`metadata.length.${vnData.length}`) || t('metadata.length.unknown')) : ''

  // 分类 + 平均时长 + 票数 → "中等 (11h from 4 votes)"
  if (category && duration && votes > 0) {
    return t('vn.length_from_votes', { category, duration, count: votes })
  }
  // 分类 + 平均时长（无票数）
  if (category && duration) return `${category} (${duration})`
  // 只有分类，或只有平均时长
  return category || duration
}

// 翻译关系说明
const translateRelation = (relationType) => {
  return t(`metadata.relation.${relationType}`) || relationType
}

// 翻译角色性别（sex 可能为数组 ["f","f"] 或字符串 "f,f"）
const translateGender = (sex) => {
  if (!sex) return t('metadata.gender.unknown')
  let primarySex
  if (Array.isArray(sex)) {
    primarySex = sex.length > 0 ? sex[0] : null
  } else if (typeof sex === 'string' && sex.length > 0) {
    primarySex = sex.includes(',') ? sex.split(',')[0].trim() : sex[0]
  } else {
    primarySex = sex
  }
  if (!primarySex) return t('metadata.gender.unknown')
  return t(`metadata.gender.${primarySex}`) || sex
}

// 翻译演职人员角色
const translateStaffRole = (role) => {
  return t(`metadata.staff_role.${role.toLowerCase()}`) || role
}

const getPlainTextFromBBCode = (text) => {
  if (!text) return ''
  return text
    .replace(/\[quote\][\s\S]*?\[\/quote\]/gi, ' ')
    .replace(/\[url=.*?\](.*?)\[\/url\]/gi, '$1')
    .replace(/\[img\].*?\[\/img\]/gi, ' ')
    .replace(/\[\/?.+?\]/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const resetDescriptionTranslation = () => {
  translatedDescription.value = ''
  translationError.value = ''
  translationLoading.value = false
  translationSourceText.value = ''
}

const resetQuoteTranslations = () => {
  quoteTranslations.value = {}
}

const translateQuote = async (quote) => {
  const sourceText = (quote?.quote || '').trim()
  if (!sourceText || !quote?.id) return

  const current = quoteTranslations.value[quote.id] || {}
  if (current.loading) return

  quoteTranslations.value = {
    ...quoteTranslations.value,
    [quote.id]: {
      translated: current.translated || '',
      error: '',
      loading: true,
      sourceText
    }
  }

  try {
    const response = await CapacitorHttp.post({
      url: 'https://workers.hekinyan.vip/v1/translate',
      headers: {
        'Content-Type': 'application/json'
      },
      data: {
        locale: locale.value,
        messages: [
          {
            role: 'user',
            content: sourceText
          }
        ]
      }
    })

    const content = response?.data?.choices?.[0]?.message?.content?.trim()
    if (!content) {
      throw new Error(t('vn.translation.empty'))
    }

    quoteTranslations.value = {
      ...quoteTranslations.value,
      [quote.id]: {
        translated: content,
        error: '',
        loading: false,
        sourceText
      }
    }
  } catch (err) {
    console.error('摘录翻译失败:', err)
    quoteTranslations.value = {
      ...quoteTranslations.value,
      [quote.id]: {
        translated: current.translated || '',
        error: err?.response?.data?.error || err?.message || t('vn.translation.failed'),
        loading: false,
        sourceText
      }
    }
  } finally {
    if (quoteTranslations.value[quote.id]?.loading) {
      quoteTranslations.value = {
        ...quoteTranslations.value,
        [quote.id]: {
          translated: quoteTranslations.value[quote.id]?.translated || '',
          error: quoteTranslations.value[quote.id]?.error || '',
          loading: false,
          sourceText
        }
      }
    }
  }
}

const translateDescription = async () => {
  const sourceText = getPlainTextFromBBCode(vn.value?.description || '')
  if (!sourceText) return

  if (translationLoading.value) return

  translationLoading.value = true
  translationError.value = ''

  try {
    const response = await CapacitorHttp.post({
      url: 'https://workers.hekinyan.vip/v1/translate',
      headers: {
        'Content-Type': 'application/json'
      },
      data: {
        locale: locale.value,
        messages: [
          {
            role: 'user',
            content: sourceText
          }
        ]
      }
    })

    const content = response?.data?.choices?.[0]?.message?.content?.trim()
    if (!content) {
      throw new Error(t('vn.translation.empty'))
    }

    translatedDescription.value = content
    translationSourceText.value = sourceText
  } catch (err) {
    console.error('简介翻译失败:', err)
    translationError.value = err?.response?.data?.error || err?.message || t('vn.translation.failed')
  } finally {
    translationLoading.value = false
  }
}

// 翻译角色类型关系
const translateCharRole = (role) => {
  return t(`metadata.role.${role.toLowerCase()}`) || role
}

// 翻译特征分组名（分组名可能含空格、括号如 "ENGAGES IN_(SEXUAL)"）
const translateTraitGroup = (groupName) => {
  if (!groupName) return t('metadata.trait_group.other')
  const key = groupName.toLowerCase().replace(/\s+/g, '_').replace(/[()]/g, '')
  return t(`metadata.trait_group.${key}`) || groupName
}

// 加载主要详情及其他关联选项卡内容
const loadVnDetail = async (id) => {
  loading.value = true
  error.value = null
  try {
    const data = await getVnDetail(id)
    if (data && data.results && data.results.length > 0) {
      vn.value = data.results[0]
      // 默认激活版本发行
      activeTab.value = 'releases'
      spoilerLevel.value = 0
      activeTagCategories.value = ['cont', 'ero', 'tech']
      resetDescriptionTranslation()
      tagSearchMode.value = 'summary'
      collectionEntry.value = null
      collectionLoaded.value = false
      collectionLoading.value = true
      resetQuoteTranslations()
      statsData.value = null
      statsError.value = ''
      statsLoadedFor.value = ''
      
      // 并发异步加载其余所有子选项卡数据，加快响应时间
      loadReleases(id)
      loadCharacters(id)
      loadQuotes(id)
      loadCollectionStatus(id)
      loadUserLabels()
    } else {
      vn.value = null
      error.value = t('vn.not_found')
    }
  } catch (err) {
    console.error('获取VN详情失败:', err)
    error.value = translateError(err, t, 'vn.not_found')
  } finally {
    loading.value = false
  }
}

// 错误态「重试」：重新拉取当前 VN 详情
const retryLoad = () => {
  const id = route.params.id
  if (id) loadVnDetail(id)
}

// 加载 Releases 发行列表
const loadReleases = async (id) => {
  releasesLoading.value = true
  try {
    const data = await getVnReleases(id)
    if (data && data.results) {
      releases.value = data.results
    }
  } catch (err) {
    console.error('获取Releases失败:', err)
  } finally {
    releasesLoading.value = false
  }
}

// —— 版本按语言分组（同语言放一类，可折叠）——
// 一个版本可能带多种语言：
//  - 若同行版本里带中文（zh-Hans / zh-Hant / zh），折叠栏优先按中文归类，
//    因为中文用户最可能在意的就是中文版；
//  - 否则取「主语言」(main)，再否则取第一个；
// 保证每个版本只出现在一组里，不会重复。
const ZH_LANGS = ['zh-Hans', 'zh-Hant', 'zh']
const releaseLangOf = (rel) => {
  const langs = Array.isArray(rel?.languages) ? rel.languages : []
  const list = langs.map((l) => (typeof l === 'string' ? l : l.lang)).filter(Boolean)
  if (!list.length) return ''
  for (const zh of ZH_LANGS) {
    if (list.includes(zh)) return zh
  }
  const main = langs.find((l) => l && typeof l === 'object' && l.main)
  return (main && main.lang) || list[0]
}

// 分组排序：日语优先、中文第二，其余按版本数降序；无语言归到「其他版本」放最后
const releaseGroupRank = (lang) => {
  if (lang === 'ja') return 0
  if (ZH_LANGS.includes(lang)) return 1
  return 2
}

const releaseGroups = computed(() => {
  const map = new Map()
  for (const rel of releases.value || []) {
    const lang = releaseLangOf(rel)
    if (!map.has(lang)) map.set(lang, [])
    map.get(lang).push(rel)
  }
  const groups = Array.from(map.entries()).map(([lang, items]) => ({ lang, items }))
  groups.sort((a, b) => {
    if (!a.lang !== !b.lang) return a.lang ? -1 : 1
    const ra = releaseGroupRank(a.lang)
    const rb = releaseGroupRank(b.lang)
    if (ra !== rb) return ra - rb
    if (b.items.length !== a.items.length) return b.items.length - a.items.length
    return a.lang.localeCompare(b.lang)
  })
  return groups
})

// 折叠状态：默认全部收起，只显示一行语言标题，点开才展开版本卡
const expandedReleaseGroups = ref(new Set())
const isReleaseGroupExpanded = (lang) => expandedReleaseGroups.value.has(lang)
const toggleReleaseGroup = (lang) => {
  const next = new Set(expandedReleaseGroups.value)
  if (next.has(lang)) next.delete(lang)
  else next.add(lang)
  expandedReleaseGroups.value = next
}
// 两组都展开/收起
const allReleaseGroupsExpanded = computed(
  () =>
    releaseGroups.value.length > 0 &&
    releaseGroups.value.every((g) => expandedReleaseGroups.value.has(g.lang))
)
const toggleAllReleaseGroups = () => {
  expandedReleaseGroups.value = allReleaseGroupsExpanded.value
    ? new Set()
    : new Set(releaseGroups.value.map((g) => g.lang))
}

// 只有一组（或只有一组有版本）时默认展开，避免点两次才看到内容
watch(
  releaseGroups,
  (groups) => {
    if (!groups.length) return
    if (groups.length === 1 && !expandedReleaseGroups.value.size) {
      expandedReleaseGroups.value = new Set([groups[0].lang])
    }
  },
  { immediate: true }
)

// 加载 角色（Characters）列表
const loadCharacters = async (id) => {
  charactersLoading.value = true
  try {
    const data = await getVnCharacters(id)
    if (data && data.results) {
      // 按照重要程度排序: main -> primary -> side -> appears
      const roleWeight = { 'main': 4, 'primary': 3, 'side': 2, 'appears': 1 }
      characters.value = data.results.sort((a, b) => {
        const roleA = a.vns?.find(v => v.id === id || v.id === vn.value?.id)?.role || 'appears'
        const roleB = b.vns?.find(v => v.id === id || v.id === vn.value?.id)?.role || 'appears'
        return (roleWeight[roleB] || 0) - (roleWeight[roleA] || 0)
      })
    }
  } catch (err) {
    console.error('获取Characters失败:', err)
  } finally {
    charactersLoading.value = false
  }
}

// 加载 摘录（Quotes）列表
const loadQuotes = async (id) => {
  quotesLoading.value = true
  try {
    const data = await getVnQuotes(id)
    if (data && data.results) {
      quotes.value = data.results
    }
  } catch (err) {
    console.error('获取Quotes失败:', err)
  } finally {
    quotesLoading.value = false
  }
}

// 加载 评分统计（Tab「统计」）：Kana API 没有分布数据，需要抓 vndb.org 页面
const statsData = ref(null)
const statsLoading = ref(false)
const statsError = ref('')
const statsLoadedFor = ref('')

const statsMaxCount = computed(() => {
  const dist = statsData.value?.distribution || []
  return dist.reduce((m, d) => Math.max(m, Number(d.count) || 0), 0)
})

const statsTotalVotes = computed(() => {
  if (statsData.value?.total) return Number(statsData.value.total)
  return (statsData.value?.distribution || []).reduce((s, d) => s + (Number(d.count) || 0), 0)
})

const statsMedian = computed(() => {
  const dist = statsData.value?.distribution || []
  const total = statsTotalVotes.value
  if (!total) return null
  const half = total / 2
  let acc = 0
  // distribution 已按 10 → 1 降序，中位数从低分往上数更直观
  const asc = [...dist].sort((a, b) => a.score - b.score)
  for (const d of asc) {
    acc += Number(d.count) || 0
    if (acc >= half) return d.score
  }
  return null
})

const statsRows = computed(() =>
  (statsData.value?.distribution || []).map((d) => {
    const count = Number(d.count) || 0
    const max = statsMaxCount.value || 1
    const total = statsTotalVotes.value || 1
    return {
      score: d.score,
      count,
      percent: ((count / total) * 100).toFixed(1),
      width: Math.max(2, Math.round((count / max) * 100))
    }
  })
)

const translateStatsError = (code) => {
  const map = {
    BLOCKED: 'vn.stats.blocked',
    NOT_LOGGED_IN: 'vn.stats.not_logged_in',
    NOT_NATIVE: 'vn.stats.not_native',
    TIMEOUT: 'vn.stats.error',
    NO_STATS: 'vn.stats.empty'
  }
  const key = map[code]
  return key ? t(key, { error: code }) : t('vn.stats.error', { error: code })
}

const loadStats = async (id, force = false) => {
  const vid = id || vn.value?.id
  if (!vid) return
  if (!force && statsLoadedFor.value === vid && statsData.value) return
  statsError.value = ''
  const cached = force ? null : getCachedVnStats(vid)
  if (cached) {
    statsData.value = cached
    statsLoadedFor.value = vid
    return
  }
  statsLoading.value = true
  statsData.value = null
  try {
    const res = await fetchVnStats(vid, { useCache: !force })
    if (res.ok && res.stats) {
      statsData.value = res.stats
      statsLoadedFor.value = vid
    } else {
      statsError.value = translateStatsError(res.error || 'ERROR')
    }
  } catch (err) {
    statsError.value = translateStatsError(String(err?.message || err))
  } finally {
    statsLoading.value = false
  }
}

// 切到「统计」页时才去抓（避免进详情页就开隐藏 WebView）
watch(activeTab, (tab) => {
  if (tab === 'stats' && vn.value?.id) loadStats(vn.value.id)
})

const reloadStats = () => loadStats(vn.value?.id, true)

// 复制摘录内容
const copiedQuoteId = ref(null)
const copyQuote = async (quote) => {
  const ok = await copyText(quote?.quote)
  if (ok) {
    copiedQuoteId.value = quote.id
    setTimeout(() => {
      if (copiedQuoteId.value === quote.id) copiedQuoteId.value = null
    }, 2000)
  } else {
    showToast(t('common.copy_failed'), 'error')
  }
}

// 点击 / 长按复制标题或原名
const copyTitleText = async (text) => {
  const value = String(text ?? '').trim()
  if (!value) return
  const ok = await copyText(value)
  showGlobalToast(ok ? t('common.copied') : t('common.copy_failed'), ok ? 'success' : 'error')
}

// 平台图标（与 ReleaseList 保持一致：simple-icons 品牌 logo，缺失时回退显示器图标）
function getPlatformIcon(platform) {
  return PLATFORM_ICON_NAMES[platform] || APP_ICON_NAMES.common.monitor
}

// 统一标题处理逻辑 (与 VnList.vue 保持一致)
function getTitle(v) {
  if (!v) return ''
  if (v.titles && v.titles.length > 0) {
    const priority = JSON.parse(localStorage.getItem('vndb_title_lang_priority') || '["zh-Hans", "zh-Hant", "ja", "en"]')
    for (const lang of priority) {
      const match = v.titles.find(t => t.lang === lang)
      if (match) return match.title
    }
  }
  return v.title || v.alttitle || ''
}

function getAltTitle(v) {
  if (!v) return ''
  const mainTitle = getTitle(v)
  if (v.alttitle && v.alttitle !== mainTitle) return v.alttitle
  if (v.title && v.title !== mainTitle) return v.title
  return ''
}

// 登录状态检查
const isLoggedIn = computed(() => {
  const token = localStorage.getItem('vndb_api_token')
  return !!(token && token.trim())
})

// 外链跳转：跨站搜索（移植自 VNDB 跨站搜索脚本 v2.8.0）
// 候选标题：原名 / 各语言标题 / 拉丁转写，主标题排第一
const crossSearchTitles = computed(() => buildCrossSearchTitles(vn.value))
const crossSearchDefaultTitle = computed(() => pickDefaultTitle(crossSearchTitles.value))
// 模式：'title' 用游戏名搜（默认）/ 'vn' 用 v{id} 搜
const crossSearchMode = ref('title')
// 用户手动挑的标题；空字符串表示用默认标题
const crossSearchPickedTitle = ref('')

const crossSearchKeyword = computed(() => {
  const v = vn.value
  if (!v) return ''
  // VNDB API 返回的 vn.id 本身就带 "v" 前缀（如 "v17"），这里不能再拼一个
  if (crossSearchMode.value === 'vn') return v.id
  return (crossSearchPickedTitle.value || crossSearchDefaultTitle.value || '').trim()
})

// 中文标题（供「量子ACG」等标了 kw:'zh' 的站点使用）
const crossSearchZhTitle = computed(() => {
  const hit = crossSearchTitles.value.find(
    (t) => /^zh/i.test(t.lang || '') && /[\u4e00-\u9fff]/.test(t.text)
  )
  return hit ? hit.text : ''
})

const crossSearchGroups = computed(() =>
  buildCrossSearchLinks(crossSearchKeyword.value, {
    zhTitle: crossSearchZhTitle.value,
    // 只在「没手动挑标题」时让中文站优先用中文标题，与用户脚本一致
    preferZh: crossSearchMode.value === 'title' && !crossSearchPickedTitle.value
  })
)

// 面板里最多再列 8 个候选标题（与脚本一致）
const crossSearchChips = computed(() => {
  const all = crossSearchTitles.value
  if (!all.length) return []
  const def = crossSearchDefaultTitle.value
  const rest = all.filter((t) => t.text !== def).slice(0, 8)
  return [{ text: def, lang: all.find((t) => t.text === def)?.lang || 'main' }, ...rest]
})

function pickCrossSearchTitle(title) {
  crossSearchMode.value = 'title'
  crossSearchPickedTitle.value = title === crossSearchDefaultTitle.value ? '' : title
}

function setCrossSearchMode(mode) {
  crossSearchMode.value = mode
  crossSearchPickedTitle.value = ''
}

// 跨站搜索：所有站点统一由 openCrossSearchSite 按「跨站搜索打开方式」处理，
// 不能只拦 native 站点，否则普通站点会落到全局拦截器用默认设置打开 → 切换失效。
const handleCrossSearchClick = (e, site) => {
  if (!site) return
  e.preventDefault()
  // 中文站可能用的是中文标题，优先用它去搜
  openCrossSearchSite(site, site.usedKeyword || crossSearchKeyword.value)
}

// VNDB 的「填写游戏时长」：Kana API 没有写入时长的端点，但可以在应用内先填写、
// 再借 vndb.org 的登录态把数据 POST 到站内接口 /js/VNLengthVote.json。
// 所以这里改成和「收藏信息」一样的弹出小卡，不再跳外部网页。
const showLengthVote = ref(false)
const openLengthVote = () => {
  const id = vn.value?.id
  if (!id) return
  showLengthVote.value = true
}

// 时长记录保存/同步后刷新详情页那一行的展示
const onLengthVoteSaved = () => {
  // localLengthVote / lengthDisplay 是 computed，依赖 localStorage 写入后的重算，
  // 用一个 tick 级别的触发器强制重新读取一次。
  lengthVoteVersion.value++
}
const lengthVoteVersion = ref(0)

// 本地已保存的时长记录（用于详情页优先展示自己填的时长）
const localLengthVote = computed(() => {
  // 显式读 version，保证保存后重新计算
  void lengthVoteVersion.value
  return vn.value?.id ? getLengthVote(vn.value.id) : null
})

// 时长行文案：本地填过就显示「我的时长」，否则显示 VNDB 社区平均
const lengthDisplay = computed(() => {
  if (localLengthVote.value?.minutes) {
    return formatPlayTime(localLengthVote.value.minutes)
  }
  return formatLength(vn.value || {})
})

// 社区平均时长（含分类与投票人数），填过自己的时长后仍要保留显示在下方
const hasCommunityLength = computed(() => !!(vn.value?.length || vn.value?.length_minutes))
const communityLengthText = computed(() => formatLength(vn.value || {}))

// 版本卡片里的 VNDB 外链：走「版本外链」独立设置
const openReleaseExtLink = (link) => {
  if (!link?.url) return
  openExternalUrl(link.url, { mode: getReleaseLinkBrowserMode() })
}

// 跨站搜索内联在顶部信息卡里，默认折叠成一行按钮，点击展开
const showCrossSearch = ref(false)

// 当前已加载的 VN ID，用于避免从子页面返回时重复加载
const currentLoadedId = ref(null)

watch(
  () => route.params.id,
  (newId) => {
    if (newId && route.name === 'VnDetail') {
      // 如果 ID 没变（从子页面返回），跳过重新加载以保留数据/Tab/位置状态
      if (newId === currentLoadedId.value) return
      currentLoadedId.value = newId
      loadVnDetail(newId)
    }
  },
  { immediate: true }
)
</script>

<template>
  <ion-page>
  <ion-content ref="ionContentRef">
  <div class="page-container space-y-4">
    <AppHeader mode="center" :title="t('vn.details')">
      <template #actions>
        <button
          v-if="vn"
          type="button"
          @click="handleToggleVnFavorite"
          class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 active:bg-neutral-100 dark:active:bg-neutral-600 transition active:scale-95 cursor-pointer"
          :title="isCurrentVnFavorite ? t('favorites.remove') : t('favorites.title')"
        >
          <Icon
            :icon="isCurrentVnFavorite ? 'lucide:heart' : 'lucide:heart'"
            class="h-4 w-4 transition"
            :class="isCurrentVnFavorite ? 'fill-red-500 text-red-500' : 'text-neutral-500 dark:text-neutral-400'"
          />
        </button>
      </template>
    </AppHeader>

    <!-- 骨架屏 -->
    <div v-if="loading" class="animate-pulse space-y-4">
      <div class="h-44 rounded-xl bg-neutral-100 dark:bg-neutral-800"></div>
      <div class="h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 w-2/3"></div>
      <div class="h-4 rounded-lg bg-neutral-100 dark:bg-neutral-800 w-1/2"></div>
      <div class="space-y-2">
        <div class="h-4 rounded-lg bg-neutral-100 dark:bg-neutral-800"></div>
        <div class="h-4 rounded-lg bg-neutral-100 dark:bg-neutral-800"></div>
        <div class="h-4 rounded-lg bg-neutral-100 dark:bg-neutral-800 w-4/5"></div>
      </div>
    </div>

    <!-- 错误处理 -->
    <div v-else-if="error || !vn" class="text-center py-12 text-sm text-neutral-400 dark:text-neutral-500">
      {{ error || t('vn.not_found') }}
      <div class="mt-4">
        <button @click="retryLoad" class="rounded-lg bg-neutral-900 px-4 py-2 text-white text-xs font-bold dark:bg-neutral-100 dark:text-neutral-900 active:scale-95 transition">
          {{ t('common.retry') }}
        </button>
      </div>
    </div>

    <!-- 详情内容 (Notion Style Layout) -->
    <div v-else class="space-y-5">
      <!-- 1. 封面图与基本信息 (固定在选项卡上方) -->
      <div class="flex flex-col items-center sm:flex-row sm:items-start gap-4 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800">
        <div
          class="relative flex-shrink-0 overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-sm"
          :class="[ vn.image?.dims && vn.image.dims[0] > vn.image.dims[1] ? 'w-full max-w-[280px] aspect-[4/3]' : 'w-full max-w-[180px] aspect-[3/4]' ]"
        >
          <!-- 正常图片 -->
          <ion-img
            v-if="vn.image?.url && !(coverAction === 'hide' && !revealedItems.has('cover'))"
            :key="`vn-cover-${imageLoader.getRetryCount('vn-cover')}`"
            :src="imageLoader.resolveSrc('vn-cover', vn.image.thumbnail || vn.image.url)"
            :alt="vn.title"
            class="h-full w-full object-cover transition-opacity duration-500"
            :class="{ 'opacity-0': !imageLoader.isSuccess('vn-cover') }"
            @ionImgWillLoad="imageLoader.onWillLoad('vn-cover')"
            @ionImgDidLoad="imageLoader.onLoad('vn-cover')"
            @ionError="imageLoader.onError('vn-cover')"
          />
          <ion-spinner
            v-if="vn.image?.url && imageLoader.isLoading('vn-cover')"
            name="crescent"
            class="absolute inset-0 m-auto z-10 text-neutral-400 dark:text-neutral-500"
            style="width: 24px; height: 24px;"
          />
          <div
            v-if="vn.image?.url && imageLoader.isError('vn-cover')"
            @click="imageLoader.retry('vn-cover')"
            class="absolute inset-0 flex items-center justify-center bg-neutral-100 dark:bg-neutral-800 z-10 cursor-pointer"
          >
            <Icon icon="lucide:refresh-cw" class="h-5 w-5 text-neutral-400 dark:text-neutral-500" />
          </div>
          <!-- 图标占位 -->
          <div v-if="coverAction === 'hide' && !revealedItems.has('cover')" class="absolute inset-0 flex items-center justify-center bg-neutral-100 dark:bg-neutral-800 z-10">
            <Icon icon="lucide:eye-off" class="h-10 w-10 text-neutral-400 dark:text-neutral-500" />
          </div>
          <!-- 无封面兜底 -->
          <div v-if="!vn.image?.url" class="h-full w-full flex items-center justify-center bg-neutral-100 dark:bg-neutral-800">
            <Icon icon="lucide:image" class="h-10 w-10 text-neutral-300 dark:text-neutral-600" />
          </div>
          <!-- 小眼睛切换按钮 -->
          <button
            v-if="coverAction === 'hide'"
            @click.stop="toggleReveal('cover')"
            class="absolute bottom-2 right-2 p-1.5 rounded-full bg-black/40 text-white hover:bg-black/60 transition z-20"
          >
            <Icon :icon="revealedItems.has('cover') ? 'lucide:eye' : 'lucide:eye-off'" class="h-3.5 w-3.5" />
          </button>
        </div>

        <!-- 基本属性信息 -->
        <div class="flex-1 min-w-0 space-y-3 w-full">
          <div>
            <h1
              class="text-lg font-bold tracking-tight text-neutral-900 dark:text-neutral-100 leading-snug copyable-title"
              @click="copyTitleText(getTitle(vn))"
            >{{ getTitle(vn) }}</h1>
            <p
              v-if="getAltTitle(vn)"
              class="text-xs text-neutral-400 dark:text-neutral-500 font-medium mt-0.5 copyable-title"
              @click="copyTitleText(getAltTitle(vn))"
            >{{ getAltTitle(vn) }}</p>
          </div>

          <!-- 跨站搜索（显眼入口：内联在信息卡里，点击展开全部站点） -->
          <div v-if="crossSearchGroups.length">
            <button
              type="button"
              @click="showCrossSearch = !showCrossSearch"
              class="flex w-full items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-800 text-left hover:bg-neutral-100 dark:hover:bg-neutral-700 active:scale-[0.99] transition"
            >
              <Icon icon="lucide:compass" class="h-4 w-4 text-indigo-500 dark:text-indigo-400 shrink-0" />
              <span class="text-xs font-bold text-neutral-800 dark:text-neutral-200">{{ t('vn.links.cross_search') }}</span>
              <span class="text-[10px] text-neutral-400 dark:text-neutral-500 truncate flex-1 min-w-0">{{ crossSearchKeyword }}</span>
              <Icon :icon="showCrossSearch ? 'lucide:chevron-up' : 'lucide:chevron-down'" class="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500 shrink-0" />
            </button>
            <div v-if="showCrossSearch" class="mt-2 space-y-2">
              <!-- 搜索方式：游戏名 / v{id} -->
              <div class="flex items-center gap-1.5 min-w-0">
                <button
                  type="button"
                  @click="setCrossSearchMode('title')"
                  class="shrink-0 whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors"
                  :class="crossSearchMode === 'title'
                    ? 'bg-indigo-500 border-indigo-500 text-white'
                    : 'border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400'"
                >{{ t('vn.links.cross_mode_title') }}</button>
                <button
                  type="button"
                  @click="setCrossSearchMode('vn')"
                  class="shrink-0 whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors"
                  :class="crossSearchMode === 'vn'
                    ? 'bg-indigo-500 border-indigo-500 text-white'
                    : 'border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400'"
                >{{ vn.id }}</button>
                <span class="text-[10px] text-neutral-400 dark:text-neutral-500 ml-1 truncate min-w-0 flex-1">{{ crossSearchKeyword }}</span>
              </div>

              <div v-for="group in crossSearchGroups" :key="'inline-' + group.key">
                <div class="text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-1.5">{{ t(group.labelKey) }}</div>
                <div class="flex flex-wrap gap-1.5">
                  <a
                    v-for="site in group.sites"
                    :key="'inline-' + group.key + '-' + site.name"
                    :href="site.url"
                    data-cross-search
                    target="_blank"
                    rel="noopener noreferrer"
                    @click="handleCrossSearchClick($event, site)"
                    class="inline-flex items-center px-3 py-1.5 rounded-full text-xs border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 active:bg-neutral-200 dark:active:bg-neutral-700 transition-colors"
                  >
                    {{ site.name }}
                  </a>
                </div>
              </div>

              <!-- 换个标题搜 -->
              <div v-if="crossSearchChips.length > 1" class="pt-1 border-t border-neutral-100 dark:border-neutral-700/60">
                <div class="text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-1.5">{{ t('vn.links.cross_other_titles') }}</div>
                <div class="flex flex-wrap gap-1">
                  <button
                    v-for="chip in crossSearchChips"
                    :key="'chip-' + chip.text"
                    type="button"
                    :title="chip.text"
                    @click="pickCrossSearchTitle(chip.text)"
                    class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] border transition-colors max-w-full"
                    :class="crossSearchMode === 'title' && crossSearchKeyword === chip.text
                      ? 'bg-indigo-50 dark:bg-indigo-500/20 border-indigo-300 dark:border-indigo-500/50 text-indigo-700 dark:text-indigo-300'
                      : 'border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'"
                  >
                    <span class="rounded bg-black/5 dark:bg-white/10 px-1 py-0.5 text-[9px] uppercase opacity-70 shrink-0">{{ chip.lang }}</span>
                    <span class="truncate min-w-0">{{ chip.text }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-[80px_1fr] items-start gap-y-1.5 text-xs text-neutral-600 dark:text-neutral-400">
            <span class="text-neutral-400 dark:text-neutral-500">{{ t('vn.id') }}</span>
            <span class="font-mono text-neutral-800 dark:text-neutral-200">{{ vn.id }}</span>

            <span class="text-neutral-400 dark:text-neutral-500">{{ t('vn.developer') }}</span>
            <span class="truncate flex flex-wrap gap-1">
              <template v-if="vn.developers?.length">
                <span
                  v-for="(d, i) in vn.developers"
                  :key="d.id || i"
                  @click="d.id && router.push(`/producer/${d.id}`)"
                  class="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-neutral-100 dark:bg-neutral-700/70 text-neutral-700 dark:text-neutral-300 font-medium cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-600 active:bg-neutral-300 active:scale-95 transition-all"
                >
                  {{ d.name }}
                  <Icon icon="lucide:external-link" class="h-3 w-3 text-neutral-400 dark:text-neutral-500 shrink-0" />
                </span>
              </template>
              <span v-else class="text-neutral-800 dark:text-neutral-300">{{ t('metadata.gender.unknown') }}</span>
            </span>

            <span class="text-neutral-400 dark:text-neutral-500">{{ t('vn.released') }}</span>
            <span class="text-neutral-800 dark:text-neutral-200">{{ vn.released || t('metadata.gender.unknown') }}</span>

            <span class="text-neutral-400 dark:text-neutral-500 pt-0.5">{{ t('vn.olang') }}</span>
            <div>
              <span
                v-if="vn.olang"
                class="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md bg-neutral-100 dark:bg-neutral-700/70 text-neutral-700 dark:text-neutral-300 font-medium"
                :title="t(`metadata.lang.${vn.olang}`, vn.olang)"
              >
                <LanguageFlag :lang="vn.olang" class="h-3.5 w-3.5" />
                <span class="truncate">{{ t(`metadata.lang.${vn.olang}`, vn.olang) }}</span>
              </span>
              <span v-else class="text-neutral-800 dark:text-neutral-300">{{ t('metadata.gender.unknown') }}</span>
            </div>

            <span class="text-neutral-400 dark:text-neutral-500 pt-0.5">{{ t('vn.languages') }}</span>
            <div class="flex flex-wrap gap-1">
              <span v-for="lang in (vn.languages || [])" :key="lang"
                class="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md bg-neutral-100 dark:bg-neutral-700/70 text-neutral-700 dark:text-neutral-300 font-medium"
                :title="t(`metadata.lang.${lang}`, lang)">
                <LanguageFlag :lang="lang" class="h-3.5 w-3.5" />
                <span>{{ t(`metadata.lang.${lang}`, lang) }}</span>
              </span>
              <span v-if="!vn.languages?.length" class="text-neutral-800 dark:text-neutral-300">{{ t('metadata.gender.unknown') }}</span>
            </div>

            <span class="text-neutral-400 dark:text-neutral-500 pt-0.5">{{ t('vn.platforms') }}</span>
            <div class="flex flex-wrap gap-1">
              <span v-for="p in (vn.platforms || [])" :key="p"
                class="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-neutral-100 dark:bg-neutral-700/70 text-neutral-700 dark:text-neutral-300 font-medium">
                <Icon :icon="getPlatformIcon(p)" class="h-3.5 w-3.5 shrink-0" />
                {{ t(`metadata.platform.${p}`, p) }}
              </span>
              <span v-if="!vn.platforms?.length" class="text-neutral-800 dark:text-neutral-300">{{ t('metadata.gender.unknown') }}</span>
            </div>

            <span class="text-neutral-400 dark:text-neutral-500">{{ t('vn.length') }}</span>
            <button
              type="button"
              @click="openLengthVote"
              class="inline-flex w-fit flex-col items-start gap-0.5 rounded-md px-1.5 py-0.5 -ml-1.5 text-left text-neutral-800 dark:text-neutral-200 transition hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
              :title="t('vn.length_vote_hint')"
            >
              <span class="inline-flex items-center gap-1">
                <span>{{ lengthDisplay }}</span>
                <span
                  v-if="localLengthVote?.minutes"
                  class="inline-flex items-center gap-0.5 rounded-full bg-neutral-100 dark:bg-neutral-700/70 px-1.5 py-0.5 -my-0.5 text-[9px] font-medium text-neutral-500 dark:text-neutral-300"
                  :class="localLengthVote.syncedAt ? 'text-emerald-600 dark:text-emerald-400' : ''"
                >{{ localLengthVote.syncedAt ? t('vn.length_vote.synced_badge') : t('vn.length_vote.local_badge') }}</span>
                <Icon icon="lucide:pencil-line" class="h-3 w-3 shrink-0 text-neutral-400 dark:text-neutral-500" />
              </span>
              <!-- 自己填过时长后，社区平均与投票人数仍然保留显示 -->
              <span
                v-if="localLengthVote?.minutes && hasCommunityLength"
                class="text-[10px] font-normal leading-tight text-neutral-400 dark:text-neutral-500"
              >
                {{ t('vn.length_vote.community_avg') }} · {{ communityLengthText }}
              </span>
            </button>

            <template v-if="vn.rating">
              <span class="text-neutral-400 dark:text-neutral-500">{{ t('vn.rating') }}</span>
              <span class="text-neutral-800 dark:text-neutral-200 font-semibold flex items-center gap-1">
                <Icon icon="lucide:star" class="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
                {{ vn.rating }} ({{ t('vn.votes', { count: vn.votecount }) }})
              </span>
            </template>

            <!-- 收藏状态 -->
            <template v-if="isLoggedIn">
              <!-- 骨架屏：加载中 -->
              <template v-if="collectionLoading">
                <span class="text-neutral-400 dark:text-neutral-500">{{ t('vn.status.title') }}</span>
                <div class="h-5 w-20 rounded bg-neutral-100 dark:bg-neutral-700 animate-pulse"></div>

                <span class="text-neutral-400 dark:text-neutral-500">{{ t('vn.status.my_vote') }}</span>
                <div class="h-4 w-16 rounded bg-neutral-100 dark:bg-neutral-700 animate-pulse"></div>

                <span class="text-neutral-400 dark:text-neutral-500">{{ t('vn.status.notes') }}</span>
                <div class="h-10 w-full rounded bg-neutral-100 dark:bg-neutral-700 animate-pulse"></div>

                <span class="text-neutral-400 dark:text-neutral-500">{{ t('vn.status.started') }}</span>
                <div class="h-4 w-20 rounded bg-neutral-100 dark:bg-neutral-700 animate-pulse"></div>

                <span class="text-neutral-400 dark:text-neutral-500">{{ t('vn.status.finished_date') }}</span>
                <div class="h-4 w-20 rounded bg-neutral-100 dark:bg-neutral-700 animate-pulse"></div>

                <span></span>
                <div class="h-5 w-14 rounded bg-neutral-100 dark:bg-neutral-700 animate-pulse"></div>
              </template>

              <!-- 已加载 -->
              <template v-else>
                <span class="text-neutral-400 dark:text-neutral-500">{{ t('vn.status.title') }}</span>
                <div class="flex flex-col gap-1.5">
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      @click="showStatusActionSheet = true"
                      :disabled="statusLoading"
                      class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-medium text-neutral-800 dark:text-neutral-200 hover:border-neutral-300 dark:hover:border-neutral-600 transition cursor-pointer max-w-[220px]"
                    >
                      <Icon
                        :icon="currentSelectedLabels.length === 0 ? 'lucide:bookmark-plus' : (currentStatusLabel?.icon || 'lucide:tag')"
                        class="h-3.5 w-3.5 shrink-0"
                        :class="currentSelectedLabels.length === 0 ? 'text-neutral-400 dark:text-neutral-500' : (currentStatusLabel?.color || 'text-amber-500 dark:text-amber-400')"
                      />
                      <span class="truncate">{{ currentStatusLabel?.name || t('vn.status.none') }}</span>
                      <Icon icon="lucide:chevron-down" class="h-3 w-3 text-neutral-400 dark:text-neutral-500 shrink-0 ml-0.5" />
                    </button>
                    <Icon
                      v-if="statusLoading"
                      icon="lucide:loader-2"
                      class="h-4 w-4 animate-spin text-neutral-400 dark:text-neutral-500 flex-shrink-0"
                    />
                  </div>
                  <!-- 多标签 Chips 展示 -->
                  <div v-if="currentSelectedLabels.length > 1" class="flex flex-wrap gap-1 mt-0.5">
                    <span
                      v-for="lbl in currentSelectedLabels"
                      :key="lbl.id"
                      class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200/60 dark:border-neutral-700/60 font-medium"
                    >
                      <Icon :icon="lbl.icon" class="h-2.5 w-2.5" :class="lbl.color" />
                      {{ lbl.name }}
                    </span>
                  </div>
                </div>

                <!-- 我的评分：未收藏时先提示加入收藏，避免点了没反应 -->
                <span class="text-neutral-400 dark:text-neutral-500">{{ t('vn.status.my_vote') }}</span>
                <button
                  v-if="collectionEntry"
                  type="button"
                  @click="openEditModal"
                  class="inline-flex items-center gap-1.5 w-fit rounded-md px-1.5 py-0.5 -ml-1.5 text-left transition hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                  :title="t('vn.status.vote_hint')"
                >
                  <Icon
                    icon="lucide:star"
                    class="h-3.5 w-3.5 shrink-0"
                    :class="formattedVote != null ? 'text-amber-500 fill-amber-500' : 'text-neutral-300 dark:text-neutral-600'"
                  />
                  <span class="text-neutral-800 dark:text-neutral-200" :class="{ 'text-neutral-400 dark:text-neutral-500': !formattedVote }">
                    {{ formattedVote != null ? `${formattedVote.toFixed(1)} / 10` : t('vn.status.add_vote') }}
                  </span>
                </button>
                <button
                  v-else
                  type="button"
                  @click="showStatusActionSheet = true"
                  class="inline-flex items-center gap-1.5 w-fit rounded-md px-1.5 py-0.5 -ml-1.5 text-left transition hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                >
                  <Icon icon="lucide:star" class="h-3.5 w-3.5 shrink-0 text-neutral-300 dark:text-neutral-600" />
                  <span class="text-neutral-400 dark:text-neutral-500">{{ t('vn.status.vote_need_collect') }}</span>
                </button>

                <!-- 笔记 -->
                <span class="text-neutral-400 dark:text-neutral-500">{{ t('vn.status.notes') }}</span>
                <template v-if="collectionEntry?.notes">
                  <div
                    class="rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 pl-3 pr-2 py-2 mt-0.5"
                  >
                    <p
                      class="text-xs text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap break-words leading-relaxed"
                      :class="[notesExpanded ? '' : 'line-clamp-5']"
                    >{{ collectionEntry.notes }}</p>
                    <button
                      v-if="collectionEntry.notes.length > 100"
                      @click="notesExpanded = !notesExpanded"
                      class="mt-1 flex items-center gap-1 text-[10px] text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 transition cursor-pointer"
                    >
                      <Icon :icon="notesExpanded ? 'lucide:chevron-up' : 'lucide:chevron-down'" class="h-3 w-3" />
                      {{ notesExpanded ? t('vn.notes_collapse') : t('vn.notes_expand') }}
                    </button>
                  </div>
                </template>
                <span v-else class="text-neutral-400 dark:text-neutral-500">—</span>

                <!-- 开始日期 -->
                <span class="text-neutral-400 dark:text-neutral-500">{{ t('vn.status.started') }}</span>
                <span class="text-neutral-800 dark:text-neutral-200" :class="{ 'text-neutral-400 dark:text-neutral-500': !collectionEntry?.started }">
                  {{ collectionEntry?.started || '—' }}
                </span>

                <!-- 结束日期 -->
                <span class="text-neutral-400 dark:text-neutral-500">{{ t('vn.status.finished_date') }}</span>
                <span class="text-neutral-800 dark:text-neutral-200" :class="{ 'text-neutral-400 dark:text-neutral-500': !collectionEntry?.finished }">
                  {{ collectionEntry?.finished || '—' }}
                </span>

                <!-- 编辑按钮 -->
                <span></span>
                <button
                  @click="openEditModal"
                  class="flex items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition cursor-pointer w-fit"
                >
                  <Icon icon="lucide:pencil" class="h-3.5 w-3.5" />
                  {{ t('vn.status.edit') }}
                </button>
              </template>
            </template>
          </div>
        </div>
      </div>

      <!-- 2. 简介 (固定在选项卡上方) -->
      <div class="space-y-1.5" v-if="vn.description">
        <div class="flex items-center justify-between gap-3">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">{{ t('vn.description') }}</h3>
          <button
            @click="translateDescription"
            :disabled="translationLoading"
            class="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-1 text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 transition disabled:cursor-not-allowed disabled:opacity-60 hover:border-neutral-300 hover:text-neutral-700 dark:hover:border-neutral-600 dark:hover:text-neutral-200"
          >
            <Icon :icon="translationLoading ? 'lucide:loader-circle' : 'lucide:languages'" class="h-3.5 w-3.5" :class="{ 'animate-spin': translationLoading }" />
            {{ translationLoading ? t('vn.translation.loading') : (translatedDescription ? t('vn.translation.retranslate') : t('vn.translation.action')) }}
          </button>
        </div>
        <div class="relative">
          <div
            class="relative border-l-3 border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-800 px-4 py-3 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap bbcode-container selectable-text transition-all duration-300"
            :class="[isDescriptionExpanded ? 'rounded-lg' : 'max-h-32 overflow-hidden rounded-t-lg rounded-b-none']"
          >
            <div v-html="parseBBCode(vn.description)"></div>
            <!-- 渐变蒙层，移至简介卡片内部以适配圆角裁剪 -->
            <div
              v-if="!isDescriptionExpanded"
              class="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-neutral-50 dark:from-neutral-800 to-transparent pointer-events-none"
            ></div>
          </div>
          <button
            @click="isDescriptionExpanded = !isDescriptionExpanded"
            class="mt-1 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 flex items-center gap-0.5 transition-colors"
          >
            <Icon :icon="isDescriptionExpanded ? 'lucide:chevron-up' : 'lucide:chevron-down'" class="h-3 w-3" />
            {{ isDescriptionExpanded ? t('vn.collapse') : t('vn.expand') }}
          </button>
        </div>

        <div v-if="translatedDescription || translationError || translationLoading" class="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3 space-y-2">
          <div class="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-violet-500 dark:text-violet-400">
            <Icon icon="lucide:languages" class="h-3.5 w-3.5" />
            <span>{{ t('vn.translation.title') }}</span>
          </div>

          <div v-if="translationLoading" class="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <Icon icon="lucide:loader-circle" class="h-4 w-4 animate-spin" />
            <span>{{ t('vn.translation.loading') }}</span>
          </div>

          <div v-else-if="translationError" class="text-xs leading-relaxed text-rose-500 dark:text-rose-400">
            {{ translationError }}
          </div>

          <p v-else class="text-xs leading-relaxed text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap selectable-text">
            {{ translatedDescription }}
          </p>
        </div>
      </div>

      <!-- 3. 相关作品 (固定在选项卡上方) -->
      <div class="space-y-1.5" v-if="vn.relations && vn.relations.length > 0">
        <div class="flex items-center justify-between">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">{{ t('vn.relations') }}</h3>
          <!-- 同人作开关 -->
          <label class="flex items-center gap-1.5 cursor-pointer select-none">
            <span class="text-[10px] text-neutral-400 dark:text-neutral-500">{{ t('vn.show_doujin', '同人作') }}</span>
            <button
              @click="showDoujin = !showDoujin"
              class="relative inline-flex h-4 w-7 items-center rounded-full transition-colors cursor-pointer"
              :class="showDoujin ? 'bg-neutral-800 dark:bg-neutral-200' : 'bg-neutral-300 dark:bg-neutral-600'"
              role="switch"
              :aria-checked="showDoujin"
            >
              <span
                class="inline-block h-3 w-3 transform rounded-full bg-white transition-all"
                :class="showDoujin ? 'translate-x-3.5' : 'translate-x-0.5'"
              />
            </button>
          </label>
        </div>
        <VnList
          :items="filteredRelations"
          :show-sort="false"
          :compact="true"
          :show-footer-status="false"
          :max-items="8"
          :empty-title="t('vn.relations_empty_title', '暂无相关作品')"
          :empty-desc="t('vn.relations_empty_desc', '该作品没有相关联的其他作品')"
          default-layout="list"
          title-mode="ja-romaji"
          show-status
          storage-key="vndb_vn_relations_layout_v2"
        />
      </div>

      <!-- 4. 跨站搜索已内联到上方信息卡，不再单独占区块 -->

      <!-- 选项卡导航 (Notion Tab Style) -->
      <div class="border-b border-neutral-200 dark:border-neutral-700 pt-2">
        <nav class="flex gap-x-[15px] -mb-px overflow-x-auto no-scrollbar" aria-label="Tabs">
          <button
            v-for="tab in [
              { id: 'releases', name: t('vn.tabs.releases') },
              { id: 'characters', name: t('vn.tabs.characters') },
              { id: 'staff', name: t('vn.tabs.staff') },
              { id: 'tags', name: t('vn.tabs.tags') },
              { id: 'covers', name: t('vn.tabs.covers') },
              { id: 'screenshots', name: t('vn.tabs.screenshots') },
              { id: 'quotes', name: t('vn.tabs.quotes') },
              { id: 'stats', name: t('vn.tabs.stats') },
            ]"
            :key="tab.id"
            @click="activeTab = tab.id"
            class="whitespace-nowrap pb-2.5 px-0.5 border-b-2 font-medium text-xs transition-colors"
            :class="[ activeTab === tab.id ? 'border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100 font-semibold' : 'border-transparent text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:border-neutral-300 dark:hover:border-neutral-600' ]"
          >
            {{ tab.name }}
          </button>
        </nav>
      </div>

      <!-- 选项卡对应的内容区 -->
      <div class="space-y-4 pt-1">
        <!-- 1. 版本发行 Tab -->
        <div v-if="activeTab === 'releases'" class="space-y-3">
          <div v-if="releasesLoading" class="flex flex-col items-center justify-center py-10 gap-2">
            <Icon icon="eos-icons:loading" class="h-6 w-6 text-neutral-300 dark:text-neutral-600" />
            <span class="text-[10px] text-neutral-400 dark:text-neutral-500 font-bold uppercase tracking-widest">{{ t('release.loading') }}</span>
          </div>
          <div v-else-if="releases.length === 0" class="text-center py-6 text-xs text-neutral-400 dark:text-neutral-500">
            {{ t('vn.releases.empty') }}
          </div>
          <div v-else class="space-y-3">
            <!-- 分组工具行：说明 + 全部展开/收起 -->
            <div class="flex items-center justify-between px-0.5">
              <span class="text-[10px] text-neutral-400 dark:text-neutral-500 inline-flex items-center gap-1">
                <Icon icon="lucide:languages" class="h-3 w-3 shrink-0" />{{ t('vn.releases.group_hint') }}
              </span>
              <button
                type="button"
                @click="toggleAllReleaseGroups"
                class="text-[10px] text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition cursor-pointer"
              >{{ allReleaseGroupsExpanded ? t('vn.releases.collapse_all') : t('vn.releases.expand_all') }}</button>
            </div>

            <!-- 同语言归为一组，可折叠 -->
            <div
              v-for="group in releaseGroups"
              :key="group.lang || '__none'"
              class="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden"
            >
              <button
                type="button"
                @click="toggleReleaseGroup(group.lang)"
                class="w-full flex items-center gap-2 px-3 py-2.5 bg-neutral-50 dark:bg-neutral-800/60 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
              >
                <Icon
                  :icon="isReleaseGroupExpanded(group.lang) ? 'lucide:chevron-down' : 'lucide:chevron-right'"
                  class="h-3.5 w-3.5 shrink-0 text-neutral-400 dark:text-neutral-500"
                />
                <LanguageFlag v-if="group.lang" :lang="group.lang" class="h-3.5 w-3.5 shrink-0" />
                <Icon v-else icon="lucide:globe" class="h-3.5 w-3.5 shrink-0 text-neutral-400 dark:text-neutral-500" />
                <span class="text-xs font-semibold text-neutral-800 dark:text-neutral-200">{{ group.lang ? t(`metadata.lang.${group.lang}`, group.lang) : t('vn.releases.lang_other') }}</span>
                <span class="text-[10px] text-neutral-400 dark:text-neutral-500">{{ t('vn.releases.count', { count: group.items.length }) }}</span>
              </button>

              <div v-show="isReleaseGroupExpanded(group.lang)" class="space-y-3 p-3 bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800">
                <div
                  v-for="rel in group.items"
                  :key="rel.id"
                  @click="router.push(`/release/${rel.id}`)"
                  class="p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:shadow-xs hover:border-neutral-300 dark:hover:border-neutral-600 transition space-y-2 cursor-pointer active:scale-[0.98]"
                >
              <div class="flex justify-between items-start gap-2">
                <div class="min-w-0">
                  <h4 class="font-semibold text-xs text-neutral-800 dark:text-neutral-200 leading-snug">{{ rel.alttitle || rel.title }}</h4>
                  <p v-if="rel.alttitle && rel.title && rel.alttitle !== rel.title" class="text-[10px] text-neutral-400 dark:text-neutral-500 truncate mt-0.5">{{ rel.title }}</p>
                </div>
                <span 
                  class="text-[9px] px-1.5 py-0.5 rounded flex-shrink-0"
                  :class="rel.official ? 'bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900' : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400'"
                >
                  {{ rel.official ? t('vn.releases.official') : t('vn.releases.unofficial') }}
                </span>
              </div>
              
              <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] text-neutral-500 dark:text-neutral-400 pt-1 border-t border-neutral-100 dark:border-neutral-800">
                <div>{{ t('vn.releases.date') }}: <span class="text-neutral-700 dark:text-neutral-300">{{ rel.released || t('metadata.gender.unknown') }}</span></div>
                <div class="flex flex-wrap items-center gap-1">{{ t('vn.releases.lang') }}:
                  <template v-if="rel.languages?.length">
                    <span v-for="l in rel.languages" :key="l.lang" class="inline-flex items-center gap-0.5 text-neutral-700 dark:text-neutral-300">
                      <LanguageFlag :lang="l.lang" class="h-3 w-3 shrink-0" />{{ t(`metadata.lang.${l.lang}`, l.lang) }}
                    </span>
                  </template>
                  <span v-else class="text-neutral-700 dark:text-neutral-300">{{ t('metadata.gender.unknown') }}</span>
                </div>
                <div class="flex flex-wrap items-center gap-1">{{ t('vn.releases.platform') }}:
                  <template v-if="rel.platforms?.length">
                    <span v-for="p in rel.platforms" :key="p" class="inline-flex items-center gap-0.5 text-neutral-700 dark:text-neutral-300">
                      <Icon :icon="getPlatformIcon(p)" class="h-3 w-3 shrink-0" />{{ t(`metadata.platform.${p}`, p) }}
                    </span>
                  </template>
                  <span v-else class="text-neutral-700 dark:text-neutral-300">{{ t('metadata.gender.unknown') }}</span>
                </div>
                <div v-if="rel.minage !== null" class="flex items-center gap-1">{{ t('vn.releases.age') }}: <AgeRating :minage="rel.minage" :uncensored="rel.uncensored" class="font-semibold" /></div>
              </div>
              
              <!-- 外部链接（VNDB 提供，走「版本外链」独立设置） -->
              <div v-if="rel.extlinks?.length" class="flex flex-wrap items-center gap-1.5 pt-1" @click.stop>
                <span class="text-[11px] text-neutral-500 dark:text-neutral-400 shrink-0">{{ t('release.extlinks') }}</span>
                <button
                  v-for="link in rel.extlinks"
                  :key="link.url"
                  type="button"
                  @click.stop="openReleaseExtLink(link)"
                  class="inline-flex items-center gap-1 rounded-full bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1 text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition active:scale-[0.98] cursor-pointer"
                >
                  {{ link.label }}
                  <Icon icon="lucide:external-link" class="h-3 w-3 shrink-0 opacity-60" />
                </button>
              </div>

              <div v-if="rel.notes" class="text-[10px] text-neutral-400 dark:text-neutral-500 bg-neutral-50 dark:bg-neutral-800 p-1.5 rounded whitespace-pre-wrap leading-normal" v-html="parseBBCode(rel.notes)"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 2. 封面画册 Tab (从各种 Release 汇总正面、背面、数字大图) -->
        <div v-else-if="activeTab === 'covers'" class="space-y-3">
          <div v-if="releasesLoading" class="flex flex-col items-center justify-center py-10 gap-2">
            <Icon icon="eos-icons:loading" class="h-6 w-6 text-neutral-300 dark:text-neutral-600" />
            <span class="text-[10px] text-neutral-400 dark:text-neutral-500 font-bold uppercase tracking-widest">{{ t('release.loading') }}</span>
          </div>
          <div v-else-if="allCovers.length === 0" class="text-center py-6 text-xs text-neutral-400 dark:text-neutral-500">
            {{ t('vn.covers.empty') }}
          </div>
          <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div
              v-for="(cover, idx) in filteredCovers"
              :key="idx"
              @click="openLightbox(idx, filteredCovers)"
              class="p-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition cursor-pointer flex flex-col justify-between items-center text-center space-y-2"
            >
              <div class="h-40 w-full overflow-hidden rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 flex items-center justify-center relative">
                <ion-img
                  :key="`cover-${idx}-${imageLoader.getRetryCount('cover-' + idx)}`"
                  :src="imageLoader.resolveSrc(`cover-${idx}`, cover.thumbnail || cover.url)"
                  :alt="cover.title || 'cover'"
                  class="max-h-full max-w-full object-contain transition-opacity duration-500"
                  :class="{ 'blur-md': shouldBlurCover(cover), 'opacity-0': !imageLoader.isSuccess('cover-' + idx) }"
                  @ionImgWillLoad="imageLoader.onWillLoad('cover-' + idx)"
                  @ionImgDidLoad="imageLoader.onLoad('cover-' + idx)"
                  @ionError="imageLoader.onError('cover-' + idx)"
                />
                <ion-spinner
                  v-if="imageLoader.isLoading('cover-' + idx)"
                  name="crescent"
                  class="absolute inset-0 m-auto z-10 text-neutral-400 dark:text-neutral-500"
                  style="width: 20px; height: 20px;"
                />
                <div
                  v-if="imageLoader.isError('cover-' + idx)"
                  @click.stop="imageLoader.retry('cover-' + idx)"
                  class="absolute inset-0 flex items-center justify-center bg-neutral-100 dark:bg-neutral-800 z-10 cursor-pointer"
                >
                  <Icon icon="lucide:refresh-cw" class="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
                </div>
                <div v-if="shouldBlurCover(cover)" class="absolute inset-0 flex items-center justify-center bg-neutral-100/80 dark:bg-neutral-800/80">
                  <Icon icon="lucide:eye-off" class="h-6 w-6 text-neutral-400 dark:text-neutral-500" />
                </div>
              </div>
              <div class="w-full text-left">
                <div class="text-[10px] font-semibold text-neutral-800 dark:text-neutral-200 truncate">{{ cover.title }}</div>
                <div class="text-[9px] text-neutral-400 dark:text-neutral-500 mt-0.5">{{ cover.desc }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. 关联角色 Tab (展示更饱满的角色背景、属性三围，采用 Notion 网格卡片) -->
        <div v-else-if="activeTab === 'characters'" class="space-y-3">
          <div v-if="charactersLoading" class="flex flex-col items-center justify-center py-10 gap-2">
            <Icon icon="eos-icons:loading" class="h-6 w-6 text-neutral-300 dark:text-neutral-600" />
            <span class="text-[10px] text-neutral-400 dark:text-neutral-500 font-bold uppercase tracking-widest">{{ t('release.loading') }}</span>
          </div>

          <!-- 角色特征筛选面板 -->
          <div v-else-if="characters.length > 0" class="flex flex-col gap-1.5 p-2.5 rounded-lg border border-neutral-200/80 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-800/40">
            <!-- 剧透等级过滤 -->
            <div class="flex items-center justify-between gap-2">
              <span class="shrink-0 inline-flex items-center gap-1 text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
                <Icon icon="lucide:info" class="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
                {{ t('vn.characters.trait_spoiler_filter') }}
              </span>
              <div class="flex shrink-0 items-center gap-0.5 rounded-full bg-neutral-200/70 dark:bg-neutral-700/60 p-0.5">
                <button
                  v-for="level in [
                    { val: 0, label: t('vn.characters.trait_spoiler_0') },
                    { val: 1, label: t('vn.characters.trait_spoiler_1') },
                    { val: 2, label: t('vn.characters.trait_spoiler_2') }
                  ]"
                  :key="level.val"
                  @click="handleSelectTraitSpoiler(level.val)"
                  class="whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-medium leading-none transition-all cursor-pointer"
                  :class="[ traitSpoilerLevel === level.val ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 font-semibold shadow-xs' : 'text-neutral-500 dark:text-neutral-400 font-medium hover:text-neutral-800 dark:hover:text-neutral-200' ]"
                >
                  {{ level.label }}
                </button>
              </div>
            </div>

            <!-- 性内容过滤 -->
            <div class="flex items-center justify-between gap-2">
              <span class="shrink-0 inline-flex items-center gap-1 text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
                <Icon icon="lucide:layers" class="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
                {{ t('vn.characters.trait_sexual_filter') }}
              </span>
              <div class="flex shrink-0 items-center gap-0.5 rounded-full bg-neutral-200/70 dark:bg-neutral-700/60 p-0.5">
                <button
                  @click="showTraitSexual = false"
                  class="whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-medium leading-none transition-all cursor-pointer"
                  :class="[ !showTraitSexual ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 font-semibold shadow-xs' : 'text-neutral-500 dark:text-neutral-400 font-medium hover:text-neutral-800 dark:hover:text-neutral-200' ]"
                >
                  {{ t('vn.characters.trait_sexual_hide') }}
                </button>
                <button
                  @click="showTraitSexual = true"
                  class="whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-medium leading-none transition-all cursor-pointer"
                  :class="[ showTraitSexual ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 font-semibold shadow-xs' : 'text-neutral-500 dark:text-neutral-400 font-medium hover:text-neutral-800 dark:hover:text-neutral-200' ]"
                >
                  {{ t('vn.characters.trait_sexual_show') }}
                </button>
              </div>
            </div>
          </div>

          <div v-if="!charactersLoading && characters.length === 0" class="text-center py-6 text-xs text-neutral-400 dark:text-neutral-500">
            {{ t('vn.characters.empty') }}
          </div>
          <div v-else-if="!charactersLoading && characters.length > 0 && filteredCharacters.length === 0" class="text-center py-6 text-xs text-neutral-400 dark:text-neutral-500">
            {{ t('vn.characters.filtered_empty') }}
          </div>
          <div v-else-if="!charactersLoading && filteredCharacters.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div
              v-for="char in filteredCharacters"
              :key="char.id"
              class="p-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 flex items-start gap-3 shadow-xs hover:border-neutral-300 dark:hover:border-neutral-600 transition"
            >
              <!-- 角色立绘头像 - 点击跳转 -->
              <div
                @click="router.push(`/character/${char.id}`)"
                class="w-16 h-20 rounded-lg overflow-hidden flex-shrink-0 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 cursor-pointer hover:opacity-80 transition"
              >
                <ion-img
                  v-if="char.image?.url"
                  :key="`char-${char.id}-${imageLoader.getRetryCount('char-' + char.id)}`"
                  :src="char.image.url"
                  :alt="char.name || ''"
                  class="w-full h-full object-cover object-top transition-opacity duration-500"
                  :class="{ 'opacity-0': !imageLoader.isSuccess('char-' + char.id) }"
                  @ionImgWillLoad="imageLoader.onWillLoad('char-' + char.id)"
                  @ionImgDidLoad="imageLoader.onLoad('char-' + char.id)"
                  @ionError="imageLoader.onError('char-' + char.id)"
                />
                <ion-spinner
                  v-if="char.image?.url && imageLoader.isLoading('char-' + char.id)"
                  name="crescent"
                  class="absolute inset-0 m-auto z-10 text-neutral-400 dark:text-neutral-500"
                  style="width: 16px; height: 16px;"
                />
                <div
                  v-if="char.image?.url && imageLoader.isError('char-' + char.id)"
                  @click.stop="imageLoader.retry('char-' + char.id)"
                  class="absolute inset-0 flex items-center justify-center bg-neutral-100 dark:bg-neutral-700 z-10 cursor-pointer"
                >
                  <Icon icon="lucide:refresh-cw" class="h-3 w-3 text-neutral-400 dark:text-neutral-500" />
                </div>
                <div v-else class="w-full h-full flex items-center justify-center">
                  <Icon icon="lucide:user" class="h-6 w-6 text-neutral-300 dark:text-neutral-600" />
                </div>
              </div>

              <!-- 角色档案属性展示 -->
              <div class="flex-1 min-w-0 space-y-1">
                <div class="flex justify-between items-start gap-2">
                  <div
                    @click="router.push(`/character/${char.id}`)"
                    class="min-w-0 flex-1 cursor-pointer group"
                  >
                    <h4 class="font-bold text-xs text-neutral-900 dark:text-neutral-100 truncate group-hover:text-neutral-600 dark:group-hover:text-neutral-400 transition flex items-center gap-1">
                      {{ char.original || char.name }}
                      <Icon icon="lucide:chevron-right" class="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </h4>
                    <p v-if="char.original && char.name" class="text-[10px] text-neutral-400 dark:text-neutral-500 font-normal truncate leading-none mt-0.5">{{ char.name }}</p>
                  </div>
                  <span
                    class="text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                    :class="[ char.vns?.find(v => v.id === vn?.id || v.id === vn?.id)?.role === 'main' ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800/50' : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400' ]"
                  >
                    {{ translateCharRole(char.vns?.find(v => v.id === vn?.id || v.id === vn?.id)?.role || 'appears') }}
                  </span>
                </div>

                <!-- 各种身体三围与信息 (点击展开/收起) -->
                <div
                  @click="toggleCharExpansion(char.id)"
                  class="cursor-pointer"
                >
                  <div class="flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] text-neutral-400 dark:text-neutral-500 font-medium">
                    <span v-if="char.sex">{{ t('vn.characters.gender') }}: <strong class="text-neutral-700 dark:text-neutral-300 font-semibold">{{ translateGender(char.sex) }}</strong></span>
                    <span v-if="char.age">{{ t('vn.characters.age') }}: <strong class="text-neutral-700 dark:text-neutral-300 font-semibold">{{ char.age }}</strong></span>
                    <span v-if="char.blood_type">{{ t('vn.characters.blood_type') }}: <strong class="text-neutral-700 dark:text-neutral-300 font-semibold uppercase">{{ char.blood_type }}</strong></span>
                    <span v-if="char.height">{{ t('vn.characters.height') }}: <strong class="text-neutral-700 dark:text-neutral-300 font-semibold">{{ char.height }}cm</strong></span>
                    <span v-if="char.weight">{{ t('vn.characters.weight') }}: <strong class="text-neutral-700 dark:text-neutral-300 font-semibold">{{ char.weight }}kg</strong></span>
                    <span v-if="char.bust || char.waist || char.hips">
                      {{ t('vn.characters.measurements') }}: <strong class="text-neutral-700 dark:text-neutral-300 font-semibold">{{ char.bust || '?' }}/{{ char.waist || '?' }}/{{ char.hips || '?' }}</strong>
                      <strong v-if="char.cup" class="text-purple-600 dark:text-purple-400 font-semibold ml-0.5">({{ t('vn.characters.cup', { cup: char.cup }) }})</strong>
                    </span>
                    <span v-if="char.birthday">{{ t('vn.characters.birthday') }}: <strong class="text-neutral-700 dark:text-neutral-300 font-semibold">{{ t('vn.characters.birthday_val', { month: char.birthday[0], day: char.birthday[1] }) }}</strong></span>
                  </div>

                  <!-- 角色简述 -->
                  <div v-if="char.description || (char.traits && char.traits.length > 0)">
                    <p
                      v-if="char.description"
                      class="text-[10px] leading-relaxed text-neutral-500 dark:text-neutral-400 pt-1 border-t border-neutral-100 dark:border-neutral-800 transition-all duration-300 selectable-text"
                      :class="[expandedCharIds.has(char.id) ? '' : 'line-clamp-2']"
                      v-html="parseBBCode(char.description)"
                    ></p>
                    
                    <!-- 角色特征标签 (Traits) - 仅在展开时显示 -->
                    <div
                      v-if="expandedCharIds.has(char.id) && char.traits && char.traits.length > 0"
                      class="mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-800 space-y-2"
                    >
                      <div
                        v-for="(traits, group) in groupTraits(char.traits)"
                        :key="group"
                        class="space-y-1"
                      >
                        <h5 class="text-[8px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-tighter">{{ translateTraitGroup(group) }}</h5>
                        <div class="flex flex-wrap gap-1">
                          <span
                            v-for="trait in traits"
                            :key="trait.name"
                            class="px-1.5 py-0.5 rounded text-[8px] font-medium transition-colors"
                             :class="[ trait.spoiler === 2 ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-100 dark:border-red-800/50' : trait.spoiler === 1 ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-800/50' : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400 border border-transparent' ]"
                          >
                            {{ translateTraitName(trait.name) }}
                          </span>
                        </div>
                      </div>

                      <!-- Voiced by (CV) -->
                      <div v-if="getCharacterVA(char.id)" class="space-y-1">
                        <h5 class="text-[8px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-tighter">{{ t('vn.characters.voiced_by') }}</h5>
                        <div class="text-[10px] text-neutral-700 dark:text-neutral-300 font-medium">
                          <span
                            class="cursor-pointer hover:text-neutral-500 dark:hover:text-neutral-400 active:text-neutral-600 dark:active:text-neutral-300 transition-colors"
                            @click="getCharacterVA(char.id).staff?.id && router.push(`/staff/${getCharacterVA(char.id).staff.id}`)"
                          >{{ getCharacterVA(char.id).staff?.name }}</span>
                          <span v-if="getCharacterVA(char.id).staff?.original" class="text-[9px] text-neutral-400 dark:text-neutral-500 font-normal">({{ getCharacterVA(char.id).staff.original }})</span>
                        </div>
                      </div>
                    </div>

                    <div class="flex justify-end mt-0.5">
                      <Icon :icon="expandedCharIds.has(char.id) ? 'lucide:chevron-up' : 'lucide:chevron-down'" class="h-3 w-3 text-neutral-300 dark:text-neutral-600" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 4. 演职人员 Tab -->
        <div v-else-if="activeTab === 'staff'" class="space-y-5">
          <!-- 声优 (Voice Actors) -->
          <div class="space-y-2">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-neutral-400">{{ t('vn.staff.va_title') }}</h3>
            <div v-if="!vn.va || vn.va.length === 0" class="text-xs text-neutral-400 py-3 text-center">
              {{ t('vn.staff.va_empty') }}
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                v-for="(actor, idx) in vn.va"
                :key="idx"
                class="flex items-center gap-3 p-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
              >
                <!-- 角色头像 - 点击进入角色详情 -->
                <div
                  class="h-10 w-10 flex-shrink-0 rounded-full overflow-hidden border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 cursor-pointer"
                  @click="actor.character?.id && router.push(`/character/${actor.character.id}`)"
                >
                  <ion-img
                    v-if="actor.character?.image?.url"
                    :key="`va-char-${idx}-${imageLoader.getRetryCount('va-char-' + idx)}`"
                    :src="actor.character.image.url"
                    :alt="actor.character.name || ''"
                    class="h-full w-full object-cover object-top transition-opacity duration-500"
                    :class="{ 'opacity-0': !imageLoader.isSuccess('va-char-' + idx) }"
                    @ionImgWillLoad="imageLoader.onWillLoad('va-char-' + idx)"
                    @ionImgDidLoad="imageLoader.onLoad('va-char-' + idx)"
                    @ionError="imageLoader.onError('va-char-' + idx)"
                  />
                  <ion-spinner
                    v-if="actor.character?.image?.url && imageLoader.isLoading('va-char-' + idx)"
                    name="crescent"
                    class="absolute inset-0 m-auto z-10 text-neutral-400 dark:text-neutral-500"
                    style="width: 16px; height: 16px;"
                  />
                  <div
                    v-if="actor.character?.image?.url && imageLoader.isError('va-char-' + idx)"
                    @click.stop="imageLoader.retry('va-char-' + idx)"
                    class="absolute inset-0 flex items-center justify-center bg-neutral-100 dark:bg-neutral-700 z-10 cursor-pointer"
                  >
                    <Icon icon="lucide:refresh-cw" class="h-3 w-3 text-neutral-400 dark:text-neutral-500" />
                  </div>
                  <div v-else class="h-full w-full flex items-center justify-center">
                    <Icon icon="lucide:user" class="h-5 w-5 text-neutral-300 dark:text-neutral-600" />
                  </div>
                </div>
                
                <div class="min-w-0 flex-1">
                  <div
                    class="text-xs font-semibold text-neutral-800 dark:text-neutral-200 truncate cursor-pointer hover:text-neutral-500 dark:hover:text-neutral-400 active:text-neutral-600 dark:active:text-neutral-300 transition-colors"
                    @click="actor.character?.id && router.push(`/character/${actor.character.id}`)"
                  >
                    {{ actor.character?.name }}
                    <span v-if="actor.character?.original" class="text-[10px] text-neutral-400 dark:text-neutral-500 font-normal">({{ actor.character.original }})</span>
                  </div>
                  <div class="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
                    CV: <span
                      class="font-medium text-neutral-700 dark:text-neutral-300 cursor-pointer hover:text-neutral-500 dark:hover:text-neutral-400 active:text-neutral-600 dark:active:text-neutral-300 transition-colors"
                      @click="actor.staff?.id && router.push(`/staff/${actor.staff.id}`)"
                    >{{ actor.staff?.name }}</span>
                    <span v-if="actor.staff?.original" class="text-[9px] text-neutral-400 dark:text-neutral-500"> ({{ actor.staff.original }})</span>
                  </div>
                  <div v-if="actor.note" class="text-[9px] text-neutral-400 dark:text-neutral-500 italic truncate mt-0.5">
                    {{ actor.note }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 演职人员 (Staff)：放在声优配音卡片下面 -->
          <div class="space-y-2">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-neutral-400">{{ t('vn.staff.title') }}</h3>
            <div v-if="!vn.staff || vn.staff.length === 0" class="text-xs text-neutral-400 py-3 text-center">
              {{ t('vn.staff.empty') }}
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div
                v-for="(st, idx) in vn.staff"
                :key="idx"
                class="flex justify-between items-center p-2 rounded-lg border border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 active:bg-neutral-100 dark:active:bg-neutral-700 transition-colors"
                @click="st.id && router.push(`/staff/${st.id}`)"
              >
                <div class="min-w-0">
                  <div class="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate">{{ st.original || st.name }}</div>
                  <div v-if="st.original && st.name" class="text-[10px] text-neutral-400 dark:text-neutral-500 truncate">{{ st.name }}</div>
                </div>
                <span class="text-[10px] text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-700 px-2 py-0.5 rounded-full flex-shrink-0">
                  {{ translateStaffRole(st.role) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 5. 标签 Tab -->
        <div v-else-if="activeTab === 'tags'" class="space-y-4">
          <!-- 标签筛选面板（合并） -->
          <div class="flex flex-col gap-1.5 p-2.5 rounded-lg border border-neutral-200/80 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-800/40">
            <!-- 剧透等级过滤 -->
            <div class="flex items-center justify-between gap-2">
              <span class="shrink-0 inline-flex items-center gap-1 text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
                <Icon icon="lucide:info" class="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
                {{ t('vn.tags.spoiler_filter') }}
              </span>
              <div class="flex shrink-0 items-center gap-0.5 rounded-full bg-neutral-200/70 dark:bg-neutral-700/60 p-0.5">
                <button
                  v-for="level in [
                    { val: 0, label: t('vn.tags.spoiler_0') },
                    { val: 1, label: t('vn.tags.spoiler_1') },
                    { val: 2, label: t('vn.tags.spoiler_2') }
                  ]"
                  :key="level.val"
                  @click="handleSelectSpoiler(level.val)"
                  class="whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-medium leading-none transition-all cursor-pointer"
                  :class="[ spoilerLevel === level.val ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 font-semibold shadow-xs' : 'text-neutral-500 dark:text-neutral-400 font-medium hover:text-neutral-800 dark:hover:text-neutral-200' ]"
                >
                  {{ level.label }}
                </button>
              </div>
            </div>

            <!-- 标签分类过滤（多选，三分类与 VNDB 官网一致） -->
            <div class="flex items-center justify-between gap-2">
              <span class="shrink-0 inline-flex items-center gap-1 text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
                <Icon icon="lucide:layers" class="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
                {{ t('vn.tags.category_filter') }}
              </span>
              <div class="flex shrink-0 items-center gap-0.5 rounded-full bg-neutral-200/70 dark:bg-neutral-700/60 p-0.5">
                <button
                  v-for="cat in [
                    { val: 'cont', label: t('vn.tags.category_cont') },
                    { val: 'ero', label: t('vn.tags.category_ero') },
                    { val: 'tech', label: t('vn.tags.category_tech') }
                  ]"
                  :key="cat.val"
                  @click="toggleTagCategory(cat.val)"
                  class="whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-medium leading-none transition-all cursor-pointer"
                  :class="[ activeTagCategories.includes(cat.val) ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 font-semibold shadow-xs' : 'text-neutral-500 dark:text-neutral-400 font-medium hover:text-neutral-800 dark:hover:text-neutral-200' ]"
                >
                  {{ cat.label }}
                </button>
              </div>
            </div>

            <!-- 标签范围过滤（单选） -->
            <div class="flex items-center justify-between gap-2">
              <span class="shrink-0 inline-flex items-center gap-1 text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
                <Icon icon="lucide:filter" class="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
                {{ t('vn.tags.search_mode_filter') }}
              </span>
              <div class="flex shrink-0 items-center gap-0.5 rounded-full bg-neutral-200/70 dark:bg-neutral-700/60 p-0.5">
                <button
                  v-for="mode in [
                    { val: 'summary', label: t('vn.tags.search_mode_summary') },
                    { val: 'all', label: t('vn.tags.search_mode_all') }
                  ]"
                  :key="mode.val"
                  @click="tagSearchMode = mode.val"
                  class="whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-medium leading-none transition-all cursor-pointer"
                  :class="[ tagSearchMode === mode.val ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 font-semibold shadow-xs' : 'text-neutral-500 dark:text-neutral-400 font-medium hover:text-neutral-800 dark:hover:text-neutral-200' ]"
                >
                  {{ mode.label }}
                </button>
              </div>
            </div>
          </div>

          <div v-if="filteredTags.length === 0" class="text-xs text-neutral-400 dark:text-neutral-500 py-6 text-center">
            {{ t('vn.tags.empty') }}
          </div>
          <div v-else class="flex flex-wrap gap-1.5">
            <div
              v-for="tag in filteredTags"
              :key="tag.id"
              @click="router.push(`/browse/vn?tag=${tag.id}`)"
              class="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full text-[13px] border cursor-pointer active:scale-[0.98] transition hover:border-neutral-400 dark:hover:border-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              :class="[ tag.spoiler === 2 ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/50' : tag.spoiler === 1 ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50' : 'bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700' ]"
              :title="t('vn.tag_rating_title', { rating: tag.rating.toFixed(1), spoiler: tag.spoiler })"
            >
              <span class="leading-snug">{{ translateTagName(tag.name) }}</span>
              <span class="shrink-0 rounded-full bg-black/5 dark:bg-white/10 px-1.5 py-0.5 text-[10px] font-mono leading-none opacity-70">
                {{ tag.rating.toFixed(1) }}
              </span>
            </div>
          </div>
        </div>

        <!-- 6. 截图 Tab -->
        <div v-else-if="activeTab === 'screenshots'" class="space-y-2">
          <div v-if="!vn.screenshots || vn.screenshots.length === 0" class="text-xs text-neutral-400 dark:text-neutral-500 py-6 text-center">
            {{ t('vn.screenshots.empty') }}
          </div>
          <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div
              v-for="(scr, idx) in vn.screenshots"
              :key="idx"
              @click="openLightbox(idx, vn.screenshots)"
              class="group relative block overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 aspect-video shadow-xs transition hover:opacity-90 cursor-pointer"
            >
              <!-- 完全屏蔽截图 -->
              <template v-if="getScreenshotAction(getImageNsfwLevel(scr)) === 'hide'">
                <div @click.stop class="h-full w-full flex items-center justify-center bg-neutral-100 dark:bg-neutral-800 cursor-default">
                  <Icon icon="lucide:eye-off" class="h-6 w-6 text-neutral-300 dark:text-neutral-600" />
                </div>
              </template>
              <!-- 缩略图规避（模糊覆盖，仍可点击打开大图） -->
              <template v-else-if="getScreenshotAction(getImageNsfwLevel(scr)) === 'blur'">
                <ion-img
                  :key="`scr-${idx}-${imageLoader.getRetryCount('scr-' + idx)}`"
                  :src="imageLoader.resolveSrc(`scr-${idx}`, scr.thumbnail || scr.url)"
                  :alt="vn.title + ' screenshot'"
                  class="h-full w-full object-cover blur-xl transition-opacity duration-500"
                  :class="{ 'opacity-0': !imageLoader.isSuccess('scr-' + idx) }"
                  @ionImgWillLoad="imageLoader.onWillLoad('scr-' + idx)"
                  @ionImgDidLoad="imageLoader.onLoad('scr-' + idx)"
                  @ionError="imageLoader.onError('scr-' + idx)"
                />
                <ion-spinner
                  v-if="imageLoader.isLoading('scr-' + idx)"
                  name="crescent"
                  class="absolute inset-0 m-auto z-10 text-neutral-400 dark:text-neutral-500"
                  style="width: 20px; height: 20px;"
                />
                <div
                  v-if="imageLoader.isError('scr-' + idx)"
                  @click.stop="imageLoader.retry('scr-' + idx)"
                  class="absolute inset-0 flex items-center justify-center bg-neutral-100 dark:bg-neutral-700 z-10 cursor-pointer"
                >
                  <Icon icon="lucide:refresh-cw" class="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
                </div>
                <div class="absolute inset-0 bg-white/40 dark:bg-neutral-900/40 flex items-center justify-center pointer-events-none">
                  <Icon icon="lucide:eye-off" class="h-5 w-5 text-neutral-500 dark:text-neutral-400" />
                </div>
              </template>
              <!-- 正常截图 -->
              <template v-else>
                <ion-img
                  :key="`scr-${idx}-${imageLoader.getRetryCount('scr-' + idx)}`"
                  :src="imageLoader.resolveSrc(`scr-${idx}`, scr.thumbnail || scr.url)"
                  :alt="vn.title + ' screenshot'"
                  class="h-full w-full object-cover transition duration-300 group-hover:scale-105 transition-opacity duration-500"
                  :class="{ 'opacity-0': !imageLoader.isSuccess('scr-' + idx) }"
                  @ionImgDidLoad="imageLoader.onLoad('scr-' + idx)"
                  @ionError="imageLoader.onError('scr-' + idx)"
                />
                <ion-spinner
                  v-if="imageLoader.isLoading('scr-' + idx)"
                  name="crescent"
                  class="absolute inset-0 m-auto z-10 text-neutral-400 dark:text-neutral-500"
                  style="width: 20px; height: 20px;"
                />
                <div
                  v-if="imageLoader.isError('scr-' + idx)"
                  @click.stop="imageLoader.retry('scr-' + idx)"
                  class="absolute inset-0 flex items-center justify-center bg-neutral-100 dark:bg-neutral-700 z-10 cursor-pointer"
                >
                  <Icon icon="lucide:refresh-cw" class="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
                </div>
              </template>
            </div>
          </div>
        </div>

        <!-- 7. 精选摘录 Tab (Quotes) -->
        <div v-else-if="activeTab === 'quotes'" class="space-y-3">
          <div v-if="quotesLoading" class="flex flex-col items-center justify-center py-10 gap-2">
            <Icon icon="eos-icons:loading" class="h-6 w-6 text-neutral-300 dark:text-neutral-600" />
            <span class="text-[10px] text-neutral-400 dark:text-neutral-500 font-bold uppercase tracking-widest">{{ t('release.loading') }}</span>
          </div>
          <div v-else-if="quotes.length === 0" class="text-center py-6 text-xs text-neutral-400 dark:text-neutral-500">
            {{ t('vn.quotes.empty') }}
          </div>
          <div v-else class="space-y-3">
            <div
                v-for="q in quotes"
                :key="q.id"
                class="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 relative space-y-2 cursor-pointer active:scale-[0.98] transition-transform"
              >
                <!-- 引用气泡图标 -->
                <Icon icon="lucide:quote" class="absolute top-2 right-3 h-8 w-8 text-neutral-200 dark:text-neutral-700 pointer-events-none" />
                
                <!-- 摘录内容 -->
                <p @click="copyQuote(q)" class="text-xs text-neutral-700 dark:text-neutral-300 italic leading-relaxed pr-6 whitespace-pre-wrap selectable-text">
                  "{{ q.quote }}"
                </p>

                <div v-if="quoteTranslations[q.id]?.translated || quoteTranslations[q.id]?.error || quoteTranslations[q.id]?.loading" class="rounded-lg border border-violet-200 dark:border-violet-800/50 bg-violet-50/60 dark:bg-violet-900/20 p-3 space-y-2">
                  <div class="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-violet-500 dark:text-violet-400">
                    <Icon icon="lucide:languages" class="h-3.5 w-3.5" />
                    <span>{{ t('vn.translation.title') }}</span>
                  </div>
                  <div v-if="quoteTranslations[q.id]?.loading" class="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                    <Icon icon="lucide:loader-circle" class="h-4 w-4 animate-spin" />
                    <span>{{ t('vn.translation.loading') }}</span>
                  </div>
                  <div v-else-if="quoteTranslations[q.id]?.error" class="text-xs leading-relaxed text-rose-500 dark:text-rose-400">
                    {{ quoteTranslations[q.id].error }}
                  </div>
                  <p v-else class="text-xs leading-relaxed text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap selectable-text">
                    {{ quoteTranslations[q.id].translated }}
                  </p>
                </div>
  
                <!-- 台词主人名与评分 -->
                <div class="flex justify-between items-center gap-3 text-[10px] text-neutral-500 dark:text-neutral-400 pt-2 border-t border-neutral-200/60 dark:border-neutral-700/60">
                  <span v-if="q.character" class="font-semibold text-neutral-800 dark:text-neutral-200">
                    —— {{ q.character.name }} <span v-if="q.character.original" class="font-normal text-neutral-400 dark:text-neutral-500">({{ q.character.original }})</span>
                  </span>
                  <span v-else class="font-semibold text-neutral-400 dark:text-neutral-500">—— {{ t('vn.quotes.narrator') }}</span>

                  <div class="flex items-center gap-3">
                    <button
                      @click.stop="translateQuote(q)"
                      :disabled="quoteTranslations[q.id]?.loading"
                      :title="quoteTranslations[q.id]?.translated ? t('vn.quotes.retranslate') : t('vn.quotes.translate')"
                      :aria-label="quoteTranslations[q.id]?.translated ? t('vn.quotes.retranslate') : t('vn.quotes.translate')"
                      class="inline-flex items-center justify-center rounded-md border border-neutral-200 dark:border-neutral-700 bg-white/90 dark:bg-neutral-800 p-1.5 text-neutral-500 dark:text-neutral-400 transition disabled:cursor-not-allowed disabled:opacity-60 hover:border-neutral-300 hover:text-neutral-700 dark:hover:border-neutral-600 dark:hover:text-neutral-200"
                    >
                      <Icon :icon="quoteTranslations[q.id]?.loading ? 'lucide:loader-circle' : 'lucide:languages'" class="h-3.5 w-3.5" :class="{ 'animate-spin': quoteTranslations[q.id]?.loading }" />
                    </button>
                    <span @click="copyQuote(q)" class="flex items-center gap-1.5">
                      <template v-if="copiedQuoteId === q.id">
                        <Icon icon="lucide:check" class="h-3 w-3 text-green-500 dark:text-green-400" />
                        <span class="text-green-600 dark:text-green-400 font-semibold">{{ t('vn.quotes.copied') }}</span>
                      </template>
                      <template v-else>
                        <Icon icon="lucide:copy" class="h-3 w-3 text-neutral-400 dark:text-neutral-500" />
                        <span>{{ t('vn.quotes.score') }}: <strong class="text-neutral-700 dark:text-neutral-300">{{ q.score }}</strong></span>
                      </template>
                    </span>
                  </div>
                </div>
              </div>
          </div>
        </div>

        <!-- 8. 用户统计 Tab：评分分布柱状图 -->
        <div v-else-if="activeTab === 'stats'" class="space-y-3">
          <!-- 加载中 -->
          <div v-if="statsLoading" class="flex flex-col items-center justify-center py-10 gap-2">
            <Icon icon="eos-icons:loading" class="h-6 w-6 text-neutral-300 dark:text-neutral-600" />
            <span class="text-[10px] text-neutral-400 dark:text-neutral-500 font-bold uppercase tracking-widest">{{ t('vn.stats.loading') }}</span>
          </div>

          <!-- 错误 / 空 -->
          <div v-else-if="statsError" class="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <Icon icon="lucide:alert-triangle" class="h-5 w-5 text-amber-500 dark:text-amber-400" />
            <p class="text-[11px] text-neutral-500 dark:text-neutral-400">{{ statsError }}</p>
            <button
              @click="reloadStats"
              class="inline-flex items-center gap-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-1 text-[10px] font-semibold text-neutral-600 dark:text-neutral-300 hover:border-neutral-300 dark:hover:border-neutral-600 transition cursor-pointer"
            >
              <Icon icon="lucide:refresh-cw" class="h-3 w-3" />
              {{ t('vn.stats.reload') }}
            </button>
          </div>

          <div v-else-if="!statsRows.length" class="text-center py-6 text-xs text-neutral-400 dark:text-neutral-500">
            {{ t('vn.stats.empty') }}
          </div>

          <!-- 柱状图 + 概览 -->
          <template v-else>
            <!-- 概览三格 -->
            <div class="grid grid-cols-3 gap-2">
              <div class="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/60 px-2 py-2">
                <div class="text-[10px] text-neutral-400 dark:text-neutral-500">{{ t('vn.stats.votes') }}</div>
                <div class="mt-0.5 text-sm font-bold text-neutral-800 dark:text-neutral-200">{{ statsTotalVotes }}</div>
                <div v-if="statsData?.votesRank" class="text-[9px] text-neutral-400 dark:text-neutral-500">{{ t('vn.stats.rank', { rank: statsData.votesRank }) }}</div>
              </div>
              <div class="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/60 px-2 py-2">
                <div class="text-[10px] text-neutral-400 dark:text-neutral-500">{{ t('vn.stats.average') }}</div>
                <div class="mt-0.5 text-sm font-bold text-neutral-800 dark:text-neutral-200">{{ statsData?.average ?? '—' }}</div>
                <div v-if="statsData?.averageRank" class="text-[9px] text-neutral-400 dark:text-neutral-500">{{ t('vn.stats.rank', { rank: statsData.averageRank }) }}</div>
              </div>
              <div class="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/60 px-2 py-2">
                <div class="text-[10px] text-neutral-400 dark:text-neutral-500">{{ t('vn.stats.median') }}</div>
                <div class="mt-0.5 text-sm font-bold text-neutral-800 dark:text-neutral-200">{{ statsMedian ?? '—' }}</div>
                <div v-if="collectionEntry?.vote" class="text-[9px] text-neutral-400 dark:text-neutral-500">{{ t('vn.stats.user_vote') }}: {{ collectionEntry.vote }}</div>
              </div>
            </div>

            <!-- 评分分布柱状图（横向条，10 → 1 自上而下，高分在上） -->
            <div class="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3">
              <div class="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                <Icon icon="lucide:bar-chart-3" class="h-3.5 w-3.5" />
                <span>{{ t('vn.stats.distribution') }}</span>
              </div>
              <div class="space-y-1">
                <div
                  v-for="row in statsRows"
                  :key="row.score"
                  class="flex items-center gap-2"
                  :title="`${row.score} — ${row.count}`"
                >
                  <span class="w-4 shrink-0 text-right text-[10px] font-semibold text-neutral-500 dark:text-neutral-400">{{ row.score }}</span>
                  <div class="relative h-3.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-neutral-100 dark:bg-neutral-800">
                    <div
                      class="h-full rounded-sm transition-all duration-300"
                      :class="row.score >= 8 ? 'bg-emerald-400 dark:bg-emerald-500' : row.score >= 5 ? 'bg-sky-400 dark:bg-sky-500' : 'bg-neutral-400 dark:bg-neutral-500'"
                      :style="{ width: row.width + '%' }"
                    ></div>
                  </div>
                  <span class="w-14 shrink-0 text-right text-[10px] tabular-nums text-neutral-400 dark:text-neutral-500">{{ row.count }}<span class="ml-1 opacity-60">{{ row.percent }}%</span></span>
                </div>
              </div>
            </div>

            <!-- 最近的投票 -->
            <div v-if="statsData?.recent?.length" class="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden">
              <div class="flex items-center gap-1.5 border-b border-neutral-100 dark:border-neutral-800 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                <Icon icon="lucide:users" class="h-3.5 w-3.5" />
                <span>{{ t('vn.stats.recent') }}</span>
                <button
                  @click="reloadStats"
                  class="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200 transition cursor-pointer"
                >
                  <Icon icon="lucide:refresh-cw" class="h-3 w-3" />
                  {{ t('vn.stats.reload') }}
                </button>
              </div>
              <div class="divide-y divide-neutral-100 dark:divide-neutral-800">
                <div v-for="(rv, idx) in statsData.recent" :key="`${rv.uid}-${idx}`" class="flex items-center gap-2 px-3 py-1.5 text-[11px]">
                  <span class="min-w-0 flex-1 truncate text-neutral-700 dark:text-neutral-300">{{ rv.user }}</span>
                  <span class="shrink-0 rounded-full bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-neutral-600 dark:text-neutral-300">{{ rv.vote }}</span>
                  <span class="shrink-0 text-[10px] tabular-nums text-neutral-400 dark:text-neutral-500">{{ rv.date }}</span>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- 9. 外链跳转 Tab 已移除：资源站/资料站与跨站搜索重复，统一到页面顶部「跨站搜索」区块 -->

      </div>
    </div>

    <!-- Teleport: 剧透防雷提示框 -->
    <Teleport to="body">
      <div 
        v-if="showSpoilerConfirm"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-fade-in"
        @click="showSpoilerConfirm = false"
      >
        <div 
          class="w-full max-w-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-5 shadow-xl space-y-4"
          @click.stop
        >
          <div class="flex items-center gap-2 text-red-600 dark:text-red-400">
            <Icon icon="lucide:info" class="h-4 w-4" />
            <h3 class="text-xs font-bold uppercase tracking-wider">{{ t('vn.spoiler_alert.title') }}</h3>
          </div>
          <p class="text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-400">
            {{ t('vn.spoiler_alert.desc') }}
          </p>
          <div class="flex gap-2 justify-end text-xs">
            <button
              @click="showSpoilerConfirm = false"
              class="h-7 px-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 active:bg-neutral-100 dark:active:bg-neutral-600"
            >
              {{ t('vn.spoiler_alert.cancel') }}
            </button>
            <button
              @click="confirmSpoilerLevel"
              class="h-7 px-2.5 rounded-lg border border-transparent bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 active:bg-neutral-700 dark:active:bg-neutral-300"
            >
              {{ t('vn.spoiler_alert.confirm') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Teleport: 角色特征剧透确认框 -->
    <Teleport to="body">
      <div
        v-if="showTraitSpoilerConfirm"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-fade-in"
        @click="showTraitSpoilerConfirm = false"
      >
        <div
          class="w-full max-w-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-5 shadow-xl space-y-4"
          @click.stop
        >
          <div class="flex items-center gap-2 text-red-600 dark:text-red-400">
            <Icon icon="lucide:info" class="h-4 w-4" />
            <h3 class="text-xs font-bold uppercase tracking-wider">{{ t('vn.spoiler_alert.title') }}</h3>
          </div>
          <p class="text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-400">
            {{ t('vn.spoiler_alert.desc') }}
          </p>
          <div class="flex gap-2 justify-end text-xs">
            <button
              @click="showTraitSpoilerConfirm = false"
              class="h-7 px-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 active:bg-neutral-100 dark:active:bg-neutral-600"
            >
              {{ t('vn.spoiler_alert.cancel') }}
            </button>
            <button
              @click="confirmTraitSpoilerLevel"
              class="h-7 px-2.5 rounded-lg border border-transparent bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 active:bg-neutral-700 dark:active:bg-neutral-300"
            >
              {{ t('vn.spoiler_alert.confirm') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Teleport: 大图查看器 -->
    <Teleport to="body">
      <div 
        v-if="showImageLightbox"
        class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 select-none"
        style="touch-action: none;"
        @click="closeLightbox"
        @touchstart="handleTouchStart"
        @touchmove="handleTouchMove"
        @touchend="handleTouchEnd"
      >
        <button
          @click.stop="closeLightbox"
          class="absolute top-4 right-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-full bg-neutral-800/80 text-white hover:bg-neutral-700 hover:scale-105 active:scale-95 transition cursor-pointer"
        >
          <Icon icon="lucide:x" class="h-5 w-5" />
        </button>

        <!-- 保存到手机按钮 -->
        <button
          v-if="Capacitor.isNativePlatform()"
          @click.stop="saveImageToPhone"
          :disabled="savingImage"
          class="absolute top-4 right-16 z-50 inline-flex h-10 w-10 items-center justify-center rounded-full bg-neutral-800/80 text-white hover:bg-neutral-700 hover:scale-105 active:scale-95 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Icon v-if="!savingImage" icon="lucide:download" class="h-5 w-5" />
          <Icon v-else icon="lucide:loader" class="h-5 w-5 animate-spin" />
        </button>

        <button 
          v-if="lightboxImagesList.length > 1"
          @click.stop="prevImage"
          class="absolute left-4 z-40 hidden sm:inline-flex h-12 w-12 items-center justify-center rounded-full bg-neutral-800/60 text-white hover:bg-neutral-700 transition"
        >
          <Icon icon="lucide:chevron-left" class="h-6 w-6" />
        </button>

        <button 
          v-if="lightboxImagesList.length > 1"
          @click.stop="nextImage"
          class="absolute right-4 z-40 hidden sm:inline-flex h-12 w-12 items-center justify-center rounded-full bg-neutral-800/60 text-white hover:bg-neutral-700 transition"
        >
          <Icon icon="lucide:chevron-right" class="h-6 w-6" />
        </button>

        <div 
          ref="scrollContainer"
          @scroll="handleScroll"
          class="flex w-full h-[80vh] overflow-x-hidden snap-x snap-mandatory no-scrollbar"
          @click.stop
        >
          <div
            v-for="(img, idx) in lightboxImagesList"
            :key="idx"
            class="relative flex-shrink-0 w-full h-full flex flex-col items-center justify-center snap-center p-6 space-y-2"
          >
            <!-- 大图容器（overflow-hidden 防止模糊溢出） -->
            <div class="relative max-w-full max-h-[72vh] overflow-hidden rounded-lg border border-neutral-800 shadow-2xl">
              <ion-img
                :key="`lb-${idx}-${imageLoader.getRetryCount('lb-' + idx)}`"
                :src="img.url"
                :alt="img.title || vn.title || 'cover'"
                class="max-w-full max-h-[72vh] object-contain pointer-events-none transition-all duration-300 transition-opacity duration-500"
                :class="{ 'blur-xl': getScreenshotAction(getImageNsfwLevel(img)) === 'blur' && !revealedItems.has(`lb-${idx}`), 'opacity-0': !imageLoader.isSuccess('lb-' + idx) }"
                @ionImgWillLoad="imageLoader.onWillLoad('lb-' + idx)"
                @ionImgDidLoad="imageLoader.onLoad('lb-' + idx)"
                @ionError="imageLoader.onError('lb-' + idx)"
              />
              <ion-spinner
                v-if="imageLoader.isLoading('lb-' + idx)"
                name="crescent"
                class="absolute inset-0 m-auto z-20"
                style="width: 28px; height: 28px;"
                color="light"
              />
              <div
                v-if="imageLoader.isError('lb-' + idx)"
                @click.stop="imageLoader.retry('lb-' + idx)"
                class="absolute inset-0 flex items-center justify-center bg-neutral-900/50 z-20 cursor-pointer"
              >
                <Icon icon="lucide:refresh-cw" class="h-6 w-6 text-neutral-300" />
              </div>
              <!-- 大图模糊时的眼睛图标 -->
              <button
                v-if="getScreenshotAction(getImageNsfwLevel(img)) === 'blur' && !revealedItems.has(`lb-${idx}`)"
                @click.stop="toggleReveal(`lb-${idx}`)"
                class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 text-white hover:bg-black/70 transition z-10"
              >
                <Icon icon="lucide:eye-off" class="h-6 w-6" />
              </button>
            </div>
            <div v-if="img.title" class="text-center max-w-lg px-4 text-xs text-neutral-300 truncate">
              {{ img.title }}
            </div>
          </div>
        </div>
        
        <div class="absolute bottom-6 text-[11px] text-neutral-500 text-center">
          <div>{{ lightboxImageIndex + 1 }} / {{ lightboxImagesList.length }}</div>
        </div>
      </div>
    </Teleport>

    <!-- 收藏编辑弹窗 -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showEditModal"
          class="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
        >
          <!-- 背景遮罩 -->
          <div class="absolute inset-0 bg-black/40" @click="closeEditModal"></div>

          <!-- 弹窗内容 -->
          <div class="relative z-10 w-full sm:w-[420px] max-h-[85vh] bg-white dark:bg-neutral-900 sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200">
            <!-- 顶部栏 -->
            <div class="flex items-center justify-between px-4 pt-4 pb-2">
              <h3 class="text-base font-bold text-neutral-900 dark:text-neutral-100">{{ t('vn.status.edit_collection') }}</h3>
              <button
                @click="closeEditModal"
                class="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <Icon icon="lucide:x" class="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
              </button>
            </div>

            <!-- 表单内容 -->
            <div class="px-4 pb-4 space-y-4 overflow-y-auto flex-1">
              <!-- 状态选择（多选标签） -->
              <div class="space-y-2.5">
                <div class="flex items-center justify-between">
                  <label class="text-xs font-medium text-neutral-500 dark:text-neutral-400">{{ t('vn.status.title') }}</label>
                  <span class="text-[10px] text-neutral-400 dark:text-neutral-500">{{ t('vn.status.labels_description') }}</span>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <button
                    v-for="opt in statusOptions"
                    :key="opt.value"
                    type="button"
                    @click="toggleEditModalLabel(opt)"
                    class="flex items-center gap-2 p-2.5 rounded-xl border text-left transition cursor-pointer"
                    :class="[
                      (opt.value === 0 ? editForm.selectedLabelIds.length === 0 : editForm.selectedLabelIds.includes(opt.value))
                        ? 'border-neutral-900 dark:border-neutral-100 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-semibold shadow-xs'
                        : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/80 text-neutral-700 dark:text-neutral-300 hover:border-neutral-300 dark:hover:border-neutral-600'
                    ]"
                  >
                    <Icon
                      v-if="opt.icon"
                      :icon="opt.icon"
                      class="h-4 w-4 shrink-0"
                      :class="[
                        (opt.value === 0 ? editForm.selectedLabelIds.length === 0 : editForm.selectedLabelIds.includes(opt.value))
                          ? 'text-white dark:text-neutral-900'
                          : (opt.destructive ? 'text-red-400' : (opt.color || 'text-neutral-400 dark:text-neutral-500'))
                      ]"
                    />
                    <span class="text-xs truncate flex-1">{{ opt.label }}</span>
                    <Icon
                      v-if="opt.value === 0 ? editForm.selectedLabelIds.length === 0 : editForm.selectedLabelIds.includes(opt.value)"
                      icon="lucide:check"
                      class="h-3.5 w-3.5 shrink-0"
                      :class="(opt.value === 0 ? editForm.selectedLabelIds.length === 0 : editForm.selectedLabelIds.includes(opt.value)) ? 'text-white dark:text-neutral-900' : ''"
                    />
                  </button>
                </div>
              </div>

              <!-- 评分 -->
              <div class="space-y-2.5">
                <label class="text-xs font-medium text-neutral-500 dark:text-neutral-400">{{ t('vn.status.my_vote') }}</label>
                <div class="flex items-center justify-center gap-1">
                  <!-- 取消评分按钮 -->
                  <button
                    @click="clearVote"
                    type="button"
                    class="inline-flex items-center justify-center p-0.5 transition-transform hover:scale-110 cursor-pointer"
                    :title="t('vn.status.no_vote')"
                  >
                    <Icon
                      icon="solar:star-broken"
                      class="h-5 w-5 transition-colors"
                      :class="editForm.vote === '' ? 'text-red-400 dark:text-red-500' : 'text-neutral-300 dark:text-neutral-600 hover:text-neutral-500 dark:hover:text-neutral-400'"
                    />
                  </button>
                  <!-- 评分星星 -->
                  <button
                    v-for="n in 10"
                    :key="n"
                    type="button"
                    @click="setVote(n)"
                    @mouseenter="hoverVote = n"
                    @mouseleave="hoverVote = null"
                    class="inline-flex items-center justify-center p-0.5 transition-transform hover:scale-110 cursor-pointer"
                  >
                    <Icon
                      icon="solar:star-bold"
                      class="h-6 w-6 transition-colors"
                      :class="(hoverVote !== null ? n <= hoverVote : n <= editForm.vote) ? 'text-amber-400' : 'text-neutral-200 dark:text-neutral-700'"
                      :style="(hoverVote !== null ? n <= hoverVote : n <= editForm.vote)
                        ? { fill: '#fbbf24' }
                        : { fill: '#e5e5e5' }"
                    />
                  </button>
                </div>
              </div>

              <!-- 笔记 -->
              <div class="space-y-2.5">
                <label class="text-xs font-medium text-neutral-500 dark:text-neutral-400">{{ t('vn.status.notes') }}</label>
                <textarea
                  v-model="editForm.notes"
                  rows="5"
                  :placeholder="t('vn.status.no_notes')"
                  class="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 px-3 py-2 text-xs leading-relaxed outline-none transition focus:border-neutral-400 dark:focus:border-neutral-500 focus:bg-white dark:focus:bg-neutral-700 placeholder-neutral-400 dark:placeholder-neutral-500 resize-none"
                ></textarea>
              </div>

              <!-- 开始日期 -->
              <div class="space-y-1.5">
                <label class="text-xs font-medium text-neutral-500 dark:text-neutral-400">{{ t('vn.status.started') }}</label>
                <input
                  v-model="editForm.started"
                  type="date"
                  class="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 px-3 py-2 text-sm outline-none transition focus:border-neutral-400 dark:focus:border-neutral-500 focus:bg-white dark:focus:bg-neutral-700"
                />
              </div>

              <!-- 结束日期 -->
              <div class="space-y-1.5">
                <label class="text-xs font-medium text-neutral-500 dark:text-neutral-400">{{ t('vn.status.finished_date') }}</label>
                <input
                  v-model="editForm.finished"
                  type="date"
                  class="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 px-3 py-2 text-sm outline-none transition focus:border-neutral-400 dark:focus:border-neutral-500 focus:bg-white dark:focus:bg-neutral-700"
                />
              </div>
            </div>

            <!-- 底部按钮 -->
            <div class="flex items-center justify-end gap-2 px-4 py-3 border-t border-neutral-100 dark:border-neutral-800">
              <button
                @click="closeEditModal"
                class="px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition cursor-pointer"
              >
                {{ t('vn.status.cancel') }}
              </button>
              <button
                @click="saveEditForm"
                :disabled="editSaving"
                class="px-4 py-2 text-sm font-medium text-white dark:text-neutral-900 bg-neutral-900 dark:bg-neutral-100 hover:bg-neutral-800 dark:hover:bg-neutral-200 rounded-lg transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                <Icon v-if="editSaving" icon="lucide:loader-2" class="h-3.5 w-3.5 animate-spin" />
                {{ t('vn.status.save') }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 游戏时长填写小卡（与收藏信息弹窗同形态） -->
    <LengthVoteModal
      v-model:show="showLengthVote"
      :vn-id="vn?.id || ''"
      :releases="releases"
      :community-text="formatLength(vn || {})"
      @saved="onLengthVoteSaved"
    />

    <!-- 收藏状态多选 ActionSheet -->
    <ActionSheet
      v-model:show="showStatusActionSheet"
      :title="t('vn.status.title')"
      :description="t('vn.status.labels_description')"
      :multiple="true"
      :modelValue="currentLabelIds"
      :options="statusOptions"
      @confirm="handleMultipleLabelsChange"
    />

    <!-- Toast 提示 -->
    <Teleport to="body">
      <Transition name="toast">
        <div
          v-if="toastVisible"
          class="toast-box fixed top-12 z-[300] flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg border text-xs font-medium pointer-events-none"
          :class="toastType === 'success' ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800/50 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-400'"
        >
          <Icon
            :icon="toastType === 'success' ? 'lucide:check-circle' : 'lucide:x-circle'"
            class="h-4 w-4 flex-shrink-0"
          />
          {{ toastMessage }}
        </div>
      </Transition>
    </Teleport>
  </div>
  </ion-content>
  </ion-page>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

/* 弹窗过渡动画 */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

/* Toast 水平居中 */
.toast-box {
  left: 50%;
  transform: translateX(-50%);
}

/* Toast 过渡动画 */
.toast-enter-active {
  transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1),
              transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.toast-leave-active {
  transition: opacity 0.2s ease-in,
              transform 0.2s ease-in;
}
.toast-enter-from {
  opacity: 0;
  transform: translate(-50%, -12px);
}
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -8px);
}
</style>
