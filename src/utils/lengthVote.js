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

const STORAGE_KEY = 'vndb_length_votes'

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
