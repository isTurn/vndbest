/**
 * 版本（release）封面取图
 *
 * VNDB 上相当一部分 release 没有自己的封面图 —— `images` 是空数组。
 * 典型情况：
 * - 补丁 / 汉化补丁（patch=1）
 * - 免费分发、同人小品（freeware=1）
 * - 只有实体盘扫描图、但从未上传封面的老作品
 *
 * 这类条目在列表里以前只能渲染一个包裹占位图标，看起来像「图片加载不出来」。
 * 实际上 VNDB 的 release 端点支持带出关联作品 `vns{...image}`，
 * 拿关联作品的封面顶上，视觉上仍然是「这部游戏的图」。
 */

/**
 * 取 release 的展示用图片对象。
 * 优先 release 自己的封面，没有则回退到第一个有关联图的 VN。
 * @param {any} item release 对象（需含 images 与 vns 字段）
 * @returns {{url?: string, thumbnail?: string, sexual?: number[]}|null}
 */
export function getReleaseImage(item) {
  if (!item) return null
  const own = Array.isArray(item.images) ? item.images.find((img) => img && (img.thumbnail || img.url)) : null
  if (own) return own
  if (Array.isArray(item.vns)) {
    for (const vn of item.vns) {
      if (vn?.image && (vn.image.thumbnail || vn.image.url)) return vn.image
    }
  }
  return null
}

/**
 * 取 release 展示图的 URL（优先缩略图）
 * @param {any} item
 * @param {'thumb'|'full'} [size]
 */
export function getReleaseImageUrl(item, size = 'thumb') {
  const img = getReleaseImage(item)
  if (!img) return null
  if (size === 'full') return img.url || img.thumbnail || null
  return img.thumbnail || img.url || null
}
