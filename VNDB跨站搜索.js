// ==UserScript==
// @name         VNDB跨站搜索
// @namespace    http://tampermonkey.net/
// @version      2.6.1
// @description  VNDB跨站搜索，可自选标题或id；TouchGal 外链跳转自动跳过等待
// @author       Hatsube
// @match        https://vndb.org/*
// @match        https://www.vndb.org/*
// @match        https://touchgal.ink/*
// @match        https://www.touchgal.ink/*
// @match        https://touchgal.top/*
// @match        https://www.touchgal.top/*
// @match        https://seiya-saiga.com/*
// @match        https://www.seiya-saiga.com/*
// @match        https://bbs.kfpromax.com/*
// @grant        none
// @run-at       document-start
// @noframes
// @license      MIT
// @downloadURL  https://update.sleazyfork.org/scripts/600569/VNDB%E8%B7%A8%E7%AB%99%E6%90%9C%E7%B4%A2.user.js
// @updateURL    https://update.sleazyfork.org/scripts/600569/VNDB%E8%B7%A8%E7%AB%99%E6%90%9C%E7%B4%A2.meta.js
// ==/UserScript==

(function () {
    'use strict';
    const PANEL_ID = 'vndb-jump-panel';
    const STYLE_ID = 'vndb-jump-style';
    const TOUCHGAL_ORIGIN = 'https://www.touchgal.ink';
    const TG_QUERY_PARAM = 'tgq';
    const MODE_VN = 'vn';
    const MODE_TITLE = 'title';
    const host = location.hostname.replace(/^www\./, '');
    const path = location.pathname;
    function enc(value) {
        return encodeURIComponent(String(value == null ? '' : value));
    }
    function esc(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    const WP_SPACES = /[\s\u00a0\u1680\u2000-\u200b\u202f\u205f\u3000]+/g;
    const WP_EDGE = /^[\-–—−－~～〜:：;；,，、。．.!！?？*＊"'“”‘’「」『』【】()（）〈〉《》…·_+&\/／\\|｜]+|[\-–—−－~～〜:：;；,，、。．.!！?？*＊"'“”‘’「」『』【】()（）〈〉《》…·_+&\/／\\|｜]+$/g;
    function wpKeyword(value) {
        const raw = String(value == null ? '' : value);
        const cleaned = raw
            .replace(WP_SPACES, ' ')
            .replace(/[%％]/g, ' ')
            .split(' ')
            .map(function (token) { return token.replace(WP_EDGE, ''); })
            .filter(Boolean)
            .join(' ')
            .trim();
        return cleaned || raw.replace(WP_SPACES, ' ').replace(/\s+/g, ' ').trim();
    }
    const GROUPS = [
        { key: 'res', label: '资源站' },
        { key: 'guide', label: '攻略存档补丁' },
        { key: 'db', label: '数据库' },
        { key: 'adult', label: '社区 / 18+' }
    ];
    const SITES = [
        { key: 'touchgal', name: 'TouchGal', group: 'res', url: k => TOUCHGAL_ORIGIN + '/search?' + TG_QUERY_PARAM + '=' + enc(k) },
        { key: 'shinnku', name: '失落小站', group: 'res', url: k => 'https://www.shinnku.com/search?q=' + enc(k) },
        { key: 'letmoe', name: '一起萌', group: 'res', url: k => 'https://www.letmoe.com/search?q=' + enc(k) },
        { key: 'amoebi', name: '稻荷', group: 'res', url: () => 'https://amoebi.com' },
        { key: 'shionlib', name: '书音的图书馆', group: 'res', url: k => 'https://shionlib.com/zh/search/game?q=' + enc(k) },
        { key: 'ttloli', name: '忧郁的弟弟', group: 'res', url: k => 'https://www.ttloli.com/?s=' + enc(k) },
        { key: 'searchgal', name: 'SearchGal', group: 'res', url: k => 'https://www.searchgal.top/?s=' + enc(k) },
        { key: 'zi0', name: '梓澪', group: 'res', url: () => 'https://zi6.cc' },
        { key: 'searchgal', name: 'SearchGal', group: 'res', url: k => 'https://www.searchgal.top/?s=' + enc(k) },
        { key: 'lzacg', name: '量子ACG', group: 'res', kw: 'zh', url: k => 'https://lzacg.cc/?s=' + enc(wpKeyword(k)) },
        { key: 'ggbases', name: 'ggbases', group: 'res', url: k => 'https://www.ggbases.com/search.so?title=' + enc(k) },
        { key: 'dmm', name: 'DMM', group: 'res', url: k => 'https://www.dmm.co.jp/search/=/searchstr=' + enc(k) + '/' },
        { key: 'fanza', name: 'Fanza', group: 'res', url: k => 'https://dlsoft.dmm.co.jp/search/?service=pcgame&searchstr=' + enc(k) },
        { key: 'dlsite', name: 'DLsite', group: 'res', url: k => 'https://www.dlsite.com/pro/fsr/=/keyword/' + encodeURIComponent(String(k).replace(/[!！?？*＊~～]/g, ' ').replace(/\s+/g, ' ').trim()).replace(/%20/g, '+') },
        { key: 'vndb', name: 'VNDB', group: 'db', url: k => 'https://vndb.org/v?sq=' + enc(k) },
        { key: 'bangumi', name: 'bangumi', group: 'db', url: k => 'https://bangumi.tv/subject_search/' + enc(k) + '?cat=4' },
        { key: 'erogame', name: '批评空间', group: 'db', url: k => 'https://erogamescape.org/~ap2/ero/toukei_kaiseki/kensaku.php?category=game&word_category=name&mode=normal&word=' + enc(k) },
        { key: 'ymgal', name: '月幕', group: 'db', url: k => 'https://www.ymgal.games/search?type=article&keyword=' + enc(k) },
        { key: 'koko', name: 'kyara', group: 'db', url: k => 'https://koko.kyara.top/kensaku.php?category=game&word_category=name&mode=normal&word=' + enc(k) },
        { key: 'moepedia', name: 'Moepedia', group: 'db', url: k => 'https://moepedia.net/search/result/?s=' + enc(k) },
        { key: 'vgmdb', name: 'VGMdb', group: 'db', url: k => 'https://vgmdb.net/search?q=' + enc(k) },
        { key: 'bishogedb', name: 'Bishogedb', group: 'db', url: k => 'https://bishogedb.com/search?q=' + enc(k) },
        { key: 'seiya', name: '誠也の部屋', group: 'guide', url: k => 'https://seiya-saiga.com/game/kouryaku.html?search=' + enc(k) },
        { key: 'seiyasave', name: '誠也存档', group: 'guide', url: k => 'https://seiya-saiga.com/save.html?cgsearch=' + enc(k) },
        { key: 'sagaoz', name: 'Sagaoz攻略', group: 'guide', url: k => 'https://sagaoz.net/foolmaker/game.html?cgsearch=' + enc(k) },
        { key: '2dfan', name: '2DFan', group: 'guide', url: k => 'https://2dfan.com/subjects/search?keyword=' + enc(k) },
        { key: 'ai2', name: 'Ai2', group: 'guide', url: k => 'https://www.ai2.moe/search/?q=' + enc(k) },
        { key: 'moyu', name: 'Moyu', group: 'guide', url: k => 'https://www.moyu.moe/search?q=' + enc(k) },
        { key: 'kf', name: '绯月', group: 'adult', url: k => 'https://bbs.kfpromax.com/index.php?search=' + enc(k) },
        { key: 'kungal', name: '鲲galgame', group: 'adult', url: k => 'https://www.kungal.com/search?keywords=' + enc(k) },
        { key: 'animeshare', name: 'animeShare', group: 'adult', url: k => 'https://www.anime-sharing.com/search/3528560/?q=' + enc(k) + '&o=relevance' },
        { key: 'nyaa', name: 'nyaa', group: 'adult', url: k => 'https://nyaa.si/?f=0&c=0_0&q=' + enc(k) },
        { key: 'sukebei', name: 'Sukebei', group: 'adult', url: k => 'https://sukebei.nyaa.si/?f=0&c=0_0&q=' + enc(k) },
        { key: 'f95', name: 'F95', group: 'adult', url: k => 'https://f95zone.to/search/040867454/?q=' + enc(k) + '&o=relevance' },
        { key: 'eh', name: 'eHentai', group: 'adult', url: k => 'https://e-hentai.org/?f_search=' + enc(k) },
        { key: 'ex', name: 'ExHentai', group: 'adult', url: k => 'https://ex.moonchan.xyz/?f_search=' + enc(k) },
        { key: 'hitomi', name: 'Hitomi', group: 'adult', url: k => 'https://hitomi.la/search.html?' + enc(k) }
    ];
    const PANEL_CSS = `
        #${PANEL_ID}{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:340px;
        font:13px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;
        background:#1f1d26;color:#e8e6ef;border:1px solid #3a3650;border-radius:10px;
        box-shadow:0 6px 24px rgba(0,0,0,.35);overflow:hidden;}
        #${PANEL_ID}.collapsed{width:125px;}
        #${PANEL_ID} .vj-head{display:flex;align-items:center;justify-content:flex-end;padding:8px 10px;background:#FF3A80;cursor:default;}
        #${PANEL_ID} .vj-title{background:transparent;border:none;color:#fff;
        font:600 12.5px/1.5 inherit;padding:2px 2px;cursor:pointer;}
        #${PANEL_ID} .vj-title:hover{opacity:.85;}
        #${PANEL_ID} .vj-body{padding:10px;display:flex;flex-direction:column;gap:8px;max-height:calc(100vh - 120px);overflow-y:auto;}
        #${PANEL_ID}.collapsed .vj-body{display:none;}
        #${PANEL_ID} .vj-modes{display:flex;gap:2px;background:#2a2735;border:1px solid #3a3650;border-radius:6px;padding:2px;}
        #${PANEL_ID} .vj-mode{flex:1;border:none;background:none;color:#b9b4cc;border-radius:4px;padding:4px 6px;cursor:pointer;font:600 12px/1.5 inherit;}
        #${PANEL_ID} .vj-mode:hover{color:#fff;}
        #${PANEL_ID} .vj-mode.active{background:#FF3A80;color:#fff;}
        #${PANEL_ID} .vj-kw{color:#8f8aa6;font-size:11px;word-break:break-all;}
        #${PANEL_ID} .vj-kw b{color:#cfcae4;font-weight:600;}
        #${PANEL_ID} .vj-groups{display:flex;flex-direction:column;gap:7px;}
        #${PANEL_ID} .vj-group{display:flex;flex-direction:column;gap:4px;padding-top:7px;border-top:1px dashed #3a3650;}
        #${PANEL_ID} .vj-group:first-child{padding-top:0;border-top:none;}
        #${PANEL_ID} .vj-group-label{color:#7d789a;font-size:10.5px;letter-spacing:.4px;}
        #${PANEL_ID} .vj-sites{display:flex;flex-wrap:wrap;gap:4px;}
        #${PANEL_ID} .vj-site{display:inline-flex;align-items:center;font-size:11.5px;padding:3px 9px;border-radius:999px;
        background:#322f40;border:1px solid #4a4664;color:#e8e6ef;text-decoration:none;white-space:nowrap;}
        #${PANEL_ID} .vj-site:hover{background:#3d3950;border-color:#5b5678;color:#fff;}
        #${PANEL_ID} .vj-sub{color:#8f8aa6;font-size:11px;margin-top:2px;}
        #${PANEL_ID} .vj-chips{display:flex;flex-wrap:wrap;gap:4px;}
        #${PANEL_ID} .vj-chip{font-size:11px;padding:2px 8px;border-radius:999px;background:#2a2735;
        border:1px solid #4a4664;color:#cfcae4;cursor:pointer;max-width:100%;overflow:hidden;
        text-overflow:ellipsis;white-space:nowrap;}
        #${PANEL_ID} .vj-chip:hover{background:#3d3950;color:#fff;}
        #${PANEL_ID} .vj-chip.active{background:#FF3A80;border-color:#FF3A80;color:#fff;}
    `;
    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = PANEL_CSS;
        (document.head || document.documentElement).appendChild(style);
    }
    function getVnId() {
        const m = path.match(/^\/v(\d+)(?:\/|$)/);
        return m ? m[1] : null;
    }
    function getMainTitle() {
        const og = document.querySelector('meta[property="og:title"]');
        if (og && og.content && og.content.trim()) return og.content.trim();
        const h1 = document.querySelector('main article h1');
        if (h1 && h1.textContent.trim()) return h1.textContent.trim();
        return document.title.replace(/\s*\|\s*vndb\s*$/i, '').trim();
    }
    const LATIN_LANGS = /^(?:en|es|pt|fr|de|it|nl|pl|tr|vi|id|la|eo|ca|sv|fi|cs|sk|hu|ro)(?:-|$)/i;
    function scriptLang(text, rowLang) {
        if (!rowLang) return '';
        const hasNative = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\u0400-\u052f]/.test(text);
        if (hasNative) return rowLang;
        if (/^ja/i.test(rowLang)) return 'ja-Latn';
        if (LATIN_LANGS.test(rowLang)) return rowLang;
        return rowLang + '-Latn';
    }
    function collectTitles() {
        const list = [];
        const seen = new Set();
        const add = function (text, lang) {
            text = (text || '').replace(/\s+/g, ' ').trim();
            if (!text) return;
            const key = text.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            list.push({ text: text, lang: lang || '' });
        };
        const alt = document.querySelector('h2.alttitle');
        if (alt) {
            const altText = alt.textContent.trim();
            add(altText, scriptLang(altText, alt.getAttribute('lang') || 'ja'));
        }
        const aliasRow = Array.from(document.querySelectorAll('tr')).find(function (tr) {
            const td = tr.querySelector('td');
            return !!td && /^aliases?$/i.test(td.textContent.trim());
        });
        const aliasTexts = [];
        if (aliasRow) {
            const cells = aliasRow.querySelectorAll('td');
            const cell = cells[cells.length - 1];
            if (cell) {
                cell.textContent.split(/[,，;；]/).forEach(function (alias) {
                    const text = alias.trim();
                    if (text.length >= 2) aliasTexts.push(text);
                });
            }
        }
        const isKana = function (t) { return /[\u3040-\u30ff]/.test(t); };
        aliasTexts.filter(isKana).forEach(function (t) { add(t, 'ja'); });
        document.querySelectorAll('tr.title').forEach(function (row) {
            const td = row.querySelector('td:last-child');
            if (!td) return;
            const abbr = row.querySelector('abbr[class*="icon-lang-"]');
            const rowLang = abbr ? ((abbr.className.match(/icon-lang-([a-zA-Z-]+)/) || [])[1] || '') : '';
            const span = td.querySelector('span');
            const spanText = span ? span.textContent.trim() : '';
            if (spanText) add(spanText, scriptLang(spanText, span.getAttribute('lang') || rowLang));
            if (spanText) {
                const rest = td.textContent.replace(spanText, '').trim();
                if (rest) add(rest, scriptLang(rest, rowLang));
            }
        });
        aliasTexts.filter(function (t) { return !/[\u3040-\u30ff]/.test(t); }).forEach(function (t) { add(t, 'alias'); });
        const mainTitle = getMainTitle();
        if (mainTitle) {
            const hasJapanese = list.some(function (t) { return t.lang === 'ja'; });
            const label = hasJapanese ? 'ja' : '主标题';
            for (let i = list.length - 1; i >= 0; i--) {
                if (list[i].text.toLowerCase() === mainTitle.toLowerCase()) list.splice(i, 1);
            }
            list.unshift({ text: mainTitle, lang: label });
        }
        return list;
    }
    function buildPanel(vnId, titles) {
        ensureStyle();
        const isJa = function (t) { return t.lang === 'ja'; };
        const hasJaScript = function (t) { return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(t.text); };
        const defaultEntry = titles.find(function (t) { return isJa(t) && hasJaScript(t); })
            || titles.find(isJa)
            || titles[0] || { text: '', lang: '' };
        const defaultTitle = defaultEntry.text;
        const zhEntry = titles.find(function (t) { return /^zh-Hans/i.test(t.lang); })
            || titles.find(function (t) { return /^zh/i.test(t.lang) && !/[\u3040-\u30ff]/.test(t.text); })
            || titles.find(function (t) { return /[\u4e00-\u9fff]/.test(t.text) && !/[\u3040-\u30ff]/.test(t.text); })
            || null;
        const zhTitle = zhEntry ? zhEntry.text : '';
        const otherTitles = titles.filter(function (t) { return t.text !== defaultTitle; }).slice(0, 8);
        const chipTitles = defaultTitle ? [defaultEntry].concat(otherTitles) : otherTitles;
        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.classList.add('collapsed');
        panel.innerHTML = [
            '<div class="vj-body">',
            '<div class="vj-modes">',
            '<button class="vj-mode" type="button" data-mode="' + MODE_TITLE + '">游戏名</button>',
            '<button class="vj-mode" type="button" data-mode="' + MODE_VN + '">v' + esc(vnId) + '</button>',
            '</div>',
            '<div class="vj-kw">当前关键词：<b class="vj-kw-val"></b></div>',
            '<div class="vj-groups">',
            GROUPS.map(function (group) {
                const items = SITES.filter(function (site) { return site.group === group.key; });
                if (!items.length) return '';
                return '<div class="vj-group">' +
                    '<div class="vj-group-label">' + esc(group.label) + '</div>' +
                    '<div class="vj-sites">' +
                    items.map(function (site) {
                        return '<a class="vj-site" data-site="' + esc(site.key) +
                            '" target="_blank" rel="noopener">' + esc(site.name) + '</a>';
                    }).join('') +
                    '</div></div>';
            }).join(''),
            '</div>',
            chipTitles.length
                ? '<div class="vj-sub">换个标题搜：</div><div class="vj-chips">' +
                  chipTitles.map(function (t) {
                      return '<button class="vj-chip" type="button" title="' + esc(t.text) + '" data-title="' +
                          esc(t.text) + '">' + esc((t.lang ? t.lang + ' · ' : '') + t.text) + '</button>';
                  }).join('') + '</div>'
                : '',
            '</div>',
            '<div class="vj-head">',
            '<button class="vj-title" type="button">VNDB跨站搜索</button>',
            '</div>'
        ].join('');
        let mode = MODE_TITLE;
        let pickedTitle = '';
        const kwEl = panel.querySelector('.vj-kw-val');
        const modeBtns = Array.from(panel.querySelectorAll('.vj-mode'));
        const chipEls = Array.from(panel.querySelectorAll('.vj-chip'));
        const siteLinks = Array.from(panel.querySelectorAll('.vj-site'));
        function currentKeyword() {
            return mode === MODE_TITLE ? (pickedTitle || defaultTitle) : 'v' + vnId;
        }
        function refresh() {
            const keyword = currentKeyword();
            kwEl.textContent = keyword || '—';
            modeBtns.forEach(function (btn) {
                btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
            });
            chipEls.forEach(function (chip) {
                const title = chip.getAttribute('data-title');
                const active = mode === MODE_TITLE && (title === defaultTitle ? !pickedTitle : pickedTitle === title);
                chip.classList.toggle('active', active);
            });
            siteLinks.forEach(function (link) {
                const site = SITES.find(function (s) { return s.key === link.getAttribute('data-site'); });
                if (!site) return;
                let kw = keyword;
                if (mode === MODE_TITLE && !pickedTitle && site.kw === 'zh' && zhTitle) {
                    kw = zhTitle;
                }
                link.href = site.url(kw);
                link.title = (kw !== keyword ? '搜索（中文标题）：' + kw : '');
            });
        }
        function toggleCollapsed() {
            panel.classList.toggle('collapsed');
        }
        panel.querySelector('.vj-title').addEventListener('click', toggleCollapsed);
        modeBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                mode = btn.getAttribute('data-mode');
                pickedTitle = '';
                refresh();
            });
        });
        chipEls.forEach(function (chip) {
            chip.addEventListener('click', function () {
                pickedTitle = chip.getAttribute('data-title') || '';
                mode = MODE_TITLE;
                refresh();
            });
        });
        document.body.appendChild(panel);
        refresh();
        return panel;
    }
    function initVndbPanel() {
        if (document.getElementById(PANEL_ID)) return;
        const vnId = getVnId();
        if (!vnId) return;
        const titles = collectTitles();
        if (!titles.length) return;
        buildPanel(vnId, titles);
    }
    function getSearchParam(paramName) {
        try {
            const url = new URL(window.location.href);
            const param = url.searchParams.get(paramName);
            return param ? decodeURIComponent(param) : null;
        } catch {
            const regex = new RegExp(`[?&]${paramName}=([^&]+)`);
            const match = window.location.href.match(regex);
            return match ? decodeURIComponent(match[1]) : null;
        }
    }
    function normalizeText(text) {
        return text.trim()
                  .replace(/\s+/g, ' ')
                  .replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
                  .toLowerCase();
    }
    function searchAndHighlight(node, keyword) {
        if (!keyword) return;
        const normalizedKeyword = normalizeText(keyword);
        let isFirstMatch = true;
        function processNode(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent;
                const normalizedText = normalizeText(text);
                if (normalizedText.includes(normalizedKeyword)) {
                    const span = document.createElement('span');
                    span.textContent = text;
                    span.className = 'keyword-highlight';
                    span.style.backgroundColor = 'yellow';
                    node.replaceWith(span);
                    if (isFirstMatch) {
                        span.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        isFirstMatch = false;
                    }
                    return true;
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const style = window.getComputedStyle(node);
                if (style.display === 'none' || style.visibility === 'hidden') {
                    return false;
                }
                Array.from(node.childNodes).forEach(child => processNode(child));
            }
            return false;
        }
        processNode(node);
    }
    function initSearchPage() {
        const keyword = getSearchParam('search');
        if (!keyword) return;
        console.log('搜索关键词:', keyword);
        if (document.body) {
            searchAndHighlight(document.body, keyword);
        } else {
            document.addEventListener('DOMContentLoaded', () =>
                searchAndHighlight(document.body, keyword)
            );
        }
        const searchInput = document.querySelector('input[name="keyword"]');
        const searchButton = document.querySelector('input[name="submit"]');
        if (searchInput && searchButton) {
            searchInput.value = keyword;
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchButton.click();
            console.log(`搜索已触发，关键词: "${keyword}"，等待结果加载...`);
            const observer = new MutationObserver(() => {
                const searchResults = document.querySelector('.search-results');
                if (searchResults) {
                    console.log('搜索结果已加载:', searchResults);
                    observer.disconnect();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        } else {
            console.error('未找到搜索框或搜索按钮元素');
        }
    }
    function unlockTitleCopy() {
        if (!window.location.href.includes("vndb.org")) return;
        const titleElement1 = document.querySelector("#top_wrapper > ul > li:last-child");
        const titleElement2 = document.querySelector("body > main > article:nth-child(1) > div.vndetails > table > tbody > tr:nth-child(1) > td > details > summary > table > tbody > tr > td:nth-child(2) > span");
        if (titleElement1) {
            titleElement1.style = "user-select:auto";
        }
        if (titleElement2) {
            titleElement2.style = "user-select:auto";
        }
    }
    const REDIRECT_ROUTE = /^\/(?:redirect|go|jump|out|away|goto|link)(?:\/|$)/i;
    const REDIRECT_KEYS = ['url', 'u', 'target', 'to', 'link', 'href', 'redirect', 'redirect_url', 'redirecturl', 'out', 'go', 'jump', 'dest', 'destination'];
    function decodeLoose(value) {
        try { return decodeURIComponent(value); } catch (e) { return value; }
    }
    function safeTarget(raw) {
        const value = String(raw == null ? '' : raw).trim();
        if (!value) return '';
        let text = value;
        if (!/^https?:\/\//i.test(text)) text = decodeLoose(text).trim();
        if (!/^https?:\/\//i.test(text)) return '';
        try {
            const url = new URL(text);
            if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
            if (REDIRECT_ROUTE.test(url.pathname) && url.searchParams.has('url')) return '';
            return url.href;
        } catch (e) {
            return '';
        }
    }
    function scanParams(params) {
        for (let i = 0; i < REDIRECT_KEYS.length; i++) {
            const target = safeTarget(params.get(REDIRECT_KEYS[i]));
            if (target) return target;
        }
        return '';
    }
    function paramTarget() {
        let target = '';
        try { target = scanParams(new URLSearchParams(location.search)); } catch (e) { }
        if (target) return target;
        try {
            if (location.hash.length > 1) {
                const hash = location.hash.slice(1);
                const index = hash.indexOf('?');
                target = scanParams(new URLSearchParams(index === -1 ? hash : hash.slice(index + 1)));
            }
        } catch (e) { }
        return target;
    }
    function metaTarget() {
        const metas = document.querySelectorAll('meta[http-equiv]');
        for (let i = 0; i < metas.length; i++) {
            if (String(metas[i].getAttribute('http-equiv')).toLowerCase() !== 'refresh') continue;
            const content = metas[i].getAttribute('content') || '';
            const index = content.toLowerCase().indexOf('url=');
            if (index === -1) continue;
            const target = safeTarget(content.slice(index + 4).replace(/^['"]|['"]$/g, ''));
            if (target) return target;
        }
        return '';
    }
    function anchorTarget() {
        const links = document.querySelectorAll('a[href]');
        const jumpText = /继续|前往|跳转|前往访问|点击这里|立即访问|continue|proceed/i;
        for (let i = 0; i < links.length; i++) {
            const href = links[i].getAttribute('href') || '';
            if (!/^https?:\/\//i.test(href)) continue;
            if (!jumpText.test(links[i].textContent || '')) continue;
            const target = safeTarget(href);
            if (target) return target;
        }
        return '';
    }
    function hasWaitMarker() {
        const body = document.body;
        if (!body) return false;
        const text = String(body.textContent || '').slice(0, 4000);
        return /自动跳转|即将跳转|即将离开|正在跳转|跳转中|安全提示|继续访问|秒后/.test(text);
    }
    function isRedirectPage() {
        if (REDIRECT_ROUTE.test(location.pathname)) return true;
        return !!paramTarget() && hasWaitMarker();
    }
    function redirectTarget() {
        return paramTarget() || metaTarget() || anchorTarget();
    }
    let lastRedirectHref = '';
    let redirectLocked = false;
    function maybeAutoRedirect() {
        if (redirectLocked) return;
        if (!isRedirectPage()) return;
        const target = redirectTarget();
        if (!target) return;
        if (target === lastRedirectHref) return;
        lastRedirectHref = target;
        redirectLocked = true;
        try { location.replace(target); } catch (e) { location.href = target; }
    }
    function watchSpaRedirect() {
        if (history.__vjRedirectPatched) return;
        history.__vjRedirectPatched = true;
        ['pushState', 'replaceState'].forEach(function (method) {
            const original = history[method];
            if (typeof original !== 'function') return;
            history[method] = function () {
                const result = original.apply(this, arguments);
                setTimeout(maybeAutoRedirect, 50);
                return result;
            };
        });
    }
    function initRedirectSkip() {
        watchSpaRedirect();
        maybeAutoRedirect();
        let ticks = 0;
        const timer = setInterval(function () {
            ticks += 1;
            maybeAutoRedirect();
            if (redirectLocked || ticks >= 240) clearInterval(timer);
        }, 50);
        window.addEventListener('popstate', function () { setTimeout(maybeAutoRedirect, 80); });
        window.addEventListener('hashchange', function () { setTimeout(maybeAutoRedirect, 80); });
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', maybeAutoRedirect);
        }
    }
    if (host === 'touchgal.top' || host === 'touchgal.ink') {
        initRedirectSkip();
    }
    function bootPageFeatures() {
        if (host === 'vndb.org' && /^\/v\d+(?:\/|$)/.test(path)) {
            initVndbPanel();
            let lastPath = path;
            setInterval(function () {
                if (location.pathname === lastPath) return;
                lastPath = location.pathname;
                const old = document.getElementById(PANEL_ID);
                if (old) old.remove();
                initVndbPanel();
            }, 800);
        }
        initSearchPage();
        unlockTitleCopy();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootPageFeatures);
    } else {
        bootPageFeatures();
    }
    window.__VNDB_JUMP__ = {
        getVnId: getVnId,
        collectTitles: collectTitles,
        isRedirectPage: isRedirectPage,
        redirectTarget: redirectTarget
    };
})();
(function () {
  'use strict';
  const TOUCHGAL_ORIGIN = 'https://www.touchgal.ink';
  const TG_SEARCH_PATH = '/search';
  const TG_QUERY_PARAM = 'tgq';
  const REACT_READY_TIMEOUT = 6000;
  const INPUT_SETTLE_MS = 300;
  const SEARCH_WATCH_MS = 1400;
  const MAX_ATTEMPTS = 4;
  const host = location.hostname.replace(/^www\./, '');
  const path = location.pathname;
  function tgSearchUrl(keyword) {
    return TOUCHGAL_ORIGIN + TG_SEARCH_PATH + '?' + TG_QUERY_PARAM + '=' + encodeURIComponent(keyword);
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  const TG_INPUT_SELECTOR = 'input[role="combobox"][aria-label="搜索 Galgame"]';
  function tgToast(msg, duration) {
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.setAttribute('style', [
      'position:fixed', 'left:50%', 'bottom:28px', 'transform:translateX(-50%)',
      'z-index:2147483647', 'max-width:80vw',
      'background:rgba(31,29,38,.94)', 'color:#e8e6ef',
      'border:1px solid #3a3650', 'border-radius:8px',
      'padding:8px 14px', 'font:13px/1.5 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif',
      'box-shadow:0 6px 24px rgba(0,0,0,.35)',
      'opacity:0', 'transition:opacity .25s', 'word-break:break-all'
    ].join(';'));
    document.body.appendChild(toast);
    requestAnimationFrame(function () { toast.style.opacity = '1'; });
    setTimeout(function () {
      toast.style.opacity = '0';
      setTimeout(function () { toast.remove(); }, 300);
    }, duration || 4000);
  }
  function tgWatchSuccess(startedRef) {
    if (typeof PerformanceObserver === 'undefined') return;
    try {
      const po = new PerformanceObserver(function (list) {
        for (let i = 0; i < list.getEntries().length; i++) {
          const entry = list.getEntries()[i];
          const name = entry.name || '';
          if (name.indexOf('/search') !== -1 && name.indexOf('_rsc') === -1 &&
              (entry.initiatorType === 'fetch' || entry.initiatorType === 'xmlhttprequest')) {
            startedRef.ok = true;
          }
        }
      });
      po.observe({ type: 'resource', buffered: false });
    } catch (e) { }
  }
  function tgHasChip() {
    return !!document.querySelector('[aria-label="close chip"]');
  }
  function tgSetInputValue(input, keyword) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, keyword);
    const InputEventCtor = window.InputEvent || Event;
    input.dispatchEvent(new InputEventCtor('input', {
      bubbles: true, cancelable: false, data: keyword, inputType: 'insertText'
    }));
  }
  function tgPressEnter(input) {
    const evInit = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    input.dispatchEvent(new KeyboardEvent('keydown', evInit));
    input.dispatchEvent(new KeyboardEvent('keyup', evInit));
  }
  function tgFillAndSubmit(input, keyword, attempt) {
    attempt = attempt || 1;
    const started = { ok: false };
    tgWatchSuccess(started);
    input.focus();
    tgSetInputValue(input, keyword);
    setTimeout(function () {
      if (input.value !== keyword) {
        if (attempt < MAX_ATTEMPTS) return tgFillAndSubmit(input, keyword, attempt + 1);
        return tgApiFallback(keyword);
      }
      tgPressEnter(input);
      setTimeout(function () {
        if (started.ok || tgHasChip()) {
          tgToast('已自动搜索：' + keyword);
          return;
        }
        if (attempt < MAX_ATTEMPTS) return tgFillAndSubmit(input, keyword, attempt + 1);
        tgApiFallback(keyword);
      }, SEARCH_WATCH_MS);
    }, INPUT_SETTLE_MS);
  }
  function tgApiFallback(keyword) {
    tgToast('自动操作搜索框失败，正在直接查询…');
    const body = {
      queryString: JSON.stringify([{ type: 'keyword', mode: 'include', name: keyword }]),
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
    fetch(TOUCHGAL_ORIGIN + TG_SEARCH_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'include'
    }).then(function (res) {
      return res.json();
    }).then(function (data) {
      const games = (data && Array.isArray(data.galgames)) ? data.galgames : [];
      tgRenderFallback(keyword, games);
    }).catch(function () {
      tgToast('自动搜索失败，请手动输入并搜索：' + keyword, 9000);
    });
  }
  function tgRenderFallback(keyword, games) {
    const old = document.getElementById('tg-fallback-panel');
    if (old) old.remove();
    const panel = document.createElement('div');
    panel.id = 'tg-fallback-panel';
    panel.setAttribute('style', [
      'position:fixed', 'left:50%', 'top:16px', 'transform:translateX(-50%)',
      'z-index:2147483647', 'width:min(560px,92vw)', 'max-height:70vh', 'overflow:auto',
      'background:#1f1d26', 'color:#e8e6ef', 'border:1px solid #3a3650', 'border-radius:10px',
      'box-shadow:0 6px 24px rgba(0,0,0,.35)',
      'font:13px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif'
    ].join(';'));
    let html = '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #3a3650;">' +
      '<span style="font-weight:600;">“' + escapeHtml(keyword) + '” 的搜索结果（' + games.length + '）</span>' +
      '<button id="tg-fallback-close" style="margin-left:auto;background:none;border:none;color:#b9b4cc;cursor:pointer;font-size:15px;">×</button></div>';
    if (!games.length) {
      html += '<div style="padding:14px 12px;color:#9a94b8;">没有找到相关游戏，可换个标题关键词试试。</div>';
    } else {
      html += '<ul style="list-style:none;margin:0;padding:6px;">' + games.map(function (g) {
        return '<li style="margin:2px 0;"><a href="/' + encodeURIComponent(g.uniqueId) + '" target="_blank" rel="noopener" ' +
          'style="display:block;padding:8px 10px;border-radius:6px;color:#cfcae4;text-decoration:none;">' +
          escapeHtml(g.name || g.uniqueId) + '</a></li>';
      }).join('') + '</ul>';
    }
    panel.innerHTML = html;
    panel.querySelector('#tg-fallback-close').addEventListener('click', function () { panel.remove(); });
    document.body.appendChild(panel);
  }
  function tgOnInputReady(input, cb) {
    const hasReact = function () {
      try {
        return Object.keys(input).some(function (k) { return k.indexOf('__react') === 0; });
      } catch (e) { return false; }
    };
    const t0 = Date.now();
    (function poll() {
      const waited = Date.now() - t0;
      if (hasReact()) {
        setTimeout(cb, 350);
        return;
      }
      if (waited >= REACT_READY_TIMEOUT) {
        setTimeout(cb, 400);
        return;
      }
      setTimeout(poll, 100);
    })();
  }
  function initTouchgalSearch() {
    const keyword = new URLSearchParams(location.search).get(TG_QUERY_PARAM);
    if (!keyword) return;
    const existing = document.querySelector(TG_INPUT_SELECTOR);
    if (existing) {
      tgOnInputReady(existing, function () { tgFillAndSubmit(existing, keyword, 1); });
      return;
    }
    let settled = false;
    const observer = new MutationObserver(function () {
      const input = document.querySelector(TG_INPUT_SELECTOR);
      if (input && !settled) {
        settled = true;
        observer.disconnect();
        tgOnInputReady(input, function () { tgFillAndSubmit(input, keyword, 1); });
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(function () {
      if (settled) return;
      settled = true;
      observer.disconnect();
      tgApiFallback(keyword);
    }, 15000);
  }
  if (host === 'touchgal.ink' && path.indexOf(TG_SEARCH_PATH) === 0) {
    if (document.readyState === 'loading' && !document.documentElement) {
      document.addEventListener('DOMContentLoaded', initTouchgalSearch);
    } else {
      initTouchgalSearch();
    }
  }
  window.__VNDB_TG__ = { tgSearchUrl: tgSearchUrl };
})();
