/**
 * TouchGal 外链过渡页（广告 / 5 秒等待页）自动跳过。
 *
 * 背景：在 TouchGal 里点外链，站点会先跳到 `/redirect?url=<目标>` 的等待页
 * （「即将离开本站…5 秒」），再跳真实地址。用户脚本 `VNDB跨站搜索.js` v2.7.4
 * 用 `initRedirectSkip()` 解决（另有独立的 `TouchGal 自动跳转` v2.2 脚本等价）。
 *
 * 内置浏览器原来只移植了该脚本的「搜索填入」分支，没有这段跳过逻辑，
 * 所以在 App 里点外链还是要等 5 秒。
 *
 * 与用户脚本的差别：用户脚本 `@run-at document-start`，在过渡页自己的文档里先跑，
 * 用户看不到等待页；内置浏览器只能等 `browserPageLoaded` 之后再 `executeScript`，
 * 那时过渡页已经画出来了。因此这里额外加了一个「点击拦截」：
 * 只要用户是在 TouchGal 页面里点外链，直接在**原页面**解析出真实地址并跳转，
 * 根本不会进入过渡页 —— 这也是绝大多数场景。已处在过渡页时，
 * `maybeAutoRedirect()` 会兜底立刻跳走（最多闪一下，而不是等 5 秒）。
 */

import { Capacitor } from '@capacitor/core'
import { getBrowserUrl } from './inAppBrowserTools'

/** TouchGal 站点（与用户脚本保持一致，含 www. 前缀） */
const TG_HOSTS = /(^|\.)touchgal\.(?:ink|top)$/i

export function isTouchGalUrl(url) {
  try {
    return TG_HOSTS.test(new URL(String(url || '')).hostname)
  } catch (e) {
    return false
  }
}

/** 过渡页特征：/redirect 一类路径（含 /zh-Hans/redirect 这种语言前缀），或带着 url= 目标参数 */
const REDIRECT_ROUTE = /^\/(?:[a-z]{2}(?:-[a-z]{2,4})?\/)?(?:redirect|go|jump|out|away|goto|link)(?:\/|$)/i

function looksLikeRedirectPage(url) {
  try {
    const u = new URL(String(url || ''))
    if (REDIRECT_ROUTE.test(u.pathname)) return true
    return u.searchParams.has('url') || u.searchParams.has('redirect')
  } catch (e) {
    return false
  }
}

/**
 * 注入到 TouchGal 页面里执行的脚本。
 *
 * 用 String.raw 保留正则里的反斜杠；脚本本身是 ES5（WebView 里直接 eval），
 * 不含反引号与 `${`，所以能安全地嵌在模板字符串里。
 * 幂等靠 `window.__vndbestTgRedirect`，同一页面重复注入只会跑一次。
 */
