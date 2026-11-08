/**
 * 论坛类站点的「桌面版 + 自动填词」打开方式。
 *
 * 背景：绯月（bbs.kfpromax.com）按 User-Agent 返回两套完全不同的页面——
 * 移动 UA 拿到 `ys/mobilestyle201228.css` 的移动皮肤，桌面 UA 才拿到
 * `ys/style211012_7.css` 的完整版。移动皮肤顶栏只有「绯月首页 / 版块菜单」，
 * 既没有搜索框，也不消费 `?search=` 参数，所以从跨站搜索点进去会看到
 * 「移动端页面 + 关键词没填」。
 *
 * 这里做两件事：
 * 1. 用桌面 UA 打开（交给 @capgo/inappbrowser 的 headers['User-Agent']，
 *    原生层会把它设成 WebView 自己的 UA，站内翻页也保持桌面版）；
 * 2. 页面加载完成后注入脚本，找到站点搜索框填入关键词并提交。
 *    绯月的搜索要登录才可用，未登录时会跳到 login.php——注入脚本找不到搜索框
 *    就静默退出，等登录成功页面重新加载后会再次注入。
 */

import { Capacitor } from '@capacitor/core'
import { InAppBrowser, ToolBarType } from '@capgo/inappbrowser'
import { DESKTOP_USER_AGENT } from './linkOpener'

/** 同一时间只保留一个论坛 WebView，避免连续点击叠出多个 */
let active = null

/**
 * 注入脚本：找到搜索输入框 → 填入 → 提交。
 *
 * 候选选择器按「越具体越优先」排列，覆盖 PHPWind / Discuz 常见写法：
 * 绯月是 PHPWind 系（login.php 里的 pwuser/pwpwd、thread.php?fid=、read.php?tid=），
 * 搜索框通常是 `input[name=srchtxt]` 或 `input[name=keyword]`。
 */
function buildFillCode(keyword) {
  return `(function () {
  var KEYWORD = ${JSON.stringify(String(keyword))};
  /* 用 sessionStorage 记「这个词已经填过」：window 上的标记每次跳页都会丢，
     搜索提交后跳到结果页会再次注入、再次提交，变成反复搜索的死循环。 */
  var DONE_KEY = '__vndbestForumDone:' + KEYWORD;
  function alreadyDone() {
    try { return sessionStorage.getItem(DONE_KEY) === '1'; } catch (e) { return false; }
  }
  function markDone() {
    try { sessionStorage.setItem(DONE_KEY, '1'); } catch (e) {}
  }
  if (alreadyDone()) return;
  var RUN = window.__vndbestForumRun;
  if (RUN && RUN.kw === KEYWORD) return;
  var MY_RUN = { kw: KEYWORD, id: String(Math.random()) };
  window.__vndbestForumRun = MY_RUN;

  function stale() { return window.__vndbestForumRun !== MY_RUN; }
  function finish(ok) {
    if (window.__vndbestForumRun === MY_RUN) window.__vndbestForumRun = null;
    if (ok) markDone();
  }

  /* 登录页 / 注册页：没有搜索框，等登录后重新加载再注入 */
  var path = (location.pathname || '').toLowerCase();
  if (path.indexOf('login.php') !== -1 || path.indexOf('register.php') !== -1) {
    finish(false);
    return;
  }

  var SELECTORS = [
    'input[name="srchtxt"]',
    'input[name="keyword"]',
    'input[name="q"]',
    'input[name="search"]',
    'input[name="word"]',
    '#searchtext',
    '#srchtxt',
    'form[name="search"] input[type="text"]',
    'input[type="search"]'
  ];

  function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function findInput() {
    for (var i = 0; i < SELECTORS.length; i++) {
      var list = document.querySelectorAll(SELECTORS[i]);
      for (var j = 0; j < list.length; j++) {
        if (visible(list[j])) return list[j];
      }
    }
    return null;
  }

  /* React/Vue 受控组件要用原型 setter 写 value，否则框架会把它覆盖回去 */
  function setValue(el, value) {
    var proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement && window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement && window.HTMLInputElement.prototype;
    try {
      var desc = proto && Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, value);
      else el.value = value;
    } catch (e) { el.value = value; }
    try {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) {}
  }

  function submitForm(el) {
    var form = el.form || el.closest('form');
    if (form) {
      try {
        if (form.requestSubmit) { form.requestSubmit(); return true; } 
      } catch (e) {}
      try { form.submit(); return true; } catch (e) {}
    }
    /* 没有 form：回车交给站点自己的 keydown 处理 */
    ['keydown', 'keypress', 'keyup'].forEach(function (type) {
      try {
        var ev = new KeyboardEvent(type, {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
        });
        el.dispatchEvent(ev);
      } catch (e) {}
    });
    return false;
  }

  var attempts = 0;
  var MAX = 24;

  function tick() {
    if (stale()) return;
    var input = findInput();
    if (input) {
      setValue(input, KEYWORD);
      setTimeout(function () {
        if (stale()) return;
        submitForm(input);
        finish(true);
      }, 60);
      return;
    }
    if (++attempts >= MAX) {
      /* 页面里确实没有搜索框（比如未登录）：不标记完成，等下次页面加载再试 */
      finish(false);
      return;
    }
    setTimeout(tick, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tick);
  } else {
    tick();
  }
})();`
}

