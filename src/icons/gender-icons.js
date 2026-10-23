/**
 * 性别图标（自绘，24×24，stroke 风格与 lucide 保持一致）。
 *
 * 为什么不用 lucide 的现成图标：
 * lucide 里没有 ♀ / ♂ / ⚥ 这三种性别符号，之前用 circle / circle-dot / badge
 * 顶替，但这三个图形在小尺寸（列表里只有 10px）下几乎完全一样，看不出男女。
 * 这里按通行符号画：圆 + 十字（女）、圆 + 右上箭头（男）、两者叠加（双性），
 * 形状差异大，缩到 10px 也能一眼分辨。
 */

/** 女性 ♀：圆 + 下方十字 */
export const venus = {
  width: 24,
  height: 24,
  body:
    '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">' +
    '<circle cx="12" cy="8.5" r="5.5"/>' +
    '<path d="M12 14v7.5"/>' +
    '<path d="M8.75 18.25h6.5"/>' +
    '</g>'
}

/** 男性 ♂：圆 + 右上箭头 */
export const mars = {
  width: 24,
  height: 24,
  body:
    '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">' +
    '<circle cx="9.5" cy="14.5" r="5.5"/>' +
    '<path d="M13.4 10.6 20 4"/>' +
    '<path d="M14.5 4H20v5.5"/>' +
    '</g>'
}

/** 双性 ⚥：圆 + 下方十字 + 右上箭头 */
export const venusMars = {
  width: 24,
  height: 24,
  body:
    '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">' +
    '<circle cx="10.5" cy="13.5" r="4.5"/>' +
    '<path d="M10.5 18v4"/>' +
    '<path d="M8 20h5"/>' +
    '<path d="M13.8 10.2 19 5"/>' +
    '<path d="M14.5 5H19v4.5"/>' +
    '</g>'
}
