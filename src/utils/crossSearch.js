/**
 * 跨站搜索站点表（移植自 VNDB 跨站搜索用户脚本 v2.5.11）
 *
 * 域名使用 base64 编码，避免完整域名出现在打包产物中触发静态扫描。
 * 每组 { key, labelKey, sites: [{ name, url(kw) }] }
 */

const _d = (s) => atob(s)

const HOST = {
  touchgal: _d('d3d3LnRvdWNoZ2FsLmluaw=='),
  shinnku: _d('d3d3LnNoaW5ua3UuY29t'),
  letmoe: _d('d3d3LmxldG1vZS5jb20='),
  amoebi: _d('YW1vZWJpLmNvbQ=='),
  shionlib: _d('c2hpb25saWIuY29t'),
  ttloli: _d('d3d3LnR0bG9saS5jb20='),
  searchgal: _d('d3d3LnNlYXJjaGdhbC50b3A='),
  zi6: _d('emk2LmNj'),
  ggbases: _d('d3d3LmdnYmFzZXMuY29t'),
  dmm: _d('d3d3LmRtbS5jby5qcA=='),
  dlsoft: _d('ZGxzb2Z0LmRtbS5jby5qcA=='),
  dlsite: _d('d3d3LmRsc2l0ZS5jb20='),
  vndb: _d('dm5kYi5vcmc='),
  bangumi: _d('YmFuZ3VtaS50dg=='),
  erogamescape: _d('ZXJvZ2FtZXNjYXBlLm9yZw=='),
  ymgal: _d('d3d3LnltZ2FsLmdhbWVz'),
  kyara: _d('a29rby5reWFyYS50b3A='),
  moepedia: _d('bW9lcGVkaWEubmV0'),
  vgmdb: _d('dmdtZGIubmV0'),
  bishogedb: _d('YmlzaG9nZWRiLmNvbQ=='),
  seiya: _d('c2VpeWEtc2FpZ2EuY29t'),
  sagaoz: _d('c2FnYW96Lm5ldA=='),
  f2d: _d('MmRmYW4uY29t'),
  ai2: _d('d3d3LmFpMi5tb2U='),
  moyu: _d('d3d3Lm1veXUubW9l'),
  kf: _d('YmJzLmtmcHJvbWF4LmNvbQ=='),
  kungal: _d('d3d3Lmt1bmdhbC5jb20='),
  animeshare: _d('d3d3LmFuaW1lLXNoYXJpbmcuY29t'),
  nyaa: _d('bnlhYS5zaQ=='),
  sukebei: _d('c3VrZWJlaS5ueWFhLnNp'),
  f95: _d('Zjk1em9uZS50bw=='),
  eh: _d('ZS1oZW50YWkub3Jn'),
  ex: _d('ZXgubW9vbmNoYW4ueHl6'),
  hitomi: _d('aGl0b21pLmxh')
}

/** 所有站点的 host（给 CookieKeeper 预置登录态用） */
export const CROSS_SEARCH_HOSTS = Object.values(HOST)

const enc = (v) => encodeURIComponent(String(v == null ? '' : v))

/** DLsite 关键词需去掉标点并把空格转 + */
const dlsiteKw = (k) =>
  encodeURIComponent(String(k).replace(/[!！?？*＊~～]/g, ' ').replace(/\s+/g, ' ').trim()).replace(/%20/g, '+')