export function buildRedirectSkipCode() {
  return String.raw`(function () {
  if (window.__vndbestTgRedirect) return;
  window.__vndbestTgRedirect = true;

  var ROUTE = /^\/(?:[a-z]{2}(?:-[a-z]{2,4})?\/)?(?:redirect|go|jump|out|away|goto|link)(?:\/|$)/i;
  var KEYS = ['url', 'u', 'target', 'to', 'link', 'href', 'redirect',
    'redirect_url', 'redirecturl', 'out', 'go', 'jump', 'dest', 'destination'];
  var WAIT = /自动跳转|即将跳转|即将离开|正在跳转|跳转中|安全提示|继续访问|秒后/;
  var JUMP = /继续|前往|跳转|前往访问|点击这里|立即访问|continue|proceed/i;
  var MAX_TICKS = 160;

  function decodeLoose(value) {
    try { return decodeURIComponent(value); } catch (e) { return value; }
  }

  function safeTarget(raw) {
    var value = String(raw == null ? '' : raw).trim();
    if (!value) return '';
    var text = value;
    if (!/^https?:\/\//i.test(text)) text = decodeLoose(text).trim();
    if (!/^https?:\/\//i.test(text)) return '';
    try {
      var url = new URL(text);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
      if (ROUTE.test(url.pathname) && url.searchParams.has('url')) return '';
      return url.href;
    } catch (e) {
      return '';
    }
  }

  function scanParams(params) {
    for (var i = 0; i < KEYS.length; i++) {
      var target = safeTarget(params.get(KEYS[i]));
      if (target) return target;
    }
    return '';
  }

  function paramTarget() {
    var target = '';
    try { target = scanParams(new URLSearchParams(location.search)); } catch (e) {}
    if (target) return target;
    try {
      if (location.hash.length > 1) {
        var hash = location.hash.slice(1);
        var index = hash.indexOf('?');
        target = scanParams(new URLSearchParams(index === -1 ? hash : hash.slice(index + 1)));
      }
    } catch (e) {}
    return target;
  }

  function metaTarget() {
    var metas = document.querySelectorAll('meta[http-equiv]');
    for (var i = 0; i < metas.length; i++) {
      if (String(metas[i].getAttribute('http-equiv')).toLowerCase() !== 'refresh') continue;
      var content = metas[i].getAttribute('content') || '';
      var index = content.toLowerCase().indexOf('url=');
      if (index === -1) continue;
      var target = safeTarget(content.slice(index + 4).replace(/^['"]|['"]$/g, ''));
      if (target) return target;
    }
    return '';
  }

  function anchorTarget() {
    var links = document.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href') || '';
      if (!/^https?:\/\//i.test(href)) continue;
      if (!JUMP.test(links[i].textContent || '')) continue;
      var target = safeTarget(href);
      if (target) return target;
    }
    return '';
  }

  /* 轮询里每 50ms 读一次 body 全文太重，加一层 800ms 缓存（对应用户脚本 v2.7.4）。
     长页面（>6000 字符）若前 4000 字符没有「秒后」就基本不是等待页，直接短路。 */
  var waitCache = { at: 0, value: false };

  function hasWaitMarker() {
    var now = Date.now();
    if (now - waitCache.at < 800) return waitCache.value;
    var body = document.body;
    if (!body) return false;
    var text = String(body.textContent || '');
    var head = text.slice(0, 4000);
    var value = WAIT.test(head);
    if (!value && text.length > 6000) value = false;
    waitCache.at = now;
    waitCache.value = value;
    return value;
  }

  function isRedirectPage() {
    if (ROUTE.test(location.pathname)) return true;
    return !!paramTarget() && hasWaitMarker();
  }

  function redirectTarget() {
    return paramTarget() || metaTarget() || anchorTarget();
  }

  var lastHref = '';
  var locked = false;

  function jump(target) {
    if (!target) return false;
    if (target === lastHref) return false;
    lastHref = target;
    locked = true;
    try { location.replace(target); } catch (e) { location.href = target; }
    return true;
  }

  function maybeAutoRedirect() {
    if (locked) return;
    if (!isRedirectPage()) return;
    jump(redirectTarget());
  }

  /* 点击拦截：在 TouchGal 页面里点一条外链时，先把 href 解析成真实地址，
     能解析出来就直接跳真实地址，不让 WebView 载入过渡页。 */
  function interceptedTarget(href) {
    var url;
    try { url = new URL(href, location.href); } catch (e) { return ''; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    var sameOrigin = url.hostname === location.hostname;
    var onRoute = ROUTE.test(url.pathname);
    if (!sameOrigin && !onRoute) return '';
    return scanParams(url.searchParams);
  }

  /* 直接把中转链接的 href 改写成真实地址（对应用户脚本 v2.7.4 的 rewriteRedirectLinks）。
     好处：即使点击被站点自己的 JS 拦走、或者走了键盘/长按打开，
     href 本身也已经是真实地址，不会再落进过渡页。 */
  var LINK_SEL = 'a[href*="redirect"],a[href*="url="],a[href*="target="],a[href*="goto="],a[href*="jump="]';

  function rewriteRedirectLinks(root) {
    var scope = (root && root.querySelectorAll) ? root : document;
    var links;
    try { links = scope.querySelectorAll(LINK_SEL); } catch (e) { return; }
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var direct = a.getAttribute('data-vndbest-direct') || '';
      if (!direct) {
        try { direct = interceptedTarget(a.getAttribute('href')); } catch (e) { continue; }
      }
      if (!direct) continue;
      if (a.getAttribute('href') !== direct) a.setAttribute('href', direct);
      a.setAttribute('data-vndbest-direct', direct);
    }
  }

  function watchRedirectLinks() {
    var start = function () {
      rewriteRedirectLinks(document);
      var pending = [];
      var queued = false;
      var flush = function () {
        queued = false;
        var batch = pending;
        pending = [];
        for (var i = 0; i < batch.length; i++) {
          var el = batch[i];
          if (!el.isConnected || !el.querySelectorAll) continue;
          rewriteRedirectLinks(el);
        }
        rewriteRedirectLinks(document);
      };
      var observer = new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          var added = records[i].addedNodes;
          for (var k = 0; k < added.length; k++) {
            if (added[k].nodeType === 1) pending.push(added[k]);
          }
        }
        if (queued || !pending.length) return;
        queued = true;
        setTimeout(flush, 120);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    };
    if (document.documentElement) start();
    else document.addEventListener('DOMContentLoaded', start);
  }

  function onDocumentClick(event) {
    if (event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var node = event.target;
    var anchor = null;
    while (node && node.nodeType === 1) {
      if (node.tagName === 'A' && node.getAttribute('href')) { anchor = node; break; }
      node = node.parentNode;
    }
    if (!anchor) return;
    var targetAttr = anchor.getAttribute('target');
    if (targetAttr && targetAttr !== '_self') return;
    var target = interceptedTarget(anchor.getAttribute('href'));
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    jump(target);
  }

  function watchSpaRedirect() {
    if (history.__vndbestTgPatched) return;
    history.__vndbestTgPatched = true;
    ['pushState', 'replaceState'].forEach(function (method) {
      var original = history[method];
      if (typeof original !== 'function') return;
      history[method] = function () {
        var result = original.apply(this, arguments);
        setTimeout(maybeAutoRedirect, 50);
        return result;
      };
    });
  }

  function init() {
    watchSpaRedirect();
    watchRedirectLinks();
    maybeAutoRedirect();
    var ticks = 0;
    var timer = setInterval(function () {
      ticks += 1;
      maybeAutoRedirect();
      if (locked || ticks >= MAX_TICKS) clearInterval(timer);
    }, 50);
    window.addEventListener('popstate', function () { setTimeout(maybeAutoRedirect, 80); });
    window.addEventListener('hashchange', function () { setTimeout(maybeAutoRedirect, 80); });
    document.addEventListener('click', onDocumentClick, true);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', maybeAutoRedirect);
    }
  }

  init();
})();`
}

