/**
 * VNDB 用户收藏标签（ulist_labels）的本地化工具
 *
 * 背景：
 * - `GET /ulist_labels` 返回的 `label` 字段是**服务端英文**（Playing / Finished /
 *   Stalled / Dropped / Wishlist / Blacklist / Voted），直接渲染就会在中文界面里
 *   冒出英文。
 * - id 1~7 是 VNDB 预定义的系统标签（所有人相同）；id >= 10 是用户自建标签，
 *   名称由用户自己填写，应原样显示。
 * - id 7 "Voted" 是**服务端自动维护**的标签（用户给作品打过分就会自动带上），
 *   不能通过 `PATCH /ulist` 的 `labels_set` 手动加上；手动加会被服务端忽略，
 *   表现为「选了 Voted 但状态没更新」。
 */

/** 预定义系统标签 id 上限（1~7 都是系统标签） */
export const SYSTEM_LABEL_MAX_ID = 7

/** 服务端英文名 → 本地兜底用（避免 i18n 缺失时露出 `Label 7` 这种占位） */
const SERVER_LABEL_NAMES = {
  1: 'Playing',
  2: 'Finished',
  3: 'Stalled',
  4: 'Dropped',
  5: 'Wishlist',
  6: 'Blacklist',
  7: 'Voted'
}

/** 系统标签 id → i18n key */
const SYSTEM_LABEL_I18N = {
  1: 'vn.status.playing',
  2: 'vn.status.finished',
  3: 'vn.status.stalled',
  4: 'vn.status.dropped',
  5: 'vn.status.wishlisted',
  6: 'vn.status.blacklist',
  7: 'vn.status.voted'
}

/** 是否是预定义系统标签 */
export function isSystemLabel(id) {
  const n = Number(id)
  return Number.isInteger(n) && n >= 1 && n <= SYSTEM_LABEL_MAX_ID
}

/** Voted 标签：由服务端按是否打过分自动维护，不可手动选择 */
export function isVotedLabel(id) {
  return Number(id) === 7
}

/**
 * 取得标签的显示名（已本地化）
 * @param {number} id 标签 id
 * @param {string} [fallback] 服务端返回的 label（自定义标签用）
 * @param {(key: string) => string} t vue-i18n 的 t 函数
 */
export function getLabelName(id, fallback, t) {
  const key = SYSTEM_LABEL_I18N[Number(id)]
  if (key) return t(key)
  const raw = (fallback || '').trim()
  if (raw) return raw
  return t('list.no_label')
}

/** 系统标签的兜底英文名（用于未加载到 ulist_labels 时渲染） */
export function getServerLabelName(id) {
  return SERVER_LABEL_NAMES[Number(id)] || ''
}
