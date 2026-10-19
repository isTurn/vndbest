/**
 * TouchGal 站内搜索：内嵌 WebView + 注入脚本
 *
 * 背景：TouchGal 的搜索框是 React 受控组件，站点本身不消费 `?tgq=` 这类深链参数
 * （原用户脚本 VNDB跨站搜索.js 是在 TouchGal 页面内注入 JS 才实现「填入 + 回车」）。
 * 跳到系统浏览器后无法注入脚本，所以这里改用 @capgo/inappbrowser 的内嵌 WebView，
 * 页面加载完成后通过 executeScript 注入等价逻辑。
 *
 * 注入脚本与用户脚本 v2.5.6 的 TouchGal 分支保持一致：
 * tgOnInputReady（等 React hydrate）→ tgFillAndSubmit（填入 + 校验 + 回车 + 观察）
 * → 失败重试 → tgApiFallback（调站内搜索 API 渲染浮层）。
 */

import { Capacitor } from '@capacitor/core'
import { InAppBrowser, ToolBarType } from '@capgo/inappbrowser'

/** TouchGal 搜索页（与用户脚本保持一致） */
const TG_SEARCH_URL = 'https://www.touchgal.ink/search'

/** 当前打开的 TouchGal WebView（同一时间只允许一个，避免叠加） */
let active = null

