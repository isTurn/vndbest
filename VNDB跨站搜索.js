// ==UserScript==
// @name         VNDB跨站搜索
// @namespace    http://tampermonkey.net/
// @version      2.8.0
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
// @match        https://www.searchgal.top/*
// @match        https://searchgal.top/*
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
        { key: 'touchgal', name: 'TouchGal', group: 'res', url: k => TOUCHGAL_ORIGIN + '/search#tgq=' + enc(k) },
        { key: 'shinnku', name: '失落小站', group: 'res', url: k => 'https://www.shinnku.com/search?q=' + enc(k) },
        { key: 'letmoe', name: '一起萌', group: 'res', url: k => 'https://www.letmoe.com/search?q=' + enc(k) },
        { key: 'amoebi', name: '稻荷', group: 'res', url: k => 'https://inarigal.com/?search=' + enc(k) },
        { key: 'shionlib', name: '书音的图书馆', group: 'res', url: k => 'https://shionlib.com/zh/search/game?q=' + enc(k) },
        { key: 'searchgal', name: 'SearchGal', group: 'res', url: k => 'https://www.searchgal.top/?s=' + enc(k) },
        { key: 'zi0', name: '梓澪', group: 'res', url: () => 'https://zi6.cc' },
        { key: 'lzacg', name: '量子ACG', group: 'res', kw: 'zh', url: k => 'https://lzacg.cc/?s=' + enc(wpKeyword(k)) },
        { key: 'ggbases', name: 'ggbases', group: 'res', url: k => 'https://www.ggbases.com/search.so?title=' + enc(k) },
        { key: 'nysoure', name: 'Nysoure', group: 'res', url: k => 'https://nysoure.com/search?keyword=' + enc(k) },
        { key: 'galzy', name: 'GalZY', group: 'res', url: k => 'https://www.galzy.moe/games?q=' + enc(k) },
        { key: 'sakugal', name: 'SakuGAL', group: 'res', url: k => 'https://sakugal.com/search/' + enc(k) + '/' },
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
        #${PANEL_ID}{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:min(340px,calc(100vw - 32px));
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
    const SITE_MAP = SITES.reduce(function (acc, site) {
        if (!acc[site.key]) acc[site.key] = site;
        return acc;
    }, {});
    const STATE_KEY = 'vndb-jump-panel-state';
    function loadPanelState() {
        try {
            const raw = sessionStorage.getItem(STATE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }
    function savePanelState(state) {
        try { sessionStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) { }
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
        const saved = loadPanelState() || {};
        let mode = saved.vn === vnId && saved.mode === MODE_VN ? MODE_VN : MODE_TITLE;
        let pickedTitle = saved.vn === vnId && saved.mode === MODE_TITLE ? (saved.title || '') : '';
        if (pickedTitle && !chipTitles.some(function (t) { return t.text === pickedTitle; })) pickedTitle = '';
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
                const site = SITE_MAP[link.getAttribute('data-site')];
                if (!site) return;
                let kw = keyword;
                if (mode === MODE_TITLE && !pickedTitle && site.kw === 'zh' && zhTitle) {
                    kw = zhTitle;
                }
                link.href = site.url(kw);
                link.title = (kw !== keyword ? '搜索（中文标题）：' + kw : '');
            });
            savePanelState({ vn: vnId, mode: mode, title: pickedTitle, collapsed: panel.classList.contains('collapsed') });
        }
        function toggleCollapsed() {
            panel.classList.toggle('collapsed');
            savePanelState({ vn: vnId, mode: mode, title: pickedTitle, collapsed: panel.classList.contains('collapsed') });
        }
        if (saved.vn === vnId && saved.collapsed === false) panel.classList.remove('collapsed');
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
    function safeDecode(value) {
        try { return decodeURIComponent(value); } catch (e) { return value; }
    }
    function getSearchParam(paramName) {
        try {
            const param = new URL(window.location.href).searchParams.get(paramName);
            if (param) return param;
            const match = window.location.href.match(new RegExp(`[?&]${paramName}=([^&]+)`));
            return match ? safeDecode(match[1]) : null;
        } catch (e) {
            return null;
        }
    }
    function foldText(text) {
        return String(text == null ? '' : text)
            .replace(/[！-～]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
            .toLowerCase();
    }
    function normalizeText(text) {
        return foldText(text).replace(/\s+/g, ' ').trim();
    }
    const SKIP_TAGS = /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT|SELECT|OPTION|CODE|PRE)$/;
    function searchAndHighlight(root, keyword) {
        if (!keyword || !root) return;
        const normalizedKeyword = normalizeText(keyword);
        if (!normalizedKeyword) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: function (node) {
                const parent = node.parentNode;
                if (!parent || !parent.tagName) return NodeFilter.FILTER_REJECT;
                if (SKIP_TAGS.test(parent.tagName)) return NodeFilter.FILTER_REJECT;
                if (parent.closest('.vj-chip,.vj-site,#' + PANEL_ID)) return NodeFilter.FILTER_REJECT;
                if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        const hits = [];
        let node = walker.nextNode();
        while (node) {
            if (normalizeText(node.nodeValue).includes(normalizedKeyword)) hits.push(node);
            node = walker.nextNode();
        }
        let first = null;
        hits.forEach(function (textNode) {
            const text = textNode.nodeValue;
            const folded = foldText(text);
            const flat = folded.replace(/\s+/g, ' ');
            const haystack = flat.length === folded.length ? flat : folded;
            let index = haystack.indexOf(normalizedKeyword);
            if (index === -1) return;
            const frag = document.createDocumentFragment();
            let cursor = 0;
            let guard = 0;
            while (index !== -1 && guard < 64) {
                if (index > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, index)));
                const mark = document.createElement('mark');
                mark.className = 'keyword-highlight';
                mark.style.backgroundColor = 'yellow';
                mark.style.color = 'inherit';
                mark.textContent = text.slice(index, index + normalizedKeyword.length);
                frag.appendChild(mark);
                if (!first) first = mark;
                cursor = index + normalizedKeyword.length;
                index = haystack.indexOf(normalizedKeyword, cursor);
                guard += 1;
            }
            if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
            textNode.replaceWith(frag);
        });
        if (first && first.scrollIntoView) {
            first.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
    function initSearchPage() {
        const keyword = getSearchParam('search');
        if (!keyword) return;
        const run = function () {
            searchAndHighlight(document.body, keyword);
            const input = document.querySelector('input[name="keyword"]');
            const button = document.querySelector('input[name="submit"]');
            if (!input || !button) return;
            input.value = keyword;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            const results = document.querySelector('.search-results');
            if (!results) {
                button.click();
                let ticks = 0;
                const timer = setInterval(function () {
                    ticks += 1;
                    if (document.querySelector('.search-results') || ticks >= 60) {
                        clearInterval(timer);
                        searchAndHighlight(document.querySelector('.search-results') || document.body, keyword);
                    }
                }, 250);
                return;
            }
            if (!results.querySelector('mark.keyword-highlight')) {
                searchAndHighlight(results, keyword);
            }
        };
        if (document.body) run();
        else document.addEventListener('DOMContentLoaded', run);
    }
    function unlockTitleCopy() {
        if (!window.location.href.includes("vndb.org")) return;
        const titleElement1 = document.querySelector("#top_wrapper > ul > li:last-child");
        const titleElement2 = document.querySelector("body > main > article:nth-child(1) > div.vndetails > table > tbody > tr:nth-child(1) > td > details > summary > table > tbody > tr > td:nth-child(2) > span");
        if (titleElement1) titleElement1.style.userSelect = 'auto';
        if (titleElement2) titleElement2.style.userSelect = 'auto';
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
    function isRedirectPath(value) {
        const cleaned = String(value || '').replace(/\/+$/, '') || '/';
        if (REDIRECT_ROUTE.test(cleaned)) return true;
        return REDIRECT_ROUTE.test(cleaned.replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//i, '/'));
    }
    let markerCheckedAt = 0;
    let markerResult = false;
    function hasWaitMarker() {
        const now = Date.now();
        if (now - markerCheckedAt < 800) return markerResult;
        markerCheckedAt = now;
        markerResult = false;
        const body = document.body;
        if (!body || !body.firstChild) return markerResult;
        const text = String(body.textContent || '');
        if (text.length > 6000) {
            markerResult = /自动跳转|即将跳转|即将离开|正在跳转|跳转中|安全提示|继续访问/.test(text);
            return markerResult;
        }
        markerResult = /自动跳转|即将跳转|即将离开|正在跳转|跳转中|安全提示|继续访问|秒后/.test(text);
        return markerResult;
    }
    function isRedirectPage() {
        if (isRedirectPath(location.pathname)) return true;
        return hasWaitMarker() && !!paramTarget();
    }
    function redirectTarget() {
        return paramTarget() || metaTarget() || anchorTarget();
    }
    function directTargetFromHref(href) {
        if (!href) return '';
        let url;
        try { url = new URL(href, location.origin); } catch (e) { return ''; }
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
        if (!isRedirectPath(url.pathname)) return '';
        return scanParams(url.searchParams);
    }
    const REDIRECT_LINK_SELECTOR = 'a[href*="redirect"], a[href*="url="], a[href*="target="]';
    function rewriteRedirectLinks(root) {
        const scope = root && root.querySelectorAll ? root : document;
        const links = scope.querySelectorAll(REDIRECT_LINK_SELECTOR);
        for (let i = 0; i < links.length; i++) {
            const a = links[i];
            let target = '';
            try { target = directTargetFromHref(a.getAttribute('href')); } catch (e) { continue; }
            if (!target) continue;
            if (a.getAttribute('href') !== target) a.setAttribute('href', target);
            a.setAttribute('data-vj-direct', target);
            if (a.getAttribute('target') === '_blank') a.setAttribute('rel', 'noopener');
        }
    }
    function onRedirectLinkClick(ev) {
        try { handleRedirectClick(ev); } catch (e) { }
    }
    function handleRedirectClick(ev) {
        if (ev.defaultPrevented || ev.button !== 0) return;
        const node = ev.target;
        const a = node && node.closest ? node.closest('a[href]') : null;
        if (!a) return;
        const target = a.getAttribute('data-vj-direct') || directTargetFromHref(a.getAttribute('href'));
        if (!target) return;
        if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return;
        if (a.getAttribute('target') === '_blank') return;
        if (!/^https?:\/\//i.test(target)) return;
        ev.preventDefault();
        ev.stopImmediatePropagation();
        location.href = target;
    }
    function watchRedirectLinks() {
        const start = function () {
            rewriteRedirectLinks(document);
            document.addEventListener('click', onRedirectLinkClick, true);
            let pending = [];
            let queued = false;
            const flush = function () {
                queued = false;
                const batch = pending;
                pending = [];
                for (let i = 0; i < batch.length; i++) {
                    const el = batch[i];
                    if (!el.isConnected || !el.querySelectorAll) continue;
                    rewriteRedirectLinks(el);
                }
                rewriteRedirectLinks(document);
            };
            const observer = new MutationObserver(function (records) {
                for (let i = 0; i < records.length; i++) {
                    const added = records[i].addedNodes;
                    for (let k = 0; k < added.length; k++) {
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
                safeAutoRedirect();
                setTimeout(safeAutoRedirect, 0);
                return result;
            };
        });
    }
    function safeAutoRedirect() {
        try { maybeAutoRedirect(); } catch (e) { }
    }
    function initRedirectSkip() {
        watchRedirectLinks();
        watchSpaRedirect();
        safeAutoRedirect();
        let ticks = 0;
        const timer = setInterval(function () {
            ticks += 1;
            safeAutoRedirect();
            if (redirectLocked || ticks >= 160) clearInterval(timer);
        }, 50);
        window.addEventListener('popstate', safeAutoRedirect);
        window.addEventListener('hashchange', safeAutoRedirect);
        document.addEventListener('DOMContentLoaded', safeAutoRedirect);
        window.addEventListener('load', safeAutoRedirect);
    }
    if (host === 'touchgal.top' || host === 'touchgal.ink') {
        initRedirectSkip();
    }
    function watchRoute(onChange) {
        let lastPath = location.pathname;
        const fire = function () {
            if (location.pathname === lastPath) return;
            lastPath = location.pathname;
            onChange(lastPath);
        };
        ['pushState', 'replaceState'].forEach(function (method) {
            const original = history[method];
            if (typeof original !== 'function') return;
            history[method] = function () {
                const result = original.apply(this, arguments);
                fire();
                setTimeout(fire, 0);
                return result;
            };
        });
        window.addEventListener('popstate', fire);
        window.addEventListener('hashchange', fire);
        document.addEventListener('visibilitychange', fire);
    }
    function bootPageFeatures() {
        initSearchPage();
        unlockTitleCopy();
        if (host !== 'vndb.org') return;
        const syncPanel = function () {
            const old = document.getElementById(PANEL_ID);
            if (old) old.remove();
            if (/^\/v\d+(?:\/|$)/.test(location.pathname)) initVndbPanel();
        };
        if (/^\/v\d+(?:\/|$)/.test(path)) initVndbPanel();
        watchRoute(syncPanel);
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
  function tgReadKeyword() {
    try {
      const search = new URLSearchParams(location.search).get(TG_QUERY_PARAM);
      if (search) return search;
    } catch (e) { }
    try {
      if (location.hash.length > 1) {
        const hash = location.hash.slice(1);
        const index = hash.indexOf('?');
        return new URLSearchParams(index === -1 ? hash : hash.slice(index + 1)).get(TG_QUERY_PARAM) || '';
      }
    } catch (e) { }
    return '';
  }
  function initTouchgalSearch() {
    const keyword = tgReadKeyword();
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
  if (host === 'touchgal.ink' && (path.indexOf(TG_SEARCH_PATH) === 0 || tgReadKeyword())) {
    if (document.readyState === 'loading' && !document.documentElement) {
      document.addEventListener('DOMContentLoaded', initTouchgalSearch);
    } else {
      initTouchgalSearch();
    }
  }
  window.__VNDB_TG__ = { tgSearchUrl: tgSearchUrl };
})();
(function () {
  'use strict';
  const host = location.hostname.replace(/^www\./, '');
  if (host !== 'searchgal.top') return;
  const params = new URLSearchParams(location.search);
  const KEY_PARAMS = ['s', 'q', 'keyword', 'search', 'wd'];
  let keyword = '';
  for (let i = 0; i < KEY_PARAMS.length; i++) {
    const value = params.get(KEY_PARAMS[i]);
    if (value) { keyword = value; break; }
  }
  if (!keyword) return;
  const INPUT_SELECTOR = 'input[type="search"],input[role="combobox"],input[name="s"],input[name="q"],input[name="keyword"],input[name="search"],input[placeholder*="搜索"],input[placeholder*="Search"],input[placeholder*="search"]';
  let done = false;
  function visible(el) {
    if (!el || !el.getClientRects) return false;
    return el.getClientRects().length > 0;
  }
  function pickInput() {
    const list = document.querySelectorAll(INPUT_SELECTOR);
    for (let i = 0; i < list.length; i++) {
      const el = list[i];
      if (!visible(el) || el.disabled || el.readOnly) continue;
      return el;
    }
    return null;
  }
  function setValue(input, value) {
    const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    if (desc && desc.set) desc.set.call(input, value);
    else input.value = value;
    let sent = false;
    try {
      const InputEv = window.InputEvent || Event;
      input.dispatchEvent(new InputEv('input', { bubbles: true, cancelable: false, data: value, inputType: 'insertText' }));
      sent = true;
    } catch (e) { }
    if (!sent) input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function pressEnter(input) {
    const init = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    input.dispatchEvent(new KeyboardEvent('keydown', init));
    input.dispatchEvent(new KeyboardEvent('keypress', init));
    input.dispatchEvent(new KeyboardEvent('keyup', init));
  }
  function submitForm(input) {
    const form = input.form || input.closest('form');
    if (form) {
      if (typeof form.requestSubmit === 'function') {
        try { form.requestSubmit(); return true; } catch (e) { }
      }
      try { form.submit(); return true; } catch (e) { }
    }
    const scope = form || input.closest('form') || document;
    const btn = scope.querySelector('button[type="submit"],button[aria-label*="搜索"],button[aria-label*="Search"]');
    if (btn) { try { btn.click(); return true; } catch (e) { } }
    return false;
  }
  function attempt() {
    if (done) return true;
    const input = pickInput();
    if (!input) return false;
    if (input.value !== keyword) {
      try { input.focus(); } catch (e) { }
      setValue(input, keyword);
    }
    if (input.value !== keyword) return false;
    const startHref = location.href;
    pressEnter(input);
    done = true;
    setTimeout(function () {
      if (location.href === startHref) submitForm(input);
    }, 500);
    return true;
  }
  if (!attempt()) {
    let ticks = 0;
    const timer = setInterval(function () {
      ticks += 1;
      if (attempt() || ticks >= 50) clearInterval(timer);
    }, 200);
    document.addEventListener('DOMContentLoaded', attempt);
  }
})();
