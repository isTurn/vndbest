// ==UserScript==
// @name         VNDB跨站搜索
// @namespace    http://tampermonkey.net/
// @version      2.5.14
// @description  VNDB跨站搜索，可自选标题或id
// @author       Hatsube
// @match        https://vndb.org/*
// @match        https://www.vndb.org/*
// @match        https://touchgal.ink/search*
// @match        https://www.touchgal.ink/search*
// @match        https://seiya-saiga.com/*
// @match        https://www.seiya-saiga.com/*
// @match        https://bbs.kfpromax.com/*
// @grant        none
// @run-at       document-idle
// @noframes
// @license      MIT
// @downloadURL  https://update.sleazyfork.org/scripts/600569/VNDB%E8%B7%A8%E7%AB%99%E6%90%9C%E7%B4%A2.user.js
// @updateURL    https://update.sleazyfork.org/scripts/600569/VNDB%E8%B7%A8%E7%AB%99%E6%90%9C%E7%B4%A2.meta.js
// ==/UserScript==

(function () {
    'use strict';

    /* ================= 常量 ================= */

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

    /* ================= 站点表 =================
     * url(keyword) → 用当前关键词拼出的搜索直达链接
     * group        → 分组（见 GROUPS）
     */
    const GROUPS = [
        { key: 'res', label: '资源站' },
        { key: 'guide', label: '攻略存档补丁' },
        { key: 'db', label: '数据库' },
        { key: 'adult', label: '社区 / 18+' }
    ];

    const SITES = [
        /* —— 资源站 —— */
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

        /* —— 数据库 —— */
        { key: 'vndb', name: 'VNDB', group: 'db', url: k => 'https://vndb.org/v?sq=' + enc(k) },
        { key: 'bangumi', name: 'bangumi', group: 'db', url: k => 'https://bangumi.tv/subject_search/' + enc(k) + '?cat=4' },
        { key: 'erogame', name: '批评空间', group: 'db', url: k => 'https://erogamescape.org/~ap2/ero/toukei_kaiseki/kensaku.php?category=game&word_category=name&mode=normal&word=' + enc(k) },
        { key: 'ymgal', name: '月幕', group: 'db', url: k => 'https://www.ymgal.games/search?type=article&keyword=' + enc(k) },
        { key: 'koko', name: 'kyara', group: 'db', url: k => 'https://koko.kyara.top/kensaku.php?category=game&word_category=name&mode=normal&word=' + enc(k) },
        { key: 'moepedia', name: 'Moepedia', group: 'db', url: k => 'https://moepedia.net/search/result/?s=' + enc(k) },
        { key: 'vgmdb', name: 'VGMdb', group: 'db', url: k => 'https://vgmdb.net/search?q=' + enc(k) },
        { key: 'bishogedb', name: 'Bishogedb', group: 'db', url: k => 'https://bishogedb.com/search?q=' + enc(k) },

        /* —— 攻略存档补丁 —— */
        { key: 'seiya', name: '誠也の部屋', group: 'guide', url: k => 'https://seiya-saiga.com/game/kouryaku.html?search=' + enc(k) },
        { key: 'seiyasave', name: '誠也存档', group: 'guide', url: k => 'https://seiya-saiga.com/save.html?cgsearch=' + enc(k) },
        { key: 'sagaoz', name: 'Sagaoz攻略', group: 'guide', url: k => 'https://sagaoz.net/foolmaker/game.html?cgsearch=' + enc(k) },
        { key: '2dfan', name: '2DFan', group: 'guide', url: k => 'https://2dfan.com/subjects/search?keyword=' + enc(k) },
        { key: 'ai2', name: 'Ai2', group: 'guide', url: k => 'https://www.ai2.moe/search/?q=' + enc(k) },
        { key: 'moyu', name: 'Moyu', group: 'guide', url: k => 'https://www.moyu.moe/search?q=' + enc(k) },

        /* —— 社区 / 18+ —— */
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

    /* ================= 样式================= */

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

    /* ================= 标题收集 ================= */

    function getVnId() {
        const m = path.match(/^\/v(\d+)(?:\/|$)/);
        return m ? m[1] : null;
    }

    /** 取 VNDB 主标题（罗马字/英文名），优先 og:title，其次正文 h1，再退到 document.title */
    function getMainTitle() {
        const og = document.querySelector('meta[property="og:title"]');
        if (og && og.content && og.content.trim()) return og.content.trim();
        const h1 = document.querySelector('main article h1');
        if (h1 && h1.textContent.trim()) return h1.textContent.trim();
        return document.title.replace(/\s*\|\s*vndb\s*$/i, '').trim();
    }

    /** 本身就是拉丁文字的语言（英文、西班牙文…），其拉丁文字不算「罗马字转写」 */
    const LATIN_LANGS = /^(?:en|es|pt|fr|de|it|nl|pl|tr|vi|id|la|eo|ca|sv|fi|cs|sk|hu|ro)(?:-|$)/i;

    /** 判断一段文字是「原文」还是「罗马字/拼音转写」：
     *  VNDB 的标题行形如 <td><span lang="ja">常世の星空</span><br />Tokoyo no Hoshizora</td>，
     *  第二段是罗马字转写，不能标成 ja。 */
    function scriptLang(text, rowLang) {
        if (!rowLang) return '';
        const hasNative = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\u0400-\u052f]/.test(text);
        if (hasNative) return rowLang;
        if (/^ja/i.test(rowLang)) return 'ja-Latn';
        if (LATIN_LANGS.test(rowLang)) return rowLang;
        return rowLang + '-Latn';
    }

    /** 收集该游戏的全部标题（主标题、原文/别名、各语言标题及罗马字转写） */
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

        // 日文原名 / 各语言标题 / 别名先收集，主标题最后定性（见函数末尾）

        const alt = document.querySelector('h2.alttitle');
        if (alt) {
            const altText = alt.textContent.trim();
            add(altText, scriptLang(altText, alt.getAttribute('lang') || 'ja'));
        }

        // 别名行：CLANNAD / STEINS;GATE / DINGIR 这类主标题是拉丁字的游戏，
        // 日文名（クラナド、シュタインズ・ゲート、ディンギル）只出现在这里
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
        // 含假名的别名＝日文名，优先；其余别名放到各语言标题之后
        const isKana = function (t) { return /[\u3040-\u30ff]/.test(t); };
        aliasTexts.filter(isKana).forEach(function (t) { add(t, 'ja'); });

        document.querySelectorAll('tr.title').forEach(function (row) {
            const td = row.querySelector('td:last-child');
            if (!td) return;
            const abbr = row.querySelector('abbr[class*="icon-lang-"]');
            const rowLang = abbr ? ((abbr.className.match(/icon-lang-([a-zA-Z-]+)/) || [])[1] || '') : '';
            const span = td.querySelector('span');
            const spanText = span ? span.textContent.trim() : '';
            // 第一段（span）的语言以 span 自己的 lang 属性为准，但仍要判断它是不是罗马字
            if (spanText) add(spanText, scriptLang(spanText, span.getAttribute('lang') || rowLang));
            if (spanText) {
                const rest = td.textContent.replace(spanText, '').trim();
                if (rest) add(rest, scriptLang(rest, rowLang));
            }
        });

        aliasTexts.filter(function (t) { return !/[\u3040-\u30ff]/.test(t); }).forEach(function (t) { add(t, 'alias'); });

        // 主标题定性：页面存在日文原名（ja）时，主标题本身也是日文标题（罗马字写法），标 ja；
        // 否则（主标题是英文/原文）标「主标题」。主标题固定放在第一位。
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

    /* ================= 浮层 ================= */

    function buildPanel(vnId, titles) {
        ensureStyle();

        // 默认搜索用日文原文（ja 且含假名/汉字）；没有日文原文时退回第一个 ja，再退回主标题
        const isJa = function (t) { return t.lang === 'ja'; };
        const hasJaScript = function (t) { return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(t.text); };
        const defaultEntry = titles.find(function (t) { return isJa(t) && hasJaScript(t); })
            || titles.find(isJa)
            || titles[0] || { text: '', lang: '' };
        const defaultTitle = defaultEntry.text;
        // 部分站点（如量子ACG）只索引中文/罗马字标题，搜日文原名会无结果：
        // 预先挑一个中文标题（优先 zh-Hans 标注，其次含汉字且不含假名的标题）
        const zhEntry = titles.find(function (t) { return /^zh-Hans/i.test(t.lang); })
            || titles.find(function (t) { return /^zh/i.test(t.lang) && !/[\u3040-\u30ff]/.test(t.text); })
            || titles.find(function (t) { return /[\u4e00-\u9fff]/.test(t.text) && !/[\u3040-\u30ff]/.test(t.text); })
            || null;
        const zhTitle = zhEntry ? zhEntry.text : '';
        // chips 第一个就是默认标题，点它可以切回来；其余标题最多再显示 8 个
        const otherTitles = titles.filter(function (t) { return t.text !== defaultTitle; }).slice(0, 8);
        const chipTitles = defaultTitle ? [defaultEntry].concat(otherTitles) : otherTitles;

        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.classList.add('collapsed'); // 默认折叠，点标题栏展开
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

        /* ---- 状态与联动 ---- */

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
                // 默认标题 chip 在「没挑别的标题」时高亮，方便一眼看出当前用的是哪个
                const active = mode === MODE_TITLE && (title === defaultTitle ? !pickedTitle : pickedTitle === title);
                chip.classList.toggle('active', active);
            });
            siteLinks.forEach(function (link) {
                const site = SITES.find(function (s) { return s.key === link.getAttribute('data-site'); });
                if (!site) return;
                // 站点关键词偏好：未手动挑选标题时，kw='zh' 的站点改用中文标题搜索
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

    /* ================= 搜索页：关键词高亮 + 自动提交（誠也の部屋 / 绯月） ================= */

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

    /* ================= 入口 ================= */

    if (host === 'vndb.org' && /^\/v\d+(?:\/|$)/.test(path)) {
        initVndbPanel();
        // VNDB 为多页应用，监听路径变化后重建面板（兜底）
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

    // 调试用：控制台可调用 window.__VNDB_JUMP__.collectTitles() 查看收集到的标题
    window.__VNDB_JUMP__ = {
        getVnId: getVnId,
        collectTitles: collectTitles
    };
})();
(function () {
  'use strict';

  /* ================= 可配置项 ================= */

  /** TouchGal 站点 Origin（打不开时换成镜像，注意保留 https:// 和 Host，不带结尾斜杠） */
  const TOUCHGAL_ORIGIN = 'https://www.touchgal.ink';
  /** TouchGal 搜索页路径 */
  const TG_SEARCH_PATH = '/search';
  /** 深链参数名：VNDB 侧生成、TouchGal 侧消费 */
  const TG_QUERY_PARAM = 'tgq';

  /** 等待 React hydrate 的最长时间（毫秒） */
  const REACT_READY_TIMEOUT = 6000;
  /** 每次填入后等待 React 状态更新的时间（毫秒） */
  const INPUT_SETTLE_MS = 300;
  /** 每次回车后等待搜索请求发出的时间（毫秒） */
  const SEARCH_WATCH_MS = 1400;
  /** 自动填入最大尝试次数 */
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

  /* ================= TouchGal 侧：自动填入并搜索 ================= */

  /** TouchGal 搜索页的输入框（来自其前端组件 input[role=combobox][aria-label=搜索 Galgame]） */
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

  /** 搜索是否已真正触发的信号：页面上出现关键词 chip，或收到了 /search 请求 */
  function tgWatchSuccess(startedRef) {
    if (typeof PerformanceObserver === 'undefined') return;
    try {
      const po = new PerformanceObserver(function (list) {
        for (let i = 0; i < list.getEntries().length; i++) {
          const entry = list.getEntries()[i];
          const name = entry.name || '';
          // 只认站内搜索 API 的 fetch/XHR，排除 Next.js 自身的 RSC 预取（带 _rsc）
          if (name.indexOf('/search') !== -1 && name.indexOf('_rsc') === -1 &&
              (entry.initiatorType === 'fetch' || entry.initiatorType === 'xmlhttprequest')) {
            startedRef.ok = true;
          }
        }
      });
      po.observe({ type: 'resource', buffered: false });
    } catch (e) { /* 忽略：还有 chip 检测兜底 */ }
  }

  function tgHasChip() {
    // 站内关键词 chip 的关闭按钮 aria-label 为 "close chip"
    return !!document.querySelector('[aria-label="close chip"]');
  }

  function tgSetInputValue(input, keyword) {
    // React 受控输入框：必须用原型上的原生 value setter 赋值，再派发 input 事件
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

    // 等一拍让 React 状态更新，再校验值是否保住了（hydrate 竞态下会被重置）
    setTimeout(function () {
      if (input.value !== keyword) {
        if (attempt < MAX_ATTEMPTS) return tgFillAndSubmit(input, keyword, attempt + 1);
        return tgApiFallback(keyword);
      }
      tgPressEnter(input);
      // 回车后观察：chip 生成或 /search 请求发出即算成功
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

  /** 兜底：直接调用 TouchGal 站内搜索 API（同源，无跨域问题）并渲染结果列表 */
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

  /** 等搜索框出现，并等 React 真正挂载（DOM 节点出现 __react* 内部键）后再动手 */
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
        // hydrate 完成，再给事件系统一点稳定时间
        setTimeout(cb, 350);
        return;
      }
      if (waited >= REACT_READY_TIMEOUT) {
        // 一直没检测到（极端情况：读不到内部键或 hydrate 失败），仍然尝试一次
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

  /* ================= 入口 ================= */

  if (host === 'touchgal.ink' && path.indexOf(TG_SEARCH_PATH) === 0) {
    initTouchgalSearch();
  }

  // 调试用：控制台可调用 window.__VNDB_TG__.tgSearchUrl('xxx') 查看生成的链接
  window.__VNDB_TG__ = { tgSearchUrl: tgSearchUrl };
})();