/** 注入到 TouchGal 页面里执行的脚本（对应用户脚本 511-762 行的 TouchGal 分支） */
function buildInjectCode(keyword) {
  return `(function () {
  var KEYWORD = ${JSON.stringify(String(keyword))};
  var ORIGIN = 'https://www.touchgal.ink';
  var SEARCH_PATH = '/search';
  var INPUT_SEL = 'input[role="combobox"][aria-label="搜索 Galgame"]';
  var REACT_READY_TIMEOUT = 4000;
  var INPUT_SETTLE_MS = 120;
  /* 按回车后要留够时间让 React 把请求发出去并渲染结果卡（含图片），
     等太短会误判失败并重试，反而把上一次搜索打断 */
  var SEARCH_WATCH_MS = 1600;
  /* 输入框最多重试 2 次：重试就是重设 value + 再按回车，会取消上一次搜索 */
  var MAX_ATTEMPTS = 2;
  /* 预取：脚本一注入就并行查站内搜索 API，比等 React hydrate 再输入快得多 */
  var PREFETCH_PANEL_ID = 'tg-prefetch-panel';

  /* 幂等守卫：同一个关键词搜索成功后不再重复。
     注意不能用一次性全局标记 —— 首次注入可能落在 Cloudflare 挑战页上，
     挑战通过后页面会重新加载并再次注入，那时必须允许继续执行。
     运行标记按「关键词 + 运行令牌」记，换关键词时旧一轮的定时器会被判定过期，
     不会再去打断新搜索。 */
  var DONE_MAP = window.__vndbestTgDone || (window.__vndbestTgDone = {});
  if (DONE_MAP[KEYWORD]) return;
  var PREV_RUN = window.__vndbestTgRun;
  if (PREV_RUN && PREV_RUN.kw === KEYWORD) return;
  var MY_RUN = { kw: KEYWORD, id: String(Math.random()) };
  window.__vndbestTgRun = MY_RUN;

  /* Cloudflare 人机验证页：不设任何标记直接退出，等验证通过后重新注入 */
  try {
    var _t = (document.title || '').toLowerCase();
    var _b = document.body ? (document.body.textContent || '') : '';
    if (_t.indexOf('just a moment') !== -1 || _t.indexOf('attention required') !== -1 ||
        _b.indexOf('Checking your browser') !== -1 || _b.indexOf('Verifying you are human') !== -1 ||
        document.querySelector('#challenge-form, #cf-challenge-running, .cf-browser-verification')) {
      window.__vndbestTgRun = PREV_RUN || null;
      return;
    }
  } catch (e) {}

  /* 本轮已被更新的搜索取代 */
  function stale() {
    return window.__vndbestTgRun !== MY_RUN;
  }

  function finish(ok) {
    if (window.__vndbestTgRun === MY_RUN) window.__vndbestTgRun = null;
    if (ok) DONE_MAP[KEYWORD] = true;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toast(msg, duration) {
    try {
      var el = document.createElement('div');
      el.setAttribute('style', [
        'position:fixed', 'left:50%', 'top:14px', 'transform:translateX(-50%)',
        'z-index:2147483647', 'max-width:90vw',
        'background:rgba(31,29,38,.94)', 'color:#e8e6ef',
        'border:1px solid #3a3650', 'border-radius:8px',
        'padding:8px 14px', 'font:13px/1.5 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif',
        'box-shadow:0 6px 24px rgba(0,0,0,.35)', 'word-break:break-all',
        'opacity:0', 'transition:opacity .25s'
      ].join(';'));
      el.textContent = msg;
      document.body.appendChild(el);
      requestAnimationFrame(function () { el.style.opacity = '1'; });
      setTimeout(function () {
        el.style.opacity = '0';
        setTimeout(function () { el.remove(); }, 300);
      }, duration || 4000);
    } catch (e) {}
  }

  /* 搜索是否已真正触发：出现关键词 chip，或收到了 /search 请求 */
  var started = { ok: false };
  try {
    if (typeof PerformanceObserver !== 'undefined') {
      var po = new PerformanceObserver(function (list) {
        var entries = list.getEntries();
        for (var i = 0; i < entries.length; i++) {
          var name = entries[i].name || '';
          if (name.indexOf('/search') !== -1 && name.indexOf('_rsc') === -1 &&
              (entries[i].initiatorType === 'fetch' || entries[i].initiatorType === 'xmlhttprequest')) {
            started.ok = true;
          }
        }
      });
      po.observe({ type: 'resource', buffered: false });
    }
  } catch (e) {}

  function hasChip() {
    return !!document.querySelector('[aria-label="close chip"]');
  }

  /* 结果卡里的封面图有时不加载：多为上一次搜索被打断、或 next/image 懒加载
     没被触发。这里把懒加载改成 eager，并对加载失败的图做一次带参数的重新请求。 */
  function fixImages() {
    try {
      var lazy = document.querySelectorAll('img[loading="lazy"]');
      for (var i = 0; i < lazy.length; i++) lazy[i].setAttribute('loading', 'eager');
      var all = document.querySelectorAll('img');
      for (var j = 0; j < all.length; j++) {
        (function (img) {
          if (img.naturalWidth > 0) return;
          var src = img.getAttribute('src');
          if (!src || src.indexOf('data:') === 0) return;
          function retry() {
            if (img.getAttribute('data-tg-retried')) return;
            img.setAttribute('data-tg-retried', '1');
            var sep = src.indexOf('?') === -1 ? '?' : '&';
            img.setAttribute('src', src + sep + '_tg=' + Date.now());
          }
          img.addEventListener('error', retry);
          /* 注入时已经加载失败（complete 但无尺寸）的图，error 事件不会再来，直接重试 */
          if (img.complete) retry();
        })(all[j]);
      }
    } catch (e) {}
  }

  function hideFallback() {
    var old = document.getElementById('tg-fallback-panel');
    if (old) old.remove();
  }

  /* 预取：脚本一注入就并行请求站内搜索 API，不必等 React hydrate 完成 */
  var PREFETCH = { started: false, done: false, games: null, error: false };
  var panelWanted = false;

  function searchBody() {
    return {
      queryString: JSON.stringify([{ type: 'keyword', mode: 'include', name: KEYWORD }]),
      limit: 24,
      searchOption: { searchInIntroduction: false, searchInAlias: false, searchInTag: false },
      page: 1,
      selectedType: 'all',
      selectedLanguage: 'all',
      selectedPlatform: 'all',
      sortField: 'resource_update_time',
      sortOrder: 'desc',
      selectedYears: ['all'],
      selectedMonths: ['all'],
      minRatingCount: 0
    };
  }

  function prefetch() {
    if (PREFETCH.started) return;
    PREFETCH.started = true;
    fetch(ORIGIN + SEARCH_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchBody()),
      credentials: 'include'
    }).then(function (res) {
      return res.json();
    }).then(function (data) {
      PREFETCH.games = (data && Array.isArray(data.galgames)) ? data.galgames : [];
      PREFETCH.done = true;
      if (panelWanted) showPrefetched();
    }).catch(function () {
      PREFETCH.error = true;
      PREFETCH.done = true;
      if (panelWanted) showPrefetched();
    });
  }

  /* 用预取结果立刻铺浮层；还没回来就先记下意图，回来后自动铺 */
  function showPrefetched() {
    if (stale()) return;
    if (started.ok || hasChip()) { hideFallback(); return; }
    if (!PREFETCH.done) {
      panelWanted = true;
      return;
    }
    if (PREFETCH.error) {
      hideFallback();
      toast('自动搜索失败，请手动输入并搜索：' + KEYWORD, 9000);
      finish(false);
      return;
    }
    renderFallback(PREFETCH.games || []);
  }

  /* React 受控输入框：必须用原型上的原生 value setter 赋值，再派发 input 事件 */
  function setInputValue(input, value) {
    var desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    desc.set.call(input, value);
    var Ev = window.InputEvent || Event;
    input.dispatchEvent(new Ev('input', { bubbles: true, cancelable: false, data: value, inputType: 'insertText' }));
  }

  function pressEnter(input) {
    var init = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    input.dispatchEvent(new KeyboardEvent('keydown', init));
    input.dispatchEvent(new KeyboardEvent('keyup', init));
  }

  function fillAndSubmit(input, attempt) {
    attempt = attempt || 1;
    input.focus();
    setInputValue(input, KEYWORD);
    /* 等一拍让 React 状态更新，再校验值是否保住（hydrate 竞态下会被重置）。
       只有「值没保住」才重试赋值；值保住按过回车之后绝不再重试 ——
       重试等于重设 value + 再按一次回车，会把上一次还在跑的搜索取消掉，
       表现就是「结果出得慢 / 图片不加载 / 界面卡一下」。 */
    setTimeout(function () {
      if (stale()) return;
      if (input.value !== KEYWORD) {
        if (attempt < MAX_ATTEMPTS) return fillAndSubmit(input, attempt + 1);
        return apiFallback();
      }
      pressEnter(input);
      setTimeout(function () {
        if (stale()) return;
        if (started.ok || hasChip()) {
          hideFallback();
          toast('已自动搜索：' + KEYWORD);
          finish(true);
          return;
        }
        /* 回车已发出，就不再打断它：直接用预取结果补位，让用户马上看到东西 */
        apiFallback();
      }, SEARCH_WATCH_MS);
    }, INPUT_SETTLE_MS);
  }

  /* 兜底：用预取结果直接铺浮层（预取没起来就现查一次） */
  function apiFallback() {
    if (stale()) return;
    if (started.ok || hasChip()) {
      hideFallback();
      finish(true);
      return;
    }
    toast('自动操作搜索框失败，正在直接查询…');
    if (PREFETCH.done) {
      showPrefetched();
      return;
    }
    panelWanted = true;
    prefetch();
  }

  function renderFallback(games) {
    var old = document.getElementById('tg-fallback-panel');
    if (old) old.remove();

    var panel = document.createElement('div');
    panel.id = 'tg-fallback-panel';
    panel.setAttribute('style', [
      'position:fixed', 'left:50%', 'top:16px', 'transform:translateX(-50%)',
      'z-index:2147483647', 'width:min(560px,92vw)', 'max-height:70vh', 'overflow:auto',
      'background:#1f1d26', 'color:#e8e6ef', 'border:1px solid #3a3650', 'border-radius:10px',
      'box-shadow:0 6px 24px rgba(0,0,0,.35)',
      'font:13px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif'
    ].join(';'));

    var html = '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #3a3650;">' +
      '<span style="font-weight:600;">“' + esc(KEYWORD) + '” 的搜索结果（' + games.length + '）</span>' +
      '<button id="tg-fallback-close" style="margin-left:auto;background:none;border:none;color:#b9b4cc;cursor:pointer;font-size:15px;">×</button></div>';
    if (!games.length) {
      html += '<div style="padding:14px 12px;color:#9a94b8;">没有找到相关游戏，可换个标题关键词试试。</div>';
    } else {
      html += '<ul style="list-style:none;margin:0;padding:6px;">' + games.map(function (g) {
        /* 带上封面图：优先用站内 API 返回的 cover/banner，失败就自然留白 */
        var cover = g.cover || g.banner || g.image || '';
        if (cover && cover.indexOf('//') === 0) cover = 'https:' + cover;
        var thumb = cover
          ? '<img src="' + esc(cover) + '" alt="" loading="eager" referrerpolicy="no-referrer" ' +
            'style="width:44px;height:60px;object-fit:cover;border-radius:5px;flex:none;background:#2b2836;">'
          : '';
        return '<li style="margin:2px 0;"><a href="/' + encodeURIComponent(g.uniqueId) + '" rel="noopener" ' +
          'style="display:flex;align-items:center;gap:9px;padding:6px 8px;border-radius:6px;color:#cfcae4;text-decoration:none;">' +
          thumb + '<span>' + esc(g.name || g.uniqueId) + '</span></a></li>';
      }).join('') + '</ul>';
    }
    panel.innerHTML = html;
    panel.querySelector('#tg-fallback-close').addEventListener('click', function () { panel.remove(); });
    document.body.appendChild(panel);
  }

  /* 等搜索框出现，并等 React 真正挂载（DOM 节点出现 __react* 内部键）后再动手 */
  function onInputReady(input, cb) {
    function hasReact() {
      try {
        return Object.keys(input).some(function (k) { return k.indexOf('__react') === 0; });
      } catch (e) { return false; }
    }
    var t0 = Date.now();
    (function poll() {
      if (hasReact()) {
        setTimeout(cb, 200);
        return;
      }
      if (Date.now() - t0 >= REACT_READY_TIMEOUT) {
        setTimeout(cb, 250);
        return;
      }
      setTimeout(poll, 80);
    })();
  }

  /* 先发预取请求，再去找搜索框（并行，谁先好谁先用） */
  prefetch();

  /* 立刻给个反馈：预取结果回来之前先显示「搜索中」，避免用户以为没反应 */
  (function showPending() {
    try {
      hideFallback();
      var p = document.createElement('div');
      p.id = 'tg-fallback-panel';
      p.setAttribute('style', [
        'position:fixed', 'left:50%', 'top:16px', 'transform:translateX(-50%)',
        'z-index:2147483647', 'padding:10px 16px', 'border-radius:10px',
        /* 只是提示，不拦截点击，否则会盖住页面顶部 */
        'pointer-events:none',
        'background:#1f1d26', 'color:#e8e6ef', 'border:1px solid #3a3650',
        'box-shadow:0 6px 24px rgba(0,0,0,.35)', 'font:13px/1.6 -apple-system,"Segoe UI",sans-serif'
      ].join(';'));
      p.textContent = '正在搜索“' + KEYWORD + '”…';
      document.body.appendChild(p);
    } catch (e) {}
  })();

  var existing = document.querySelector(INPUT_SEL);
  if (existing) {
    onInputReady(existing, function () { fillAndSubmit(existing, 1); });
  } else {
    var settled = false;
    var observer = new MutationObserver(function () {
      var input = document.querySelector(INPUT_SEL);
      if (input && !settled) {
        settled = true;
        observer.disconnect();
        onInputReady(input, function () { fillAndSubmit(input, 1); });
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    setTimeout(function () {
      if (settled) return;
      settled = true;
      observer.disconnect();
      apiFallback();
    }, 12000);
  }

  /* 硬超时：无论输入路径卡在哪，预取结果先铺出来，用户不用干等 */
  setTimeout(function () {
    if (stale()) return;
    if (started.ok || hasChip()) {
      finish(true);
      fixImages();
      return;
    }
    showPrefetched();
  }, 2600);

  /* 结果卡渲染完成后修一次图片（懒加载改 eager + 失败重试），
     之后每 1.2s 复查一次，最多 12 次，覆盖图片晚到的情况 */
  var imgTicks = 0;
  var imgTimer = setInterval(function () {
    if (stale()) { clearInterval(imgTimer); return; }
    fixImages();
    if (++imgTicks >= 12) clearInterval(imgTimer);
  }, 1200);
})();`
}

