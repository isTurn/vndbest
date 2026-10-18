/**
 * 游戏时长（length vote）的填写与同步。
 *
 * 背景：VNDB 的 Kana API 没有写入时长的端点，官方写入入口是站内 JSON 接口
 * `POST /js/VNLengthVote.json`，它只认 vndb.org 的登录 cookie（HttpOnly，App 拿不到）。
 * 所以这里分两步走，和「收藏信息」一样先在 App 里填、可随时改：
 *
 * 1) 本地保存：localStorage 按 VN id 存一条记录（时长/速度/私密/备注/版本/语言）。
 * 2) 同步：开一个隐藏的内置浏览器（WebView）打开 `https://vndb.org/v{id}/lengthvote`，
 *    在 vndb.org 的页面上下文里带着登录 cookie 直接 POST 那个接口，
 *    读完页面自带的 `#pagevars`（里面就是现有记录和可用版本）后合并写入。
 *
 * 这样既不用让用户手动去网页上填，也不依赖 API token（API token 没有写时长的权限）。
 */
import { Capacitor } from '@capacitor/core'
import { ref } from 'vue'

const STORAGE_KEY = 'vndb_length_votes'
/** 上次批量拉取「我的全部时长」的时间戳，避免每次进列表都开隐藏窗口 */
const ALL_FETCHED_KEY = 'vndb_length_votes_fetched_at'
/** 批量拉取的冷却时间：6 小时 */
const ALL_FETCH_TTL = 6 * 60 * 60 * 1000

/**
 * 本地时长记录的版本号。
 * 记录存在 localStorage 里不是响应式的，页面上的卡片依赖这个 ref 触发重渲染：
 * 任何写入操作都会 +1，模板里读一下即可自动刷新。
 */
export const lengthVoteRevision = ref(0)

function bumpRevision() {
  lengthVoteRevision.value += 1
}

/** 阅读速度选项，值与 VNDB 的 speed 字段一致（0 慢 / 1 正常 / 2 快） */
export const LENGTH_SPEEDS = [0, 1, 2]

/** 投票类型：counted=计入平均；uncounted=记录但不计入；private=私密 */
export const VOTE_TYPES = ['counted', 'uncounted', 'private']

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const obj = JSON.parse(raw)
    return obj && typeof obj === 'object' ? obj : {}
  } catch (e) {
    return {}
  }
}

function writeAll(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch (e) {
    /* 隐私模式下写不进去，忽略 */
  }
  // 通知所有读取本地时长的地方（列表卡片、详情页）重新渲染
  bumpRevision()
}

function normalizeId(vnId) {
  const s = String(vnId || '').trim()
  if (!s) return ''
  return s.startsWith('v') ? s : `v${s}`
}

/** 读取某个 VN 的本地时长记录，没有则返回 null */
export function getLengthVote(vnId) {
  const id = normalizeId(vnId)
  if (!id) return null
  const all = readAll()
  const entry = all[id]
  if (!entry || typeof entry !== 'object') return null
  return { ...entry, vnId: id }
}

/** 是否已经录过时长 */
export function hasLengthVote(vnId) {
  return !!getLengthVote(vnId)
}

/**
 * 保存（或覆盖）某个 VN 的时长记录。
 * @param {string} vnId
 * @param {{hours:number|string, mins:number|string, speed:number|null, private:boolean, notes:string, rid:string[], lang:string[]}} data
 */
export function saveLengthVote(vnId, data) {
  const id = normalizeId(vnId)
  if (!id) return null
  const minutes = Math.max(0, Math.round((Number(data.hours) || 0) * 60 + (Number(data.mins) || 0)))
  const entry = {
    minutes,
    hours: Number(data.hours) || 0,
    mins: Number(data.mins) || 0,
    speed: data.speed === null || data.speed === undefined ? null : Number(data.speed),
    private: !!data.private,
    notes: data.notes || '',
    rid: Array.isArray(data.rid) ? [...data.rid] : [],
    lang: Array.isArray(data.lang) ? [...data.lang] : [],
    updatedAt: Date.now()
  }
  const all = readAll()
  all[id] = entry
  writeAll(all)
  return { ...entry, vnId: id }
}

/** 标记已同步成功 */
export function markLengthVoteSynced(vnId) {
  const id = normalizeId(vnId)
  const all = readAll()
  if (!all[id]) return
  all[id] = { ...all[id], syncedAt: Date.now() }
  writeAll(all)
}

