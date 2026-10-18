import { Capacitor } from '@capacitor/core'
import { runHiddenPage } from './lengthVote'

/**
 * 游戏详情页「统计」选项卡：用户评分分布（柱状图）。
 *
 * 数据来源说明：Kana API 的 `/vn` 只有 `rating`（平均分）、`votecount`（票数）、
 * `average`（贝叶斯加权分），**没有**评分分布（1~10 分各多少人）。
 * 分布只存在于 vndb.org/v{id} 页面的 `article#stats` 里：
 *   <article id="stats"><h1>User stats</h1><div class="votestats">
 *     <table class="votegraph">
 *       <thead><tr><td colspan="2">Vote stats</td></tr></thead>
 *       <tfoot><tr><td colspan="2">8796 votes (rank 23)<br />8.45 average (rank 59)</td></tr></tfoot>
 *       <tr><td class="number">10</td><td class="graph"><div style="width: 241px"> </div>2500</td></tr>
 *       ...
 *     </table>
 *     <table class="recentvotes stripe">...最近的投票...</table>
 *   </div></article>
 * 因此这里用隐藏 WebView 打开页面再解析 DOM（vndb.org 对裸请求会 503 反爬）。
 */

const CACHE_KEY = 'vndb_vn_stats_cache'
const CACHE_TTL = 6 * 3600 * 1000

function normalizeId(vid) {
  const s = String(vid || '').trim().toLowerCase()
  if (!s) return ''
  return /^v\d+$/.test(s) ? s : `v${s.replace(/^v/, '')}`
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

/** 读缓存的统计信息（没有或过期返回 null） */
export function getCachedVnStats(vid) {
  const id = normalizeId(vid)
  if (!id) return null
  const entry = readCache()[id]
  if (!entry || !entry.data) return null
  if (Date.now() - (entry.ts || 0) > CACHE_TTL) return null
  return entry.data
}

function saveVnStats(vid, data) {
  const id = normalizeId(vid)
  if (!id) return
  const map = readCache()
  map[id] = { ts: Date.now(), data }
  writeCache(map)
}

/** 清掉某个 VN 的统计缓存（强制重新抓取用） */
export function clearVnStatsCache(vid) {
  const id = normalizeId(vid)
  if (!id) return
  const map = readCache()
  delete map[id]
  writeCache(map)
}

/**
 * 在 vndb.org/v{id} 页面里执行：解析 article#stats 的评分分布与最近投票。
 */
function buildStatsScript(vid) {
  const vidJson = JSON.stringify(vid)
  return `(function(){
  var vid = ${vidJson};
  function send(obj){ try { obj.__vndbestVnStats = 1; window.mobileApp.postMessage({detail: obj}); } catch(e){} }
  try {
    var bodyText = document.body ? (document.body.textContent || '') : '';
    if (bodyText.indexOf('Crawlers are not permitted') >= 0) { send({ok:false, error:'BLOCKED'}); return; }

    var article = document.querySelector('article#stats') || document.getElementById('stats');
    if (!article) { send({ok:false, error:'NO_STATS'}); return; }

    var out = {
      id: vid,
      total: 0,
      average: null,
      votesRank: null,
      averageRank: null,
      distribution: [],
      recent: []
    };

    var table = article.querySelector('table.votegraph');
    if (table) {
      var foot = table.querySelector('tfoot');
      if (foot) {
        var ft = (foot.textContent || '').replace(/\\s+/g, ' ').trim();
        var mv = ft.match(/([\\d,]+)\\s*votes/i);
        if (mv) out.total = parseInt(mv[1].replace(/,/g, ''), 10) || 0;
        var vr = ft.match(/votes\\s*\\(rank\\s*(\\d+)\\)/i);
        if (vr) out.votesRank = parseInt(vr[1], 10);
        var ma = ft.match(/([\\d.]+)\\s*average/i);
        if (ma) out.average = parseFloat(ma[1]);
        var ar = ft.match(/average\\s*\\(rank\\s*(\\d+)\\)/i);
        if (ar) out.averageRank = parseInt(ar[1], 10);
      }

      var rows = table.querySelectorAll('tr');
      var seen = {};
      for (var i = 0; i < rows.length; i++) {
        var tds = rows[i].querySelectorAll('td');
        if (tds.length < 2) continue;
        var scoreTxt = (tds[0].textContent || '').trim();
        if (!/^\\d+$/.test(scoreTxt)) continue;
        var score = parseInt(scoreTxt, 10);
        if (score < 1 || score > 10 || seen[score]) continue;
        var countTxt = (tds[1].textContent || '').replace(/\\s+/g, ' ').trim();
        var mc = countTxt.match(/(\\d+)\\s*$/);
        var count = mc ? parseInt(mc[1], 10) : 0;
        seen[score] = 1;
        out.distribution.push({ score: score, count: count });
      }
      out.distribution.sort(function(a, b){ return b.score - a.score; });
    }

    var recentTable = article.querySelector('table.recentvotes');
    if (recentTable) {
      var rrows = recentTable.querySelectorAll('tr');
      for (var r = 0; r < rrows.length; r++) {
        var rtds = rrows[r].querySelectorAll('td');
        if (rtds.length < 3) continue;
        var a = rtds[0].querySelector('a');
        if (!a) continue;
        var href = a.getAttribute('href') || '';
        var mu = href.match(/^\\/u(\\d+)$/i);
        if (!mu) continue;
        var voteTxt = (rtds[1].textContent || '').trim();
        if (!/^\\d+$/.test(voteTxt)) continue;
        out.recent.push({
          uid: 'u' + mu[1],
          user: (a.textContent || '').trim(),
          vote: parseInt(voteTxt, 10),
          date: (rtds[2].textContent || '').trim()
        });
        if (out.recent.length >= 12) break;
      }
    }

    if (!out.distribution.length) { send({ok:false, error:'NO_STATS'}); return; }
    send({ok:true, stats: out});
  } catch (e) { send({ok:false, error:String(e)}); }
})();`
}

/**
 * 抓取 VN 的评分分布统计。
 *
 * @returns {Promise<{ok:boolean, error?:string, stats?:object, cached?:boolean}>}
 *   error 取值：NOT_NATIVE / NO_ID / TIMEOUT / BLOCKED / NO_STATS / 其它文本
 */
export async function fetchVnStats(vid, { useCache = true } = {}) {
  const id = normalizeId(vid)
  if (!id) return { ok: false, error: 'NO_ID' }

  if (useCache) {
    const cached = getCachedVnStats(id)
    if (cached) return { ok: true, stats: cached, cached: true }
  }

  if (!Capacitor.isNativePlatform()) return { ok: false, error: 'NOT_NATIVE' }

  const res = await runHiddenPage(`https://vndb.org/${id}`, buildStatsScript(id), {
    timeout: 25000,
    fallbackDelay: 5000,
    marker: '__vndbestVnStats'
  })
  if (!res.ok) return { ok: false, error: res.error }

  const stats = res.data?.stats
  if (!stats || !stats.distribution?.length) return { ok: false, error: 'NO_STATS' }
  saveVnStats(id, stats)
  return { ok: true, stats }
}