/**
 * 用内嵌 WebView 打开 TouchGal 并自动填入关键词搜索。
 * 非原生平台（浏览器/开发环境）返回 false，调用方应回退为普通链接。
 *
 * @param {string} keyword 搜索关键词
 * @returns {Promise<boolean>} 是否已由内嵌浏览器接管
 */
export async function openTouchGalSearch(keyword) {
  const kw = String(keyword || '').trim()
  if (!kw) return false
  if (!Capacitor.isNativePlatform()) return false

  /* 同一时间只允许一个 TouchGal WebView：连续点击时复用已打开的那个，
     只换关键词重新注入，避免叠出多个 WebView 让界面卡顿 */
  if (active) {
    active.keyword = kw
    try {
      await InAppBrowser.executeScript({
        code: buildInjectCode(kw),
        ...(active.webviewId ? { id: active.webviewId } : {})
      })
    } catch (e) {
      console.error('[touchgal] executeScript on active webview failed:', e)
    }
    return true
  }

  let webviewId = null
  let injectCount = 0
  // Cloudflare 挑战可能多次重载页面，注入次数留足余量
  const MAX_INJECT = 8
  let loadedHandle = null
  let closeHandle = null
  let disposed = false

  const state = { keyword: kw, webviewId: null, disposed: false }
  active = state

  const cleanup = async () => {
    if (disposed) return
    disposed = true
    state.disposed = true
    if (active === state) active = null
    try { await loadedHandle?.remove() } catch (e) { /* 忽略 */ }
    try { await closeHandle?.remove() } catch (e) { /* 忽略 */ }
  }

  try {
    // 工具栏上的「用外部浏览器打开」按钮：TouchGal 页面经常有 Cloudflare 挑战、
    // 资源加载不全，用户需要一个「页面能看但功能不对」时的出口。
    const { buildExternalButtonOption, noteBrowserUrl } = await import('./inAppBrowserTools')
    const res = await InAppBrowser.openWebView({
      url: TG_SEARCH_URL,
      title: 'TouchGal',
      toolbarType: ToolBarType.NAVIGATION,
      activeNativeNavigationForWebview: true,
      // 立即弹出 WebView（页面在里面加载），否则要等整页加载完才出现，
      // 用户会以为点了没反应。注入仍然等 browserPageLoaded 之后再做。
      isPresentAfterPageLoad: false,
      backgroundColor: 'white',
      ...buildExternalButtonOption()
    })
    webviewId = res?.id ?? null
    state.webviewId = webviewId
    // 按钮点击事件不带 url，先把入口地址记下来
    noteBrowserUrl(webviewId, TG_SEARCH_URL)
  } catch (e) {
    console.error('[touchgal] openWebView failed:', e)
    if (active === state) active = null
    return false
  }

  const inject = async () => {
    if (disposed || injectCount >= MAX_INJECT) return
    injectCount++
    try {
      await InAppBrowser.executeScript({
        code: buildInjectCode(state.keyword),
        ...(webviewId ? { id: webviewId } : {})
      })
    } catch (e) {
      console.error('[touchgal] executeScript failed:', e)
    }
  }

  // 页面每次加载完成都尝试注入（Cloudflare 挑战页通过后会再触发一次）
  loadedHandle = await InAppBrowser.addListener('browserPageLoaded', (event) => {
    if (webviewId && event?.id && event.id !== webviewId) return
    inject()
  })
  closeHandle = await InAppBrowser.addListener('closeEvent', (event) => {
    if (webviewId && event?.id && event.id !== webviewId) return
    cleanup()
  })

  // 兜底：browserPageLoaded 未派发时按梯度延迟补注入几次
  // （Cloudflare 挑战页会先返回一次「Just a moment」，注入脚本自身会跳过，等真页面再执行）
  ;[2500, 6000, 12000, 20000].forEach((ms) => setTimeout(inject, ms))

  return true
}