/**
 * 把从 VNDB 读回来的记录写进本地缓存。
 * 这样列表卡片上的「游玩时长」在没打开过填写弹窗时也能显示，
 * 并且标记成已同步，不会误显示成「仅本地」。
 */
export function cacheRemoteLengthVote(vnId, vote) {
  const id = normalizeId(vnId)
  if (!id || !vote) return null
  const minutes = Math.max(0, Math.round(Number(vote.length ?? vote.minutes) || 0))
  if (!minutes) return null
  const entry = {
    minutes,
    hours: Math.floor(minutes / 60),
    mins: minutes % 60,
    speed: vote.speed === null || vote.speed === undefined ? null : Number(vote.speed),
    private: !!vote.private,
    notes: vote.notes || '',
    rid: Array.isArray(vote.rid) ? [...vote.rid] : [],
    lang: Array.isArray(vote.lang) ? [...vote.lang] : [],
    updatedAt: Date.now(),
    syncedAt: Date.now(),
    remoteId: vote.id ?? null
  }
  const all = readAll()
  all[id] = entry
  writeAll(all)
  return { ...entry, vnId: id }
}

/** 删除本地记录 */
export function removeLengthVote(vnId) {
  const id = normalizeId(vnId)
  const all = readAll()
  delete all[id]
  writeAll(all)
}

/** 12h 30m / 45m 这样的展示文案 */
export function formatPlayTime(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0))
  if (!total) return ''
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  return `${m}m`
}

/**
 * 打开一个隐藏的内置浏览器加载 url，页面加载完再注入 code。
 * 注入的脚本必须通过 window.mobileApp.postMessage 回传带 `__vndbestLengthVote: 1` 的对象：
 *   { ok: true, ... }  或  { ok: false, error: 'CODE' }
 * 回传后立刻关闭隐藏窗口，并把消息原样返回。
 *
 * 用隐藏窗口而不是直接 fetch 的原因：vndb.org 对没有浏览器 cookie 的裸请求会回
 * 503「Crawlers are not permitted」，只有在真实 WebView 页面上下文里带 cookie 才通得过。
 *
 * @returns {Promise<{ok:boolean, error?:string, data?:object}>}
 */
export async function runHiddenPage(url, code, { timeout = 20000, fallbackDelay = 6000, marker = '__vndbestLengthVote' } = {}) {
  const { InAppBrowser } = await import('@capgo/inappbrowser')

  return new Promise((resolve) => {
    let webviewId = null
    let messageHandle = null
    let loadHandle = null
    let finished = false
    let executed = false
    let timer = null
    let fallbackTimer = null

    const cleanup = async () => {
      if (timer) clearTimeout(timer)
      if (fallbackTimer) clearTimeout(fallbackTimer)
      try {
        if (loadHandle) await loadHandle.remove()
      } catch (e) {
        /* ignore */
      }
      try {
        if (messageHandle) await messageHandle.remove()
      } catch (e) {
        /* ignore */
      }
      try {
        if (webviewId) await InAppBrowser.close({ id: webviewId })
      } catch (e) {
        /* ignore */
      }
    }

    const finish = async (result) => {
      if (finished) return
      finished = true
      await cleanup()
      resolve(result)
    }

    const run = async () => {
      if (executed || finished) return
      executed = true
      try {
        await InAppBrowser.executeScript({ code, ...(webviewId ? { id: webviewId } : {}) })
      } catch (e) {
        finish({ ok: false, error: e?.message || String(e) })
      }
    }

    ;(async () => {
      try {
        messageHandle = await InAppBrowser.addListener('messageFromWebview', (ev) => {
          // Capacitor 在不同版本/平台上把消息放在事件根对象或 event.detail 里，两种都兜住
          const d = ev && ev[marker] === 1 ? ev : (ev?.detail || {})
          if (!d || d[marker] !== 1) return
          finish({ ok: !!d.ok, error: d.ok ? undefined : (d.error || 'UNKNOWN'), data: d })
        })
        loadHandle = await InAppBrowser.addListener('browserPageLoaded', (ev) => {
          // 不按 id 严格过滤：部分机型第二个参数缺失，只要还没执行就补一次
          if (ev?.id && webviewId && ev.id !== webviewId) return
          run()
        })

        const res = await InAppBrowser.openWebView({
          url,
          hidden: true,
          isPresentAfterPageLoad: false,
          backgroundColor: 'white'
        })
        webviewId = res?.id || null

        // 页面加载事件偶尔收不到，兜底一段时间后强行注入一次
        fallbackTimer = setTimeout(() => {
          run()
        }, fallbackDelay)
        // 整体超时：收摊，避免隐藏窗口残留
        timer = setTimeout(() => {
          finish({ ok: false, error: 'TIMEOUT' })
        }, timeout)
      } catch (e) {
        finish({ ok: false, error: e?.message || String(e) })
      }
    })()
  })
}

