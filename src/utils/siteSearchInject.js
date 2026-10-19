/**
 * 在内置浏览器里给「站点不消费搜索参数」的跨站搜索站点补一次自动搜索。
 *
 * 背景（对应用户脚本 `VNDB跨站搜索.js` v2.7.4 新增的 searchgal.top 分支）：
 * SearchGal 会读 URL 里的 `?s=` 并把关键词填进搜索框，但**不会自动发起搜索**，
 * 页面停在空白结果。用户脚本靠注入脚本补上「填入 + 回车 + 兜底提交表单」。
 *
 * 内置浏览器跳到系统浏览器时没法注入，所以这里与 TouchGal 同样处理：
 * 页面加载完成后 executeScript 注入等价逻辑。
 *
 * 稻荷（inarigal.com）不需要这段：站点的 `?search=` 是服务端渲染，
 * 打开就是结果页（v2.7.4 也是直接拼 URL，没有注入）。
 */

import { Capacitor } from '@capacitor/core'
import { getBrowserUrl } from './inAppBrowserTools'

/** 需要自动提交搜索的站点（hostname 去 www. 后比较） */
const SITE_HOSTS = ['searchgal.top']

export function isSearchInjectHost(url) {
  try {
    const host = new URL(String(url || '')).hostname.replace(/^www\./, '').toLowerCase()
    return SITE_HOSTS.includes(host)
  } catch (e) {
    return false
  }
}

/**
 * 注入脚本（ES5，不含反引号与 `${`，可安全嵌进模板字符串）。
 * 幂等靠 `window.__vndbestSiteSearch`，同一页面同一关键词只跑一次。
 */
export function buildSearchInjectCode() {
  return String.raw`(function () {
  if (window.__vndbestSiteSearch) return;
  window.__vndbestSiteSearch = true;

  var KEY_PARAMS = ['s', 'q', 'keyword', 'search', 'wd'];
  var INPUT_SEL = 'input[type="search"],input[role="combobox"],input[name="s"],input[name="q"],' +
    'input[name="keyword"],input[name="search"],input[placeholder*="搜索"],' +
    'input[placeholder*="Search"],input[placeholder*="search"]';
  var MAX_TICKS = 50;

  var params;
  try { params = new URLSearchParams(location.search); } catch (e) { return; }
  var keyword = '';
  for (var i = 0; i < KEY_PARAMS.length; i++) {
    var value = params.get(KEY_PARAMS[i]);
    if (value) { keyword = value; break; }
  }
  if (!keyword) return;

  var done = false;

  function visible(el) {
    if (!el || !el.getClientRects) return false;
    return el.getClientRects().length > 0;
  }

  function pickInput() {
    var list = document.querySelectorAll(INPUT_SEL);
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (!visible(el) || el.disabled || el.readOnly) continue;
      return el;
    }
    return null;
  }

  function setValue(input, value) {
    var desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    if (desc && desc.set) desc.set.call(input, value);
    else input.value = value;
    var sent = false;
    try {
      var InputEv = window.InputEvent || Event;
      input.dispatchEvent(new InputEv('input', {
        bubbles: true, cancelable: false, data: value, inputType: 'insertText'
      }));
      sent = true;
    } catch (e) {}
    if (!sent) input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function pressEnter(input) {
    var init = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    input.dispatchEvent(new KeyboardEvent('keydown', init));
    input.dispatchEvent(new KeyboardEvent('keypress', init));
    input.dispatchEvent(new KeyboardEvent('keyup', init));
  }

  function submitForm(input) {
    var form = input.form || input.closest('form');
    if (form) {
      if (typeof form.requestSubmit === 'function') {
        try { form.requestSubmit(); return true; } catch (e) {}
      }
      try { form.submit(); return true; } catch (e) {}
    }
    var scope = form || document;
    var btn = scope.querySelector('button[type="submit"],button[aria-label*="搜索"],button[aria-label*="Search"]');
    if (btn) { try { btn.click(); return true; } catch (e) {} }
    return false;
  }

  function attempt() {
    if (done) return true;
    var input = pickInput();
    if (!input) return false;
    if (input.value !== keyword) {
      try { input.focus(); } catch (e) {}
      setValue(input, keyword);
    }
    if (input.value !== keyword) return false;
    var startHref = location.href;
    pressEnter(input);
    done = true;
    setTimeout(function () {
      if (location.href === startHref) submitForm(input);
    }, 500);
    return true;
  }

  if (attempt()) return;
  var ticks = 0;
  var timer = setInterval(function () {
    ticks += 1;
    if (attempt() || ticks >= MAX_TICKS) clearInterval(timer);
  }, 200);
  document.addEventListener('DOMContentLoaded', attempt);
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
    await InAppBrowser.executeScript({ code: buildSearchInjectCode(), id: webviewId })
  } catch (e) {
    // 页面还在加载 / WebView 已关闭都会走到这里，不打扰用户
    console.warn('[searchInject] inject failed:', e?.message || e)
  }
}

let installed = false

/**
 * 挂载「内置浏览器加载完 SearchGal 页面 → 注入自动搜索」的监听。
 * 在 main.js 调用一次即可，重复调用会被忽略。
 */
export function installSiteSearchWatcher() {
  if (installed) return
  if (!Capacitor.isNativePlatform()) return
  installed = true

  import('@capgo/inappbrowser')
    .then(({ InAppBrowser }) => {
      InAppBrowser.addListener('browserPageLoaded', (event) => {
        const id = event?.id
        if (!id) return
        const url = getBrowserUrl(id)
        if (!url || !isSearchInjectHost(url)) return
        inject(id)
      })

      InAppBrowser.addListener('urlChangeEvent', (event) => {
        const id = event?.id
        const url = event?.url
        if (!id || !url) return
        if (!isSearchInjectHost(url)) return
        inject(id)
      })

      InAppBrowser.addListener('closeEvent', (event) => {
        const id = event?.id
        if (id) injectedAt.delete(id)
      })
    })
    .catch((e) => {
      console.warn('[searchInject] listener setup failed:', e?.message || e)
      installed = false
    })
}