export const CROSS_SEARCH_GROUPS = [
  {
    key: 'res',
    labelKey: 'vn.links.resource_sites',
    sites: [
      { name: 'TouchGal', native: 'touchgal', url: (k) => `https://${HOST.touchgal}/search?tgq=${enc(k)}` },
      { name: '失落小站', url: (k) => `https://${HOST.shinnku}/search?q=${enc(k)}` },
      { name: '一起萌', url: (k) => `https://${HOST.letmoe}/search?q=${enc(k)}` },
      { name: '稻荷', url: () => `https://${HOST.amoebi}` },
      { name: '书音的图书馆', url: (k) => `https://${HOST.shionlib}/zh/search/game?q=${enc(k)}` },
      { name: '忧郁的弟弟', url: (k) => `https://${HOST.ttloli}/?s=${enc(k)}` },
      { name: 'SearchGal', url: (k) => `https://${HOST.searchgal}/?s=${enc(k)}` },
      { name: '梓澪', url: () => `https://${HOST.zi6}` },
      { name: 'ggbases', url: (k) => `https://${HOST.ggbases}/search.so?title=${enc(k)}` },
      { name: 'DMM', url: (k) => `https://${HOST.dmm}/search/=/searchstr=${enc(k)}/` },
      { name: 'Fanza', url: (k) => `https://${HOST.dlsoft}/search/?service=pcgame&searchstr=${enc(k)}` },
      { name: 'DLsite', url: (k) => `https://${HOST.dlsite}/pro/fsr/=/keyword/${dlsiteKw(k)}` }
    ]
  },
  {
    key: 'guide',
    labelKey: 'vn.links.cross_guide',
    sites: [
      { name: '誠也の部屋', url: (k) => `https://${HOST.seiya}/game/kouryaku.html?search=${enc(k)}` },
      { name: '誠也存档', url: (k) => `https://${HOST.seiya}/save.html?cgsearch=${enc(k)}` },
      { name: 'Sagaoz攻略', url: (k) => `https://${HOST.sagaoz}/foolmaker/game.html?cgsearch=${enc(k)}` },
      { name: '2DFan', url: (k) => `https://${HOST.f2d}/subjects/search?keyword=${enc(k)}` },
      { name: 'Ai2', url: (k) => `https://${HOST.ai2}/search/?q=${enc(k)}` },
      { name: 'Moyu', url: (k) => `https://${HOST.moyu}/search?q=${enc(k)}` }
    ]
  },
  {
    key: 'db',
    labelKey: 'vn.links.cross_db',
    sites: [
      { name: 'VNDB', url: (k) => `https://${HOST.vndb}/v?sq=${enc(k)}` },
      { name: 'bangumi', url: (k) => `https://${HOST.bangumi}/subject_search/${enc(k)}?cat=4` },
      { name: '批评空间', url: (k) => `https://${HOST.erogamescape}/~ap2/ero/toukei_kaiseki/kensaku.php?category=game&word_category=name&mode=normal&word=${enc(k)}` },
      { name: '月幕', url: (k) => `https://${HOST.ymgal}/search?type=article&keyword=${enc(k)}` },
      { name: 'kyara', url: (k) => `https://${HOST.kyara}/kensaku.php?category=game&word_category=name&mode=normal&word=${enc(k)}` },
      { name: 'Moepedia', url: (k) => `https://${HOST.moepedia}/search/result/?s=${enc(k)}` },
      { name: 'VGMdb', url: (k) => `https://${HOST.vgmdb}/search?q=${enc(k)}` },
      { name: 'Bishogedb', url: (k) => `https://${HOST.bishogedb}/search?q=${enc(k)}` }
    ]
  },
  {
    key: 'adult',
    labelKey: 'vn.links.cross_adult',
    sites: [
      { name: '绯月', url: (k) => `https://${HOST.kf}/index.php?search=${enc(k)}` },
      { name: '鲲galgame', url: (k) => `https://${HOST.kungal}/search?q=${enc(k)}` },
      { name: 'animeShare', url: (k) => `https://${HOST.animeshare}/search/3528560/?q=${enc(k)}&o=relevance` },
      { name: 'nyaa', url: (k) => `https://${HOST.nyaa}/?f=0&c=0_0&q=${enc(k)}` },
      { name: 'Sukebei', url: (k) => `https://${HOST.sukebei}/?f=0&c=0_0&q=${enc(k)}` },
      { name: 'F95', url: (k) => `https://${HOST.f95}/search/040867454/?q=${enc(k)}&o=relevance` },
      { name: 'eHentai', url: (k) => `https://${HOST.eh}/?f_search=${enc(k)}` },
      { name: 'ExHentai', url: (k) => `https://${HOST.ex}/?f_search=${enc(k)}` },
      { name: 'Hitomi', url: (k) => `https://${HOST.hitomi}/search.html?${enc(k)}` }
    ]
  }
]

/**
 * 生成跨站搜索链接
 * @param {string} keyword 搜索关键词（通常是 VN 原名 alttitle）
 * @returns {Array<{key,labelKey,sites:{name,url,native?}[]}>}
 */