/**
 * 把本地记录同步到 VNDB。
 *
 * @returns {Promise<{ok:boolean, error?:string, votes?:number}>}
 *   error 取值：NOT_NATIVE / NO_VN / NO_TIME / TIMEOUT / FORBIDDEN / NOT_LOGGED_IN /
 *               NO_WIDGET / NO_RELEASES / NO_LANG / 其它文本
 */
export async function syncLengthVote(vnId, entry) {
  if (!Capacitor.isNativePlatform()) {
    return { ok: false, error: 'NOT_NATIVE' }
  }
  const vid = normalizeId(vnId)
  if (!vid) return { ok: false, error: 'NO_VN' }

  const payload = {
    rid: (entry?.rid || []).map(String).filter(Boolean),
    lang: (entry?.lang || []).map(String).filter(Boolean),
    length: Math.max(0, Math.round(Number(entry?.minutes) || 0)),
    speed: entry?.speed === null || entry?.speed === undefined ? null : Number(entry.speed),
    private: !!entry?.private,
    notes: entry?.notes || ''
  }
  if (!payload.length) return { ok: false, error: 'NO_TIME' }

  const res = await runHiddenPage(`https://vndb.org/${vid}/lengthvote`, buildInjectScript(vid, payload))
  if (res.ok) {
    markLengthVoteSynced(vid)
    return { ok: true, votes: res.data?.votes }
  }
  return { ok: false, error: res.error }
}

/**
 * 读取这部作品的全部公开时长投票（含备注）。
 * 数据来自 vndb.org 的 `/v{id}/lengthvotes` 列表页：Kana API 不提供这些信息。
 *
 * @returns {Promise<{ok:boolean, error?:string, votes?:Array, stats?:Array}>}
 *   votes: [{ uid, user, date, minutes, speed, private, notes, rels[], langs[] }]
 *   stats: [{ speed, median, avg, stddev, count }]
 */
export async function fetchLengthVotes(vnId) {
  if (!Capacitor.isNativePlatform()) {
    return { ok: false, error: 'NOT_NATIVE' }
  }
  const vid = normalizeId(vnId)
  if (!vid) return { ok: false, error: 'NO_VN' }

  const res = await runHiddenPage(`https://vndb.org/${vid}/lengthvotes`, buildListScript(vid), {
    timeout: 25000,
    fallbackDelay: 5000
  })
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, votes: res.data?.votes || [], stats: res.data?.stats || [] }
}

/**
 * 读取「我自己」在 VNDB 上已有的时长记录。
 *
 * 用于「修改前先获取自己账号上的记录」：打开填写弹窗时先把服务器上的现有记录拉回来，
 * 而不是只信本地缓存（本地可能为空、或与网站上的不一致）。
 * 数据来自 `/v{id}/lengthvote` 页面 pagevars 里的 `votes`，只读、不写。
 *
 * @returns {Promise<{ok:boolean, error?:string, votes?:Array, releases?:Array}>}
 *   votes: [{ id, rid[], lang[], length, speed, private, notes }]
 */
export async function fetchMyLengthVote(vnId) {
  if (!Capacitor.isNativePlatform()) {
    return { ok: false, error: 'NOT_NATIVE' }
  }
  const vid = normalizeId(vnId)
  if (!vid) return { ok: false, error: 'NO_VN' }

  const res = await runHiddenPage(`https://vndb.org/${vid}/lengthvote`, buildReadMineScript(vid), {
    timeout: 20000,
    fallbackDelay: 5000
  })
  if (!res.ok) return { ok: false, error: res.error }
  const votes = res.data?.votes || []
  const releases = res.data?.releases || []
  // 拿到的第一条（rid 最多的那条）就是用户在网站上的记录，写回本地缓存
  if (votes.length) cacheRemoteLengthVote(vid, votes[0])
  return { ok: true, votes, releases }
}

