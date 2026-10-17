/**
 * 把 API / 网络错误转换成用户可读、已本地化的提示文案。
 *
 * 背景：`src/api/vndb.js` 不依赖 i18n 实例（便于复用与测试），
 * 超时错误只带 `i18nKey = 'error.timeout'`，由 UI 层统一翻译。
 *
 * @param {unknown} err  捕获到的错误对象
 * @param {(key: string, named?: object) => string} t  vue-i18n 的 t 函数
 * @param {string} [fallbackKey='common.error'] 无可用文案时的兜底 i18n 键
 * @returns {string}
 */
export function translateError(err, t, fallbackKey = 'common.error') {
  if (!err) return t(fallbackKey)

  // 1. 明确带 i18nKey 的错误（如超时）
  if (err.i18nKey) {
    const translated = t(err.i18nKey)
    if (translated !== err.i18nKey) return translated
  }

  // 2. 限流
  if (err.name === 'VndbRateLimitError' || err.status === 429) {
    return t('error.rate_limit')
  }

  // 3. 网络层失败（fetch 抛 TypeError / Capacitor 原生错误）
  if (err.name === 'TypeError' || /failed to fetch|network|networkerror/i.test(String(err.message || ''))) {
    return t('error.network')
  }

  // 4. 服务端返回的业务消息（VNDB API 的 message 字段通常是英文，原样展示比丢失信息更好）
  const serverMsg = err?.responseData?.message
  if (typeof serverMsg === 'string' && serverMsg.trim()) return serverMsg

  // 5. 其它：有 message 用 message，否则兜底
  const msg = typeof err.message === 'string' ? err.message.trim() : ''
  if (msg && !/^error\.[a-z_]+$/i.test(msg)) return msg

  return t(fallbackKey)
}