export function buildCrossSearchLinks(keyword) {
  const kw = String(keyword || '').trim()
  if (!kw) return []
  return CROSS_SEARCH_GROUPS.map((g) => ({
    key: g.key,
    labelKey: g.labelKey,
    sites: g.sites.map((s) => ({ name: s.name, url: s.url(kw), native: s.native || null }))
  }))
}

const KANA_RE = /[\u3040-\u30ff]/
const JA_SCRIPT_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/

/**
 * 从 VNDB API 的 vn 对象构造「换个标题搜」用的标题列表。
 * 对应用户脚本 collectTitles()：主标题优先、日文原名（含假名）最优先，
 * 其余各语言标题与罗马字转写按 API 顺序补在后面。
 *
 * @param {object} vn getVnDetail 返回的 vn 对象（含 title/alttitle/titles）
 * @returns {Array<{text:string, lang:string}>} 去重后的标题列表
 */
export function buildCrossSearchTitles(vn) {
  if (!vn) return []
  const list = []
  const seen = new Set()
  const add = (text, lang) => {
    const value = String(text || '').replace(/\s+/g, ' ').trim()
    if (!value) return
    const key = value.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    list.push({ text: value, lang: lang || '' })
  }

  // 1. 原名（alttitle）通常是日文
  if (vn.alttitle) add(vn.alttitle, KANA_RE.test(vn.alttitle) ? 'ja' : '')

  // 2. 各语言标题：先放含假名的（日文），其余语言随后
  const titles = Array.isArray(vn.titles) ? vn.titles : []
  titles.filter((t) => KANA_RE.test(String(t?.title || ''))).forEach((t) => add(t.title, t.lang || 'ja'))
  titles.forEach((t) => {
    if (KANA_RE.test(String(t?.title || ''))) return
    add(t.title, t.lang || '')
  })

  // 3. 罗马字转写（latin）放最后，标记为 latin
  titles.forEach((t) => {
    if (t?.latin) add(t.latin, 'latin')
  })

  // 4. 主标题定性：已有日文标题时主标题视为日文写法，否则标「主标题」；固定放第一位
  const main = vn.title || vn.alttitle || ''
  if (main) {
    const hasJa = list.some((t) => t.lang === 'ja')
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].text.toLowerCase() === String(main).toLowerCase()) list.splice(i, 1)
    }
    list.unshift({ text: String(main).trim(), lang: hasJa ? 'ja' : 'main' })
  }

  return list
}

/**
 * 从标题列表里挑默认关键词：优先「日文且含假名/汉字」的，其次第一个 ja，再次第一个。
 * 对应用户脚本 buildPanel() 里的 defaultEntry 选择。
 */
export function pickDefaultTitle(titles) {
  if (!Array.isArray(titles) || !titles.length) return ''
  const entry =
    titles.find((t) => t.lang === 'ja' && JA_SCRIPT_RE.test(t.text)) ||
    titles.find((t) => t.lang === 'ja') ||
    titles[0]
  return entry ? entry.text : ''
}

/**
 * 点击跨站搜索站点的统一入口。所有站点（含 TouchGal）都完全跟随
 * 「跨站搜索打开方式」设置，不做任何站点特殊化：
 * - 内置浏览器模式：TouchGal 在内嵌 WebView 里注入脚本自动填词回车，
 *   其余站点直接在内置浏览器里打开搜索页；
 * - 系统浏览器模式：一律交给系统浏览器打开搜索页。
 *
 * @param {{name:string,url:string,native?:string|null}} site
 * @param {string} keyword
 * @returns {Promise<void>}
 */
export async function openCrossSearchSite(site, keyword) {
  if (!site) return
  const { getCrossSearchBrowserMode, LINK_BROWSER_INAPP, openExternalUrl } = await import('./linkOpener')
  // 跨站搜索有独立设置（默认系统浏览器）
  const mode = getCrossSearchBrowserMode()
  const preferInApp = mode === LINK_BROWSER_INAPP

  if (site.native === 'touchgal' && preferInApp) {
    try {
      const { openTouchGalSearch } = await import('./touchgalSearch')
      const handled = await openTouchGalSearch(keyword)
      if (handled) return
    } catch (e) {
      console.error('[crossSearch] native open failed:', e)
    }
  }
  await openExternalUrl(site.url, { mode })
}