/**
 * 在 vndb.org 页面里执行的脚本：读 #pagevars，合并本地记录，POST /js/VNLengthVote.json。
 * 结果通过 window.mobileApp.postMessage 回传给 App。
 *
 * 关键点（对着 lib/VNWeb/VN/Length.pm 的 FORM_IN 写）：
 * - rid 必须是 `available_releases` 的子集（已发售且非 trial），否则整条被丢弃；
 * - lang 必须是所选 release 语言的交集子集；
 * - length 范围 [1, 26159] 分钟；
 * - private=true 时服务端会强制 speed=null；
 * - 未保留的旧记录会被 DELETE，所以必须把已有的 votes 全量回传。
 */
function buildInjectScript(vid, payload) {
  const payloadJson = JSON.stringify(payload)
  const vidJson = JSON.stringify(vid)
  return `(function(){
  var payload = ${payloadJson};
  var vid = ${vidJson};
  function send(obj){ try { obj.__vndbestLengthVote = 1; window.mobileApp.postMessage({detail: obj}); } catch(e){} }
  try {
    // 没登录时页面会落在登录页 / 没有 pagevars
    var el = document.getElementById('pagevars');
    if (!el) { send({ok:false, error: (location.pathname.indexOf('login') >= 0 ? 'NOT_LOGGED_IN' : 'NO_PAGEVARS')}); return; }
    var pv = JSON.parse(el.textContent || el.innerText || '{}');
    var w = pv.widget && pv.widget.VNLengthVote;
    var d = w && w[0] && w[0][1];
    if (!d) { send({ok:false, error: (pv.uid ? 'NO_WIDGET' : 'NOT_LOGGED_IN')}); return; }

    // 页面给的「可投票版本」才是权威白名单
    var avail = d.releases || [];
    var byId = {};
    for (var a = 0; a < avail.length; a++) byId[avail[a].id] = avail[a];
    var validRid = (payload.rid || []).filter(function(r){ return !!byId[r]; });
    if (!validRid.length) validRid = avail.map(function(r){ return r.id; });
    if (!validRid.length) { send({ok:false, error:'NO_RELEASES'}); return; }

    // 语言必须落在所选版本的语言交集里
    var langSet = {};
    for (var b = 0; b < validRid.length; b++) {
      var ls = (byId[validRid[b]] && byId[validRid[b]].lang) || [];
      for (var c = 0; c < ls.length; c++) langSet[ls[c]] = 1;
    }
    var validLang = (payload.lang || []).filter(function(l){ return !!langSet[l]; });
    if (!validLang.length) validLang = Object.keys(langSet);
    if (!validLang.length) { send({ok:false, error:'NO_LANG'}); return; }

    var votes = (d.votes || []).map(function(v){
      return {
        id: v.id,
        rid: v.rid || [],
        lang: v.lang || [],
        length: v.length,
        speed: (v.speed === undefined ? null : v.speed),
        private: !!v.private,
        notes: v.notes || ''
      };
    });
    var ridKey = validRid.slice().sort().join(',');
    var idx = -1;
    for (var i = 0; i < votes.length; i++) {
      var k = (votes[i].rid || []).slice().sort().join(',');
      if (k === ridKey) { idx = i; break; }
    }
    var entry = {
      rid: validRid,
      lang: validLang,
      length: payload.length,
      speed: payload.private ? null : payload.speed,
      private: !!payload.private,
      notes: payload.notes || ''
    };
    if (idx >= 0) {
      entry.id = votes[idx].id;
      votes[idx] = entry;
    } else {
      var min = 0;
      for (var j = 0; j < votes.length; j++) { if (votes[j].id < min) min = votes[j].id; }
      entry.id = min - 1;
      votes.push(entry);
    }
    var body = JSON.stringify({ vid: d.vid || vid, votes: votes });
    fetch('/js/VNLengthVote.json', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body
    }).then(function(r){
      if (r.status === 403) { send({ok:false, error:'FORBIDDEN'}); return null; }
      if (r.status !== 200) { send({ok:false, error:'HTTP ' + r.status}); return null; }
      return r.json();
    }).then(function(j){
      if (!j) return;
      if (j._err) send({ok:false, error: j._err});
      else send({ok:true, votes: votes.length});
    }).catch(function(e){ send({ok:false, error:String(e)}); });
  } catch (e) { send({ok:false, error:String(e)}); }
})();`
}