/** 已经注入过（避免同一次导航注入两遍；脚本自身也幂等） */
const injectedAt = new Map()
/** 300ms 内对同一个 WebView 只注入一次 */
const INJECT_GAP = 300

async function inject(webviewId) {
  const now = Date.now()
  const last = injectedAt.get(webviewId) || 0
  if (now - last < INJECT_GAP) return
  injectedAt.set(webviewId, now)
  try {
    const { InAppBrowser } = await import('@capgo/inappbrowser')
    await InAppBrowser.executeScript({ code: buildRedirectSkipCode(), id: webviewId })
  } catch (e) {
    // 页面还在加载 / WebView 已关闭都会走到这里，不打扰用户
    console.warn('[redirectSkip] inject failed:', e?.message || e)
  }
}

let installed = false

/**
 * 挂载「内置浏览器加载完 TouchGal 页面 → 注入跳过逻辑」的监听。
 * 在 main.js 调用一次即可，重复调用会被忽略。
 *
 * `browserPageLoaded` 的负载只有 id（不带 url），地址取自 inAppBrowserTools
 * 里 `urlChangeEvent` 记录的映射；只有 touchgal.ink / touchgal.top 才注入。
 */
export function installRedirectSkipWatcher() {
  if (installed) return
  if (!Capacitor.isNativePlatform()) return
  installed = true

  import('@capgo/inappbrowser')
    .then(({ InAppBrowser }) => {
      InAppBrowser.addListener('browserPageLoaded', (event) => {
        const id = event?.id
        if (!id) return
        const url = getBrowserUrl(id)
        if (!url || !isTouchGalUrl(url)) return
        inject(id)
      })

      // 已经落到过渡页时，urlChangeEvent 往往早于 browserPageLoaded，
      // 抢在这个时机再注入一次，能把「闪一下等待页」压到最小。
      InAppBrowser.addListener('urlChangeEvent', (event) => {
        const id = event?.id
        const url = event?.url
        if (!id || !url) return
        if (!isTouchGalUrl(url) || !looksLikeRedirectPage(url)) return
        inject(id)
      })

      InAppBrowser.addListener('closeEvent', (event) => {
        const id = event?.id
        if (id) injectedAt.delete(id)
      })
    })
    .catch((e) => {
      console.warn('[redirectSkip] listener setup failed:', e?.message || e)
      installed = false
    })
}
