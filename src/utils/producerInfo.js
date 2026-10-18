import { Capacitor } from '@capacitor/core'
import { runHiddenPage } from './lengthVote'

/**
 * 会社（producer）关联会社。
 *
 * 数据来源说明：VNDB 的 Kana API **没有** producer relations 字段
 * （`fields: 'relations{...}'` 会报 `Field 'relations' not found`），
 * 关联会社只存在于 vndb.org/p{id} 页面的 `<p class="center">` 信息块里，
 * 例如：`Subsidiary: <a href="/p53">AngelSmile</a>, ...`。
 * 因此这里用隐藏 WebView 打开页面再解析 DOM（vndb.org 对裸请求会 503 反爬）。
 */

// lib/VNDB/Types.pm 的 PRODUCER_RELATION
export const PRODUCER_RELATIONS = [
  { code: 'old', label: 'Formerly' },
  { code: 'new', label: 'Succeeded by' },
  { code: 'spa', label: 'Spawned' },
  { code: 'ori', label: 'Originated from' },
  { code: 'sub', label: 'Subsidiary' },
  { code: 'par', label: 'Parent producer' },
  { code: 'imp', label: 'Imprint' },
  { code: 'ipa', label: 'Parent brand' }
]

const CACHE_KEY = 'vndb_producer_page_cache'
const CACHE_TTL = 7 * 24 * 3600 * 1000

function normalizeId(pid) {
  const s = String(pid || '').trim().toLowerCase()
  if (!s) return ''
  return /^p\d+$/.test(s) ? s : `p${s.replace(/^p/, '')}`
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return {}
    const obj = JSON.parse(raw)
    return obj && typeof obj === 'object' ? obj : {}
  } catch (e) {
    return {}
  }
}

function writeCache(map) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(map))
  } catch (e) {
    /* 忽略配额错误 */
  }
}

/** 读缓存里的会社页面信息（没有或过期返回 null） */
export function getCachedProducerPage(pid) {
  const id = normalizeId(pid)
  if (!id) return null
  const entry = readCache()[id]
  if (!entry || !entry.data) return null
  if (Date.now() - (entry.ts || 0) > CACHE_TTL) return null
  return entry.data
}

function saveProducerPage(pid, data) {
  const id = normalizeId(pid)
  if (!id) return
  const map = readCache()
  map[id] = { ts: Date.now(), data }
  writeCache(map)
}

/** 清掉某个会社的缓存（强制重新抓取用） */
export function clearProducerPageCache(pid) {
  const id = normalizeId(pid)
  if (!id) return
  const map = readCache()
  delete map[id]
  writeCache(map)
}

/**
 * 在 vndb.org/p{id} 页面里执行：解析标题、a.k.a.、简介正文、关联会社。
 * 结构依据 lib/VNWeb/Producers/Page.pm 的 info_ / _infobox：
 *   <article>
 *     <h1>名称</h1><h2 class="alttitle">原名</h2>
 *     <p class="center">Company<br />Primary language: Japanese<br />a.k.a. xxx<br /><a href="https://...">Official website</a> - ...</p>
 *     <p class="center"><br />Subsidiary: <a href="/p53" title="原名">名称</a>, ...<br />Parent producer: <a .../></p>
 *     <div class="description">...</div>
 *   </article>
 */