/**
 * 一次性把「我自己的全部时长记录」拉回来并写入本地缓存。
 *
 * 数据来自 `https://vndb.org/u{uid}/lengthvotes`：这是公开的按用户汇总页，
 * 一页就能拿到该用户所有作品的时长（列表卡片要显示游玩时长，逐部去 /lengthvote
 * 打开隐藏窗口代价太高，用这个汇总页一次搞定）。
 *
 * @returns {Promise<{ok:boolean, error?:string, count?:number}>}
 */
export async function fetchAllMyLengthVotes() {
  if (!Capacitor.isNativePlatform()) {
    return { ok: false, error: 'NOT_NATIVE' }
  }
  const uid = String(localStorage.getItem('vndb_user_id') || '').trim()
  if (!/^u\d+$/.test(uid)) return { ok: false, error: 'NOT_LOGGED_IN' }

  const res = await runHiddenPage(`https://vndb.org/${uid}/lengthvotes`, buildMyListScript(uid), {
    timeout: 25000,
    fallbackDelay: 5000
  })
  if (!res.ok) return { ok: false, error: res.error }

  const rows = res.data?.votes || []
  let count = 0
  // 批量写入：几十条记录逐条写会触发几十次 localStorage 序列化 + 重渲染，这里合并成一次
  const all = readAll()
  const now = Date.now()
  for (const row of rows) {
    if (!row.vid || !row.minutes) continue
    const id = normalizeId(row.vid)
    if (!id) continue
    const minutes = Math.max(0, Math.round(Number(row.minutes) || 0))
    if (!minutes) continue
    all[id] = {
      minutes,
      hours: Math.floor(minutes / 60),
      mins: minutes % 60,
      speed: row.speed === null || row.speed === undefined ? null : Number(row.speed),
      private: false,
      notes: row.notes || '',
      rid: Array.isArray(row.rels) ? [...row.rels] : [],
      lang: Array.isArray(row.langs) ? [...row.langs] : [],
      updatedAt: now,
      syncedAt: now,
      remoteId: null
    }
    count++
  }
  if (count) writeAll(all)
  return { ok: true, count }
}

/** 正在进行的批量拉取，避免多个列表同时触发重复请求 */
let allFetching = null

/**
 * 带冷却的批量拉取：列表卡片要显示游玩时长时调用。
 * 6 小时内只拉一次，失败也记时间戳（下次失败后不会立刻重试刷屏）。
 * @param {boolean} force 忽略冷却强制刷新
 */
export async function ensureAllMyLengthVotes(force = false) {
  if (!Capacitor.isNativePlatform()) return { ok: false, error: 'NOT_NATIVE' }
  if (allFetching) return allFetching

  const last = Number(localStorage.getItem(ALL_FETCHED_KEY) || 0)
  if (!force && last && Date.now() - last < ALL_FETCH_TTL) {
    return { ok: true, cached: true }
  }

  allFetching = (async () => {
    const res = await fetchAllMyLengthVotes()
    try {
      localStorage.setItem(ALL_FETCHED_KEY, String(Date.now()))
    } catch (e) {
      /* ignore */
    }
    allFetching = null
    return res
  })()
  return allFetching
}

/**
 * 强制重新拉取（设置页「刷新我的游玩时长」按钮用），忽略 6 小时冷却。
 */
export async function refreshAllMyLengthVotes() {
  return ensureAllMyLengthVotes(true)
}

/**
 * 在 `/u{uid}/lengthvotes` 页面里执行的脚本：把「我的时长记录」表格解析成 JSON。
 * 表头（6 列）：Date / Title / Time / Speed / Rel / Notes
 *   - Title 列是 `<a href="/v64038">日文名</a>`，从中取 vN 作为作品 id
 *   - Time 列是 vnlength_ 渲染的「5h」「1h34m」「45m」，必须按 h/m 分别解析
 *   - Rel 列混着 `<abbr class="icon-lang-xx">` 和 `<a href="/r123">`
 */