/**
 * 用桌面版 WebView 打开论坛页面并自动填入关键词。
 * 非原生平台返回 false，调用方回退成普通链接。
 *
 * @param {string} url 要打开的地址
 * @param {string} keyword 搜索关键词
 * @param {{title?:string}} [opts]
 * @returns {Promise<boolean>} 是否已接管
 */
export async function openForumSearch(url, keyword, opts = {}) {
  const href = String(url || '').trim()
  const kw = String(keyword || '').trim()
  if (!href || !kw) return false
  if (!Capacitor.isNativePlatform()) return false

  const { buildExternalButtonOption, noteBrowserUrl } = await import('./inAppBrowserTools')

  // 已经开着同一个论坛：复用，只换关键词重新注入
  if (active) {
    active.keyword = kw
    const targetId = active.webviewId
    try {
      // 先清掉「已填过」标记，否则同一 WebView 里换词不会重新注入；
      // 若关键词没变也清掉，这样用户重复点同一站点能重来一次
      await InAppBrowser.executeScript({
        code: 'try{Object.keys(sessionStorage).forEach(function(k){if(k.indexOf("__vndbestForumDone:")===0)sessionStorage.removeItem(k)})}catch(e){}',
        ...(targetId ? { id: targetId } : {})
      })
    } catch (e) {
      /* 忽略 */
    }
    try {
      await InAppBrowser.executeScript({
        code: buildFillCode(kw),
        ...(targetId ? { id: targetId } : {})
      })
    } catch (e) {
      console.error('[forumSearch] executeScript on active webview failed:', e)
    }
    return true
  }

  let webviewId = null
  let injectCount = 0
  const MAX_INJECT = 8
  let loadedHandle = null
  let closeHandle = null
  let disposed = false

  const state = { keyword: kw, webviewId: null }
  active = state

  const cleanup = async () => {
    if (disposed) return
    disposed = true
    if (active === state) active = null
    try { await loadedHandle?.remove() } catch (e) { /* 忽略 */ }
    try { await closeHandle?.remove() } catch (e) { /* 忽略 */ }
  }

  try {
    const res = await InAppBrowser.openWebView({
      url: href,
      title: opts.title || '',
      toolbarType: ToolBarType.NAVIGATION,
      activeNativeNavigationForWebview: true,
      isPresentAfterPageLoad: false,
      backgroundColor: 'white',
      // 桌面 UA：原生层看到 user-agent 头会直接 setUserAgentString，
      // 之后所有站内跳转都保持桌面版，不会翻一页又变回移动皮肤
      headers: { 'User-Agent': DESKTOP_USER_AGENT },
      ...buildExternalButtonOption()
    })
    webviewId = res?.id ?? null
    state.webviewId = webviewId
    noteBrowserUrl(webviewId, href)
  } catch (e) {
    console.error('[forumSearch] openWebView failed:', e)
    if (active === state) active = null
    return false
  }

  const inject = async () => {
    if (disposed || injectCount >= MAX_INJECT) return
    injectCount++
    try {
      await InAppBrowser.executeScript({
        code: buildFillCode(state.keyword),
        ...(webviewId ? { id: webviewId } : {})
      })
    } catch (e) {
      console.error('[forumSearch] executeScript failed:', e)
    }
  }

  loadedHandle = await InAppBrowser.addListener('browserPageLoaded', (event) => {
    if (webviewId && event?.id && event.id !== webviewId) return
    inject()
  })
  closeHandle = await InAppBrowser.addListener('closeEvent', (event) => {
    if (webviewId && event?.id && event.id !== webviewId) return
    cleanup()
  })

  // browserPageLoaded 偶发不派发（站内无刷新跳转），按梯度补注入兜底
  ;[2500, 6000, 12000, 20000].forEach((ms) => setTimeout(inject, ms))

  return true
}