function buildProducerPageScript(pid) {
  const pidJson = JSON.stringify(pid)
  return `(function(){
  var pid = ${pidJson};
  function send(obj){ try { obj.__vndbestProducerInfo = 1; window.mobileApp.postMessage({detail: obj}); } catch(e){} }
  try {
    if (location.pathname.indexOf('login') >= 0) { send({ok:false, error:'NOT_LOGGED_IN'}); return; }
    var bodyText = document.body ? (document.body.textContent || '') : '';
    if (bodyText.indexOf('Crawlers are not permitted') >= 0) { send({ok:false, error:'BLOCKED'}); return; }

    var article = document.querySelector('main article') || document.querySelector('article');
    if (!article) { send({ok:false, error:'NO_ARTICLE'}); return; }

    var h1 = article.querySelector('h1');
    var h2 = article.querySelector('h2.alttitle');
    var out = {
      id: pid,
      name: h1 ? (h1.textContent || '').trim() : '',
      original: h2 ? (h2.textContent || '').trim() : '',
      alias: '',
      description: '',
      relations: []
    };

    // 关联会社：<p class="center"> 里以 <br> 分段的「标签: 链接, 链接」
    var relMap = {};
    var ps = article.querySelectorAll('p.center');
    for (var p = 0; p < ps.length; p++) {
      var html = ps[p].innerHTML || '';
      var chunks = html.split(/<br\\s*\\/?>/i);
      for (var c = 0; c < chunks.length; c++) {
        var wrap = document.createElement('div');
        wrap.innerHTML = chunks[c];
        var text = (wrap.textContent || '').replace(/\\s+/g, ' ').trim();
        if (!text) continue;

        // a.k.a. 别名
        var aka = text.match(/a\\.k\\.a\\.\\s*(.+)$/i);
        if (aka && aka[1]) {
          out.alias = aka[1].trim();
          continue;
        }

        var lm = text.match(/^([A-Za-z][A-Za-z ]{1,20}):/);
        if (!lm) continue;
        var label = lm[1].trim();
        var anchors = wrap.querySelectorAll('a[href]');
        for (var a = 0; a < anchors.length; a++) {
          var href = anchors[a].getAttribute('href') || '';
          var mm = href.match(/^\\/p(\\d+)$/i);
          if (!mm) continue;
          var rid = 'p' + mm[1];
          var rname = (anchors[a].textContent || '').trim();
          var rorig = anchors[a].getAttribute('title') || '';
          if (!relMap[label]) relMap[label] = [];
          var exists = false;
          for (var e = 0; e < relMap[label].length; e++) { if (relMap[label][e].id === rid) exists = true; }
          if (!exists) relMap[label].push({ id: rid, name: rname, original: rorig, relationLabel: label });
        }
      }
    }
    for (var key in relMap) {
      if (!Object.prototype.hasOwnProperty.call(relMap, key)) continue;
      for (var i = 0; i < relMap[key].length; i++) out.relations.push(relMap[key][i]);
    }

    // 简介正文：<div class="description">，<br> 转换行，剥标签
    var desc = article.querySelector('div.description');
    if (desc) {
      var dh = (desc.innerHTML || '').replace(/<br\\s*\\/?>/gi, '\\n');
      var tmp = document.createElement('div');
      tmp.innerHTML = dh;
      out.description = (tmp.textContent || '').replace(/\\n{3,}/g, '\\n\\n').trim();
    }

    send({ok:true, page: out});
  } catch (e) { send({ok:false, error:String(e)}); }
})();`
}

/**
 * 抓取会社页面信息（含关联会社）。
 *
 * @returns {Promise<{ok:boolean, error?:string, page?:{id,name,original,alias,description,relations:Array}}>}
 *   error 取值：NOT_NATIVE / NO_ID / TIMEOUT / BLOCKED / NOT_LOGGED_IN / NO_ARTICLE / 其它文本
 */
export async function fetchProducerPage(pid, { useCache = true } = {}) {
  const id = normalizeId(pid)
  if (!id) return { ok: false, error: 'NO_ID' }

  if (useCache) {
    const cached = getCachedProducerPage(id)
    if (cached) return { ok: true, page: cached, cached: true }
  }

  if (!Capacitor.isNativePlatform()) return { ok: false, error: 'NOT_NATIVE' }

  const res = await runHiddenPage(`https://vndb.org/${id}`, buildProducerPageScript(id), {
    timeout: 25000,
    fallbackDelay: 5000,
    marker: '__vndbestProducerInfo'
  })
  if (!res.ok) return { ok: false, error: res.error }

  const page = res.data?.page
  if (!page) return { ok: false, error: 'NO_ARTICLE' }
  saveProducerPage(id, page)
  return { ok: true, page }
}

/** 把站点上的英文关系名映射成 PRODUCER_RELATION 代码（用于 i18n） */
export function relationCodeOf(label) {
  const hit = PRODUCER_RELATIONS.find((r) => r.label.toLowerCase() === String(label || '').trim().toLowerCase())
  return hit ? hit.code : ''
}