function buildMyListScript(uid) {
  const uidJson = JSON.stringify(uid)
  return `(function(){
  var uid = ${uidJson};
  function send(obj){ try { obj.__vndbestLengthVote = 1; window.mobileApp.postMessage({detail: obj}); } catch(e){} }
  try {
    if (location.pathname.indexOf('login') >= 0) { send({ok:false, error:'NOT_LOGGED_IN'}); return; }
    var bodyText = document.body ? (document.body.textContent || '') : '';
    if (bodyText.indexOf('Crawlers are not permitted') >= 0) { send({ok:false, error:'BLOCKED'}); return; }

    var table = document.querySelector('table.stripe') || document.querySelector('table.lengthlist') || document.querySelector('table');
    if (!table) { send({ok:false, error:'NO_TABLE'}); return; }

    var rows = table.querySelectorAll('tr');
    var votes = [];
    for (var i = 0; i < rows.length; i++) {
      var tds = rows[i].querySelectorAll('td');
      if (tds.length < 5) continue;
      var dateTxt = (tds[0].textContent || '').trim();
      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(dateTxt)) continue;

      var titleLink = tds[1].querySelector('a[href^="/v"]');
      if (!titleLink) continue;
      var vid = (titleLink.getAttribute('href') || '').replace(/^\\//, '').split(/[?#]/)[0];
      if (!/^v\\d+$/.test(vid)) continue;

      var timeTxt = (tds[2].textContent || '').trim();
      var hm = timeTxt.match(/(\\d+)\\s*h/i);
      var mm = timeTxt.match(/(\\d+)\\s*m/i);
      var minutes = (hm ? parseInt(hm[1], 10) * 60 : 0) + (mm ? parseInt(mm[1], 10) : 0);
      if (!minutes) continue;

      var speedTxt = (tds[3].textContent || '').trim().toLowerCase();
      var speed = speedTxt === 'slow' ? 0 : speedTxt === 'normal' ? 1 : speedTxt === 'fast' ? 2 : null;

      var rels = [];
      var langs = [];
      if (tds[4]) {
        var anchors = tds[4].querySelectorAll('a');
        for (var a = 0; a < anchors.length; a++) rels.push((anchors[a].textContent || '').trim());
        var abbrs = tds[4].querySelectorAll('abbr');
        for (var b = 0; b < abbrs.length; b++) {
          var m2 = (abbrs[b].className || '').match(/icon-lang-([a-z-]+)/i);
          if (m2) langs.push(m2[1]);
        }
      }
      votes.push({
        vid: vid,
        date: dateTxt,
        title: (titleLink.textContent || '').trim(),
        minutes: minutes,
        speed: speed,
        rels: rels,
        langs: langs,
        notes: (tds[5] ? tds[5].textContent : '').trim()
      });
    }
    send({ok:true, votes: votes});
  } catch (e) { send({ok:false, error:String(e)}); }
})();`
}

/**
 * 在 `/v{id}/lengthvote` 页面里执行的脚本：只读取 `#pagevars` 里属于当前用户的投票记录。
 * 不写库，纯读取，供「修改前先获取自己账号上的记录」用。
 */
function buildReadMineScript(vid) {
  const vidJson = JSON.stringify(vid)
  return `(function(){
  var vid = ${vidJson};
  function send(obj){ try { obj.__vndbestLengthVote = 1; window.mobileApp.postMessage({detail: obj}); } catch(e){} }
  try {
    var el = document.getElementById('pagevars');
    if (!el) { send({ok:false, error: (location.pathname.indexOf('login') >= 0 ? 'NOT_LOGGED_IN' : 'NO_PAGEVARS')}); return; }
    var pv = JSON.parse(el.textContent || el.innerText || '{}');
    var w = pv.widget && pv.widget.VNLengthVote;
    var d = w && w[0] && w[0][1];
    if (!d) { send({ok:false, error: (pv.uid ? 'NO_WIDGET' : 'NOT_LOGGED_IN')}); return; }
    var votes = (d.votes || []).map(function(v){
      return {
        id: v.id,
        rid: v.rid || [],
        lang: v.lang || [],
        length: v.length,
        speed: (v.speed === undefined ? null : v.speed),
        private: !!v.private,
        notes: v.notes || ''
      };
    });
    // 按时长降序：多条记录时，最长的那条最可能是用户当前在用的
    votes.sort(function(a, b){ return (b.length || 0) - (a.length || 0); });
    var releases = (d.releases || []).map(function(r){
      return { id: r.id, title: r.title || '', released: r.released || '', lang: r.lang || [] };
    });
    send({ok:true, votes: votes, releases: releases});
  } catch (e) { send({ok:false, error:String(e)}); }
})();`
}

/**
 * 在 `/v{id}/lengthvotes` 列表页里执行的脚本：把服务器渲染好的表格解析成 JSON。
 *
 * 页面结构（lib/VNWeb/VN/Length.pm 的 listing_）：
 *   table.stripe.lengthlist > thead > tr > td（Date/User/Time/Speed/Rel/Notes）
 *   tbody > tr > td.tc1..tc6
 * 语言只以 `<abbr class="icon-lang-xx" title="...">` 出现（可能多个，拼在一起），
 * 版本是 `<a href="/r123">r123</a>` 逗号分隔；私密条目 notes 前面有 `(private)`。
 */
function buildListScript(vid) {
  const vidJson = JSON.stringify(vid)
  return `(function(){
  var vid = ${vidJson};
  function send(obj){ try { obj.__vndbestLengthVote = 1; window.mobileApp.postMessage({detail: obj}); } catch(e){} }
  try {
    if (location.pathname.indexOf('login') >= 0) { send({ok:false, error:'NOT_LOGGED_IN'}); return; }
    var bodyText = document.body ? (document.body.textContent || '') : '';
    if (bodyText.indexOf('Crawlers are not permitted') >= 0) { send({ok:false, error:'BLOCKED'}); return; }

    var table = document.querySelector('table.lengthlist') || document.querySelector('table.stripe');
    var votes = [];
    var stats = [];

    if (table) {
      var rows = table.querySelectorAll('tbody tr');
      for (var i = 0; i < rows.length; i++) {
        var tds = rows[i].querySelectorAll('td');
        if (tds.length < 5) continue;
        var speedTxt = (tds[3].textContent || '').trim().toLowerCase();
        var speed = speedTxt === 'slow' ? 0 : speedTxt === 'normal' ? 1 : speedTxt === 'fast' ? 2 : null;
        var rels = [];
        var anchors = tds[4].querySelectorAll('a');
        for (var a = 0; a < anchors.length; a++) rels.push((anchors[a].textContent || '').trim());
        var langs = [];
        var abbrs = tds[4].querySelectorAll('abbr');
        for (var b = 0; b < abbrs.length; b++) {
          var cls = abbrs[b].className || '';
          var m = cls.match(/icon-lang-([a-z-]+)/i);
          if (m) langs.push(m[1]);
        }
        var userEl = tds[1].querySelector('a');
        // 时长单元格是 vnlength_ 渲染的「11h30m」/「45m」，并可能带 " (票数)"，必须按 h/m 拆开算
        var timeTxt = (tds[2].textContent || '').trim();
        var hm = timeTxt.match(/(\\d+)\\s*h/i);
        var mm = timeTxt.match(/(\\d+)\\s*m/i);
        var minutes = (hm ? parseInt(hm[1], 10) * 60 : 0) + (mm ? parseInt(mm[1], 10) : 0);
        votes.push({
          date: (tds[0].textContent || '').trim(),
          uid: userEl ? (userEl.getAttribute('href') || '').replace(/^\\//, '') : '',
          user: userEl ? (userEl.textContent || '').trim() : (tds[1].textContent || '').trim(),
          minutes: minutes,
          speed: speed,
          rels: rels,
          langs: langs,
          notes: (tds[5] ? tds[5].textContent : '').trim()
        });
      }

      // 统计表（stats_）：Speed | Median | Average | Stddev | # Votes
      var tables = document.querySelectorAll('table');
      for (var t = 0; t < tables.length; t++) {
        if (tables[t] === table) continue;
        var srows = tables[t].querySelectorAll('tbody tr');
        if (!srows.length) srows = tables[t].querySelectorAll('tr');
        for (var r2 = 0; r2 < srows.length; r2++) {
          var cells = srows[r2].querySelectorAll('td');
          if (cells.length < 5) continue;
          var label = (cells[0].textContent || '').trim();
          if (!label) continue;
          stats.push({
            label: label,
            median: (cells[1].textContent || '').trim(),
            avg: (cells[2].textContent || '').trim(),
            count: parseInt((cells[4].textContent || '0').replace(/[^0-9]/g, ''), 10) || 0
          });
        }
      }
    }

    send({ok:true, votes: votes, stats: stats});
  } catch (e) { send({ok:false, error:String(e)}); }
})();`
}
