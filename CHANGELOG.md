# 更新日志

本文件记录本 fork（[isTurn/vndbest](https://github.com/isTurn/vndbest)）相对上游的功能演进。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.11] - 2026-10-23

分类浏览改成两列并去掉多余小字，性别图标换成能一眼分辨的 ♀ / ♂ / ⚥，以图搜作品新增 SearchBox 识别源、可在搜索页直接选图、结果页可全屏看大图。

### 新增

- **SearchBox 识别源**：`src/utils/searchboxSearch.js` 接入 `https://api.searchbox.club/ai/chat`（该站前端在 www.searchbox.club，真实后端是 api. 域）。请求体为 JSON，`images` 里放 base64 dataURL，最长边压到 1024、JPEG 0.85，受接口 `imageBase64Chars` 上限约束。响应是 NDJSON 逐行事件（`status` / `block` / `delta` / `error`），用流式 reader 按行切分解析：`block.kind === 'image'` 归为角色候选，`block.kind === 'media'` 里命中 `vndb.org/vNNN` 的归为作品条目，`delta` 拼成整段说明文字。识别页顶部可切换 `AnimeTrace` / `SearchBox`，选择存 `localStorage['vndb_image_search_source']`
- **SearchBox 结果分区**：VNDB 匹配（封面 / 标题 / 原名 + 年份评分 / tag 胶囊，点击进 `/vn/:id`）、识别到的角色、AI 说明正文；识别中遮罩显示服务端下发的进度文案
- **搜索页直接选图**：`Library.vue` 的「以图搜作品」入口改为直接 `click()` 隐藏的 `<input type="file">`，选完把文件塞进 `pendingSharedImage` 再跳 `/browse/image`，省掉先进空页面再点一次的步骤
- **全屏看大图**：`ImageSearch.vue` 预览图加 `cursor-zoom-in`，点击后用 `Teleport` 打开黑底大图层，点任意处或右上关闭

### 变更

- **分类浏览两列**：`Library.vue` 的 `libraryItems` 网格从 `grid-cols-1 sm:grid-cols-2` 固定为 `grid-cols-2`，卡片由竖排居中改为左图标右标题（`flex items-center gap-3`，图标容器 h-10 w-10、图标 h-5 w-5，标题加 `truncate`）
- **去掉「查看 X 列表」小字**：分类卡片不再渲染 `t('library.view_list', ...)` 与右侧 chevron；i18n 键保留未删
- **二级页去掉副标题**：7 个搜索页与 `SearchBase.vue` 不再给 `AppHeader` 传 `:subtitle="t('search.subtitle', ...)"`
- **角色排到人物前**：顺序改为 作品 / 版本 / 角色 / 人物 / 标签 / 特征
- **性别图标重绘**：`lucide` 图标集里没有 ♀ / ♂ / ⚥，原来借用 `circle` / `circle-dot` / `badge`，小尺寸几乎不可分辨。新增 `src/icons/gender-icons.js` 自绘 24×24 stroke SVG，注册名 `vndb:venus` / `vndb:mars` / `vndb:venus-mars`，替换 `icon-names.js` 里原有的三个映射
- **性别配色**：女=粉（`pink-500` 系）、男=蓝（`blue-400` 系）、双性=红（`red-500` 系），三处 `getSexClass`（`CharacterDetail` / `CharacterSearch` / `TraitDetail`）统一

### 修复

- **识别超时显示英文原文**：`imageSearch.js` 的 `AbortController` 超时抛的是 `AbortError`（message 为 `signal is aborted without reason`），原来不满足 `isNetworkLayerError` 判定，既没本地化也没走原生重试。现在 `AbortError` 转为 `image_search.error_timeout`，并把该情况纳入 `CapacitorHttp` 重试条件——实测部分设备 WebView 的 fetch 连不上识别接口，但系统网络本身通，原生请求能拿到结果

## [1.0.10] - 2026-10-22

搜索页多了「以图搜作品」——上传截图或插画，识别出作品名后直接给出 VNDB 作品页；别的应用（相册、QQ、文件管理器……）里看到图，也能直接「分享」过来识别。内置浏览器里的下载改为交给 1DM+ / ADM 接管。

### 新增

- **以图搜作品**：底部「搜索」页的搜索框下方新增入口（`src/pages/Library.vue`），跳转 `/browse/image`（`src/pages/ImageSearch.vue`）。选图后先在本地压缩（最长边 1280、JPEG 0.85，`src/utils/imageSearch.js` 的 `prepareImageFile`），再 POST 到 `https://api.animetrace.com/v1/search` 做识别（`is_multi=1`、`ai_detect=1`）；返回的 `data[].character[].work` 按作品名归并、按命中次数排序，每个作品名再用 `getVnList(['search', '=', work], { results: 3 })` 反查 VNDB 条目，列出封面 / 标题 / 原名 / 年份，点击进 `/vn/:id`；没匹配上的作品给「在 VNDB 搜索」入口跳 `/browse/vn?q=`。
- **图片上传走 WebView 原生文件选择器**：用 H5 `<input type="file" accept="image/*" class="sr-only">`（不能用 `hidden` / `display:none`，否则 WebView 里 `click()` 不触发），由 Capacitor 的 `BridgeWebChromeClient.onShowFileChooser` 调起系统相册，未引入相机插件。
- **识别请求双通道**：优先 `fetch` + `FormData`（AnimeTrace 已开 CORS）；只有在原生平台出现网络层错误（`TypeError` / `failed to fetch`）时才回退到 `CapacitorHttp.request` 的 `dataType: 'formData'` + `base64File`。
- **识别错误码映射**：`17701` 图过大、`17702` 服务器繁忙、`17704` 维护中、`17705` 格式不支持、`17708` / `17731` 人物过多、`17724` 非图片文件、`17728` 使用上限，统一映射到 `image_search.error_*` 三语文案，失败时可重试。
- **置信度与 AI 提示**：`box.not_confident` 全为真时标「置信度较低」，`ai: true` 时标「可能是 AI 生成图」。
- **从其他应用分享图片直接以图搜作品**：`AndroidManifest.xml` 新增 `<activity-alias android:name=".ShareImageAlias">`（targetActivity 指向 `MainActivity`，label 单独设成「以图搜作品」，桌面图标仍是 VNDB），注册 `ACTION_SEND` / `ACTION_SEND_MULTIPLE` + `image/*` 两个 filter；系统分享面板里该项显示为「VNDB / 以图搜作品」两行
- **原生侧接住分享的图片**：新增 `android/app/src/main/java/com/vndb/ShareImagePlugin.java`（`@CapacitorPlugin(name = "ShareImage")`）。`handleOnNewIntent()` 只接 `ACTION_SEND` / `ACTION_SEND_MULTIPLE`，把 Intent 副本存在静态 `pendingIntent` 里并用 `notifyListeners("shareImage", ..., true)` 保留事件到监听器注册；`@PluginMethod getPending()` 消费它，在 `getBridge().execute(...)` 里把 `content://` 流复制到 `getCacheDir()/shared-image/shared-<时间戳>.<扩展名>`，返回 `{ path, name, mimeType }`。分享 URI 带的是临时读权限，必须尽快复制到自己的缓存目录，不能在 JS 侧直接长期持有
- **取图位置四路兜底**：`extractFirstUri()` 依次尝试「EXTRA_STREAM 是单个 Uri」「EXTRA_STREAM 是 Uri 列表，取第一张」「Intent 的 data」「ClipData 第一项」。实测 ZUI 分享面板对 `ACTION_SEND_MULTIPLE` 也可能只塞单个 Uri，不能按 action 死取
- **JS 侧接收与跳转**：新增 `src/utils/sharedImage.js`（`pendingSharedImage` ref、`consumeSharedImage()`、`installSharedImageWatcher(router)`）。三条触发路径互为保险——原生 `shareImage` 事件（热启动）、`@capacitor/app` 的 `appStateChange` 回前台再拉一次（事件丢失兜底）、`router.isReady()` 后拉一次（冷启动）。取到后用 `Capacitor.convertFileSrc()` + `fetch` 转成 `File`，`router.push('/browse/image')`
- **页面自动开跑**：`src/pages/ImageSearch.vue` 加 `watch(pendingSharedImage, takeSharedImage)` + `onMounted(takeSharedImage)`，取走文件后立刻清空 ref，避免返回本页时重跑；直接调用已有的 `runSearch(file)`

### 变更

- **内置浏览器下载交给下载管理器**：`scripts/patch-inappbrowser.cjs` 新增两处补丁（独立标记 `[vndbest patch:download]` / `[vndbest patch:download-route]`）——把 `WebViewDialog.java` 里原本被 `if (_options.getHandleDownloads())` 包住的 `setDownloadListener` 改为无条件注册；新增 `routeDownloadToExternalApp()`，下载时优先用显式组件 `Intent(ACTION_VIEW)` + `setClassName("idm.internet.download.manager.plus", "idm.internet.download.manager.UrlHandlerDownloader")` 交给 1DM+，失败再按 `DOWNLOAD_MANAGER_PACKAGES`（`idm.internet.download.manager.plus` / `idm.internet.download.manager` / `com.dv.adm.pay` / `com.dv.adm`）用 `setPackage` 逐个试，仍不行则按 `handleDownloads` 开关决定是否由插件自己落盘，最后退回系统 `ACTION_VIEW`。这样内置浏览器里的下载行为与「检查更新」的 APK 下载一致。
- **下载管理器包可见性声明**：`android/app/src/main/AndroidManifest.xml` 的 `<queries>` 补上上述 4 个下载器包名（Android 11+ 不声明就无法定位到对应组件）。
- **补丁脚本支持逐补丁标记**：`patchOne()` 新增 `marker` 参数（默认仍是全局 `[vndbest patch]`），避免同一个 `WebViewDialog.java` 里的后续补丁被「整文件已含 MARKER」直接跳过。
- **`MainActivity` 注册新插件**：`registerPlugin(ShareImagePlugin.class)` 加在 `super.onCreate(savedInstanceState)` 之前
- **分享入口的本地化文案**：`android/app/src/main/res/values/strings.xml` 新增 `share_image_label` =「以图搜作品」

### 修复

- **内置浏览器点下载没反应**：插件默认不装 `DownloadListener`（`handleDownloads` 默认 false），`Content-Disposition: attachment` 与 `<a download>` 链接会被静默丢弃；补丁 3 无条件注册后不再丢失。
- **分享进来的图片读不到**：`EXTRA_STREAM` 的类型在不同发送方之间并不统一（单个 Uri / Uri 列表），原先按 action 分支取会在对不上的组合上直接返回 null（分享后停在首页、不识别）；改成四路兜底后冷启动与热启动、单图与多图都正常

---

## [1.0.9] - 2026-10-21

顶栏与底部 TabBar 从滚动内容里彻底拆出来，来回拖动时只有中间的内容在动；顺带修掉顶栏压住通知栏的问题，并给评分分布柱状图换成逐档递进的配色。

### 变更

- **顶栏固定在内容之上，不跟随拖动**：顶栏原来渲染在 `ion-content` 里靠 `position: sticky` 贴顶，滚动到底继续下拉时会被弹性位移一起带走。现改为 `ion-page` 的直接子节点（渲染在内容之外），`src/components/AppHeader.vue` 拆成「外层 `.app-header` 承担背景 / 模糊 / 安全区内边距」+「内层 `barClass` 承担居中与排布」两层；拖动、回弹、切页都不再影响它
- **顶栏不再压住通知栏**：`@capacitor/android` 的 `SystemBars` 注入的是 CSS 变量 `--safe-area-inset-top`，而原代码只写了 `env(safe-area-inset-top)`，在 WebView 里取到 0，于是顶栏顶进状态栏。现统一改成 `var(--safe-area-inset-top, env(safe-area-inset-top, 0px))`（`src/style.css` 的 `.app-header` / `.app-header--lg`、`src/App.vue` 的 `.app-tab-bar`）
- **中间内容保留弹性回弹**：新增 `src/utils/elasticScroll.js`，只在 `ion-content` 的 `.inner-scroll` 上做阻尼位移 + 回弹，弹性只作用在中间内容层，顶栏与 TabBar 不动；文档层继续 `overscroll-behavior: none`，避免整幅画面被视口 stretch
- **底部 TabBar 不再被拉伸**：底衬从 `bg-white/80 + backdrop-blur-md` 改成一个不透明纯色子层（`absolute inset-0`），`.app-tab-bar` 加 `translateZ(0)` / `backface-visibility: hidden` 提升为独立合成层，滚动时不再和内容一起重绘
- **原生层关闭 WebView 过度滚动**：`MainActivity.onCreate` 里 `getBridge().getWebView().setOverScrollMode(OVER_SCROLL_NEVER)`，与 CSS 侧双层收敛
- **评分分布柱状图逐档配色**：`VnDetail.vue` 的 5～10 分从三档（≥8 绿、≥5 蓝、其余灰）改为每档独立颜色。不用 Tailwind 的 emerald / teal / cyan 调色板（其亮度阶梯跳跃，8/9/10 拼在一起会有台阶），改用 `hsl()` 自算等亮度差色带：色相每档 −6°（190° → 160°），亮色 S=95% / 暗色 S=90%，按「感知亮度每档 −8」反解亮度，实测相邻两档 ΔL 稳定在 −7.3 ~ −8.6；10 分不再用渐变
- **7 个搜索页自己渲染顶栏**：`VnSearch` / `CharacterSearch` / `ProducerSearch` / `ReleaseSearch` / `StaffSearch` / `TagSearch` / `TraitSearch` 把 `AppHeader` 提到 `ion-content` 之外，并给 `SearchBase` 传 `:show-header="false"`（`SearchBase.vue` 新增 `showHeader` prop）
- **标签 / 特征详情页同步改造**：`TagDetail.vue` / `TraitDetail.vue` 的 `AppHeader` 一并移到 `ion-content` 之外
- **内置浏览器「用外部浏览器打开」按钮改为常驻**：删掉 `vndb_inapp_external_button` 设置项与 `get/setInAppExternalButtonEnabled`，`buildExternalButtonOption()` 不再读开关。遇到 Cloudflare 挑战或站点跳转异常时，这是唯一能把当前页交给系统浏览器的出口，不该被关掉

### 新增

- **语言筛选显示国旗**：新增 `src/components/LanguageFlag.vue`；`BaseSelect.vue` 加 `showLangFlag` prop 与 `flagOf()`（`all` 不显示），当前值与选项前渲染国旗；`VnSearch` / `ReleaseSearch` 传 `show-lang-flag`，`Home.vue` 的语言徽章与搜索结果 badges、`Settings.vue` 的语言列表同步显示
- **作品简介与相关作品整块折叠**：`VnDetail.vue` 新增 `descriptionSectionOpen` / `relationsSectionOpen`（默认 `false`），标题改为带 chevron 的按钮，整块 `v-show` 收起
- **最近浏览开关**：「外观与语言」新增 `vndb_recent_views_enabled`（默认开）。关掉后不再记录新足迹、首页那一栏隐藏，已有历史保留，重新打开即恢复；`useRecentViews` 增加单例 `enabled` 状态，设置页用可写 computed 直连，首页与五个详情页共享同一个 ref

### 修复

- **顶栏与通知栏重叠**：改用 WebView 实际上报的安全区高度（见上文「变更」）
- **下拉回弹时底部按钮栏变形**：TabBar 独立成合成层后不再参与内容重绘
- **标签 / 特征详情页顶栏跟随滚动**：与其余页面统一为固定顶栏结构

---

## [1.0.8] - 2026-10-20

本站内容跳转更闭环：新增「最近浏览」「相似作品」与标签 / 特征详情页。

同一版本还包含 10-19 那批改动：搜索页的分类浏览补上了作品入口，作品图标统一成手柄，跨站搜索脚本同步到上游 v2.8.0（新增 Nysoure / GalZY / SakuGAL 三个资源站，站点数 35 → 38；含此前 v2.7.4 的稻荷迁域、SearchGal 自动补搜索、TouchGal 外链改写）。

### 新增

- **最近浏览**：访问过的作品 / 角色 / 版本 / 会社 / 职员会自动记进首页「最近浏览」横向卡片条（`vndb_recent_views`，最多 30 条，重复访问提到最前，右上角可一键清空）。封面优先用原图，版本没有截图时回退到关联作品封面
- **相似作品**：作品详情页选项卡新增「相似」页签，按共同标签（spoiler ≤ 1）反查其它作品，再按标签重合度与评分排序，最多 20 部；页面标注「按共同标签推荐，仅供参考」
- **标签详情页 `/tag/:id`**：标签中文名、分类徽章（内容 / 技术 / 性内容）、作品数、别名、清理过 BBCode 的简介与翻译按钮，下方接作品列表（排序 / 升降序 / 三种布局 / 触底分页）。此前点标签只会跳去「搜索该标签的作品」，没有落点
- **特征详情页 `/trait/:id`**：特征名、所属分组、角色数、别名、简介与翻译，下方是角色卡片（头像、原名、罗马音、性别图标、触底加载）
- 新增 `src/composables/useRecentViews.js`、`src/pages/TagDetail.vue`、`src/pages/TraitDetail.vue`，`src/api/vndb.js` 增加 `getSimilarVns`
- **搜索页「分类浏览」补上作品入口**：分类卡片原本只有版本 / 会社 / 人物 / 角色 / 标签 / 特征六项，作品得靠首页或全局搜索进；现在「作品」是分类里的第一张卡片，指向 `/browse/vn`，和其余分类同尺寸排列
- **作品页排序可按链接指定**：支持 `?sort=rating&reverse=1` 这样的参数直接落到指定排序（票数 / 相关度 / 评分 / 发售日 / 标题，升降序）；排序本身不做记忆，每次从分类卡进来仍是默认的票数倒序
- **SearchGal 搜索自动补一次回车**：SearchGal 会读 `?s=` 把关键词填进搜索框，但**不会自己发起搜索**，页面停在空白结果（已核对站点 bundle：`?s=` 只赋值给搜索框的 ref）。新增 `src/utils/siteSearchInject.js`，内置浏览器加载完 `searchgal.top` 后注入「填值 + 回车 + 兜底提交表单」，与用户脚本 v2.7.4 的 searchgal 分支等价
- **跨站搜索新增三个资源站**：Nysoure（`/search?keyword=`）、GalZY（`/games?q=`）、SakuGAL（`/search/<关键词>/`），三站都支持 URL 直接带关键词、服务端渲染结果，不需要注入脚本。资源站从 12 个增到 15 个

### 变更

- **作品图标统一为 `lucide:gamepad-2`**：分类卡、全局搜索的「作品」分组头、作品搜索页页头三处从 `lucide:file-text` 换成手柄，与 `SEARCH_TYPE_ICONS.vn` / `PLACEHOLDER_ICONS.vn` 的既有约定一致；`file-text` 只留给「列表 / 简介」这类语义
- **跨站搜索用户脚本同步到 v2.8.0**：`VNDB跨站搜索.js` 从 v2.6.1 一路升到 v2.8.0（v2.7.4 为 +347 / −98 行，v2.8.0 再新增三个资源站），站点表与 App 侧完全一致
- **「关于」的第三方脚本版本号更新**：VNDB跨站搜索 v2.6.1 → v2.8.0；源码注释里的旧版本号同步（`touchgalSearch.js`、`VnDetail.vue`、`redirectSkip.js`、`siteSearchInject.js`）

### 修复

- **标签详情页排序会 400**：`/vn` 端点不支持 `length` / `lastmod` / `added` 排序，选项只保留 `rating` / `votecount` / `released` / `title`
- **版本详情的最近浏览卡片是空白灰块**：原来只认 `images[0]`，改用 `getReleaseImageUrl` 回退到关联作品封面
- **稻荷在应用内打不开**：站点已从 `amoebi.com` 迁到 `inarigal.com`（旧域 301），且新域支持 `?search=` 直接出结果页；应用内 URL 已改到新域并带上关键词
- **「忧郁的弟弟」条目点了报证书错误**：`ttloli.com` 证书已过期（`CERT_HAS_EXPIRED`），用户脚本 v2.7.4 也已移除该站，应用内一并删除
- **TouchGal 外链仍可能落到过渡页**：补上 v2.7.4 的 `rewriteRedirectLinks`——把中转链接的 `href` 直接改写成真实地址（MutationObserver 跟踪动态节点），这样即使站点的 JS 抢走点击、或用户长按 / 键盘打开，`href` 本身也已是真实地址，不会再进等待页；轮询从 240 次降到 160 次，`hasWaitMarker` 加 800ms 缓存避免每 50ms 读一遍 body
- **鲲galgame 关键词参数不对**：从 `?q=` 改回 `?keywords=`，与站点实际参数一致
- **GalZY 一度被怀疑不消费 `?q=`**：核对站点 bundle 后确认 `/games` 用 `validateSearch` 声明了 `q` 字段并把它传给服务端 loader（无关关键词会返回「没有找到」），所以直接拼 URL 即可

---

---

---

## [1.0.7] - 2026-10-19

内置浏览器跳转增强版：工具栏上多了「用外部浏览器打开」按钮，TouchGal 外链中转页（广告 / 5 秒等待）会自动跳过，跨站搜索脚本同步到上游 v2.6.1。

### 新增

- **内置浏览器工具栏「用外部浏览器打开」**：右上角一键把当前页交给系统浏览器，位置和前进 / 后退 / 刷新同一行（不是悬浮球）。遵守「设置 → 跳转」里的自选浏览器 / 每次询问规则；地址跟踪包含站内无刷新跳转，按钮可单独关闭
- **TouchGal 专用开关**：「设置 → 跳转」里新增，**默认开启**；打开后不管「跨站搜索打开方式」怎么设，TouchGal 一律用内置浏览器打开，等页面正常加载后再决定是否转外部浏览器（只有手动关掉才会走外部浏览器）
- 为上述按钮放开 `@capgo/inappbrowser` 的两处原生限制（`scripts/patch-inappbrowser.cjs`，幂等，`postinstall` 与 CI 各跑一次）
- **TouchGal 过渡页自动跳过**：在 TouchGal 点外链会先进「即将离开本站…5 秒」的中转页，现在会直接跳过。两层机制：①在 TouchGal 页面里点外链时**先**把 `href` 解析成真实地址并直接跳转，根本不进中转页（绝大多数场景走这条）；②已经落到中转页时立刻解析 `url` / `target` / `go` 等参数、`meta refresh` 与「继续访问」链接并 `location.replace` 跳走，不再干等。新增 `src/utils/redirectSkip.js`，在 `main.js` 挂载一次，只在 `touchgal.ink` / `touchgal.top` 上注入

### 变更

- **跨站搜索用户脚本同步到 v2.6.1**：`VNDB跨站搜索.js` 从 v2.5.14 升级，`@run-at` 改为 `document-start`、`@match` 扩大到 TouchGal 全站，新增外链跳转页自动跳过等待（解析 `url` / `target` / `go` 等参数、`meta refresh` 与「继续访问」链接）；站点表 41 项未变，应用内跨站搜索的站点数据不受影响
- **「关于」的第三方脚本版本号更新**：VNDB跨站搜索从 v2.5.14 更正为 v2.6.1（列表仍只保留原有的三个脚本，过渡页跳过作为应用内置能力呈现）
- `scripts/build-vndb-translator.cjs` 的 banner 版本号改为从源脚本的 `@version` 读取，不再写死（此前写死 v5.0.1 / v5.0.0，容易与实际脚本脱节）；源码注释里的过时版本号同步（`touchgalSearch.js` v2.5.6 → v2.6.1、`VnDetail.vue` v2.5.14 → v2.6.1）
- README 的内置浏览器章节补充工具栏按钮、TouchGal 开关与过渡页跳过

### 移除

- **匿名使用统计上报**：此前每次启动会向第三方 Worker（`workers.hekinyan.vip/v1/active`）POST 安装 ID、设备型号、系统版本、UA 等信息，且没有开关。现已彻底删除上报逻辑与相关常量，`vndb_install_id`、`vndb_active_report_date` 两个 `localStorage` 键也不再写入。应用不再有任何联网行为发生在 VNDB API 之外

### 修复

- **工具栏按钮图标被资源裁剪删除**：`ic_open_external` 只在运行时用 `getIdentifier()` 按名字查找，`shrinkResources` 会当成无用资源删掉，导致按钮不显示；新增 `res/raw/keep.xml` 白名单
- **内置浏览器点 TouchGal 外链仍要等 5 秒**：此前只移植了跨站搜索脚本的「搜索填入」分支，缺失 `initRedirectSkip()`，过渡页跳过逻辑完全没有；现已补齐

### 文档

- README 补齐 1.0.5 / 1.0.6 新增功能的说明：评分统计选项卡、收藏状态图标与配色、会社关联会社、版本语言旗帜与折叠分组、游玩时长投票回填与「大家的投票」、两级缓存
- README 新增**隐私**章节，逐项列出应用会连接的服务与触发时机
- README「从旧版升级」补充签名变更说明（1.0.5 及更早的 APK 由 CI 临时密钥签名，升级到 1.0.6+ 需先卸载）
- 截图重拍并新增两张：搜索历史、版本列表；`docs/screenshots/README.md` 补充拍摄脚本骨架与五条踩坑记录

---

## [1.0.6] - 2026-10-19

签名对齐修复版。1.0.5 虽然把 keystore 放进了仓库，但 CI 实际仍用 runner 自带的 `~/.android/debug.keystore` 签名，发布包的证书指纹与本地包不同。本版把 CI 的签名来源改成显式指定仓库内 keystore，并让构建在指纹不符时直接失败。

> 升级提示：1.0.5 的发布包（CI 签名）与本版签名不同，从 1.0.5 升级到本版需先卸载旧应用（本地数据不迁移）。

### 修复

- **CI 产物与本地产物签名不一致**：`release.yml` 不再依赖 `signingConfigs.debug` 的默认行为，改为把 `ANDROID_KEYSTORE_PATH` 指向仓库内 `android/app/debug.keystore`（同时注入口令与别名），走 `signingConfigs.release` 分支
- CI 构建前打印 `gradlew :app:signingReport`，日志里可直接看到实际使用的 keystore 路径与证书 SHA-256
- CI 在 `apksigner verify --print-certs` 后强制比对证书 SHA-256（期望 `d4a228ca…ef76e`），不一致则 `::error::` 并让任务失败，避免再发出签名不符的包；比对结果写入 `signature.txt` 一并上传为制品

---

## [1.0.5] - 2026-10-19

签名统一版本：从本版起，本地构建与 GitHub Actions 产出的 APK 使用同一份随仓库携带的 keystore，可互相覆盖安装。此前 1.0.4 的 APK 由 CI runner 临时的 debug 密钥签名，私钥无法复现，因此从 1.0.4 升级到本版需要先卸载。

### 新增

- **错误态与空态分离**：此前 7 个搜索页在网络失败时静默吞掉错误，界面显示成「查无此项」，用户无法区分「没搜到」和「网络挂了」。现在统一渲染 `ErrorState` 组件，给出本地化文案与重试按钮
- **骨架屏**：列表页与详情页加载时显示 `SkeletonCard`，替代空白等待
- **游玩时长投票**：改为应用内弹窗（`LengthVoteModal`）填写，直接同步到 VNDB，不再跳外部网页；打开前会先读取你在 VNDB 上已有的投票记录并回填；新增「大家的投票」页签，可查看其他人的时长、速度与备注
- **语言旗帜**：版本与作品的语言用国旗 SVG 标识（66 面），替代纯文字
- **会社页**：关联会社弹卡与简介折叠
- **列表卡片显示自己的评分与游玩时长**，会社「开发作品」与游戏「相关作品」还会显示你的收藏状态（在玩 / 已通关 / 想玩…）
- **收藏状态图标**：每种状态配一个语义化 lucide 图标（游玩中 `play`、已通关 `check-circle`、搁置中 `pause`、已弃坑 `x-circle`、想玩 `star`、黑名单 `ban`、已评分 `award`），列表、瀑布流、紧凑列表、标签选项卡与详情页统一
- **设置页**新增「刷新我的游玩时长」，一次性把 VNDB 上的投票记录同步到本地
- **游戏详情页新增「统计」选项卡**：评分分布横向柱状图（高分在上）、票数 / 平均分 / 中位数 / 排名与最近投票。Kana API 不提供评分数据，改为在内置 WebView 里解析 vndb.org 的作品页（`article#stats` 与 `table.votegraph`），结果本地缓存 6 小时
- **仪表盘**「VNDB 平台数据概览」压缩为小框布局，分类名左对齐，减少纵向占位
- **游戏详情页**「相关作品」默认使用带封面的列表布局
- **搜索历史**：「搜索」页输入框下方展示最近 20 条搜索关键词（`vndb_search_history`），点击即填入并搜索、可单条删除、可「清除全部」；历史为空时整块隐藏
- **版本封面回退到关联作品**：免费 / 补丁 / 同人等大量 release 自身没有封面（`images` 为空数组），列表里原本只显示包裹占位图标，看起来像图片加载失败。现在回退取关联作品 `vns[0].image`，详情页大封面同样生效
- **固定签名**：工程内自带 `android/app/debug.keystore`，本地构建与 CI 的 APK 签名一致，可互相覆盖安装

### 变更

- **图片预热并发 3 → 6**：实测 t.vndb.org 串行约 38 KB/s、3 并发 130 KB/s、6 并发约 245 KB/s 为吞吐峰值（12 并发反而掉速）；同时去掉 `t.vndb.org` preconnect 上的 `crossorigin`（图片是 no-cors 请求，带该属性会另建一条 CORS 连接，等于白连一次）
- **release 包开启 R8 混淆与资源裁剪**：APK 从 7.67 MB 降到 3.21 MB（**-58.2%**），`classes.dex` 从 11.67 MB（3 个）降到 1.95 MB（1 个）
- **移除三个未使用的原生插件**（`@capacitor/filesystem`、`@capacitor/haptics`、`@capacitor/keyboard`），插件数 6 → 3
- 跨站搜索站点表对齐上游脚本 v2.5.14
- 版本列表的标题改为「原文 / 汉字在上、罗马音 / 英文在下」
- **版本按语言折叠分组**：折叠栏优先显示中文，排序仍为日语优先、中文其次
- 详情页选项卡之间的间距调整为 15px
- **设置页隐私与过滤、语言选择改为切换按钮**，与外观主题的选择控件保持一致
- **收藏标签图标配独立颜色**（游玩中绿 / 已通关蓝 / 搁置中琥珀 / 已弃坑灰 / 想玩紫 / 黑名单红 / 已评分琥珀），列表、瀑布流、紧凑列表、标签页与详情页弹层统一

### 修复

- **跨站搜索在平板上溢出屏幕**、手机上「游戏名」按钮折行（flex 子项 `min-width: auto` 撑破容器）
- **跳转设置里的浏览器切换失效**：跨站搜索与版本外链的打开方式现在真正独立生效
- 版本详情页标题与别名顺序颠倒
- 标签与筛选控件的字号因无层 CSS 规则被覆盖而失效
- 列表卡片的额外标签此前一律渲染书签图标，现按标签类型取图标
- 详情页编辑弹窗里自定义标签的兜底图标混用了 Solar 图标集，统一为 lucide
- **设置页「VNDB 页面中文化」开关的圆点跑到轨道外**：圆点用 `position:absolute` 却没给 `left`，浏览器按按钮的默认 `text-align:center` 定位（约 12px），再叠加 `translate-x-[22px]` 后右边缘约 52px，超出 44px 宽的轨道；改为 `left-0.5` 锚定 + `translate-x-[20px]`
- **截图大图查看器打开时会从第一张快速翻页到目标张**：容器带 `scroll-smooth`，CSS `scroll-behavior:smooth` 对直接赋值 `scrollLeft` 同样生效；且弹层刚挂载时 `clientWidth` 可能为 0，导致首次定位停在第一张。改为瞬时定位 + 容器宽度未就绪时按帧重试

---

## [1.0.3] - 2026-10-17

首个由本 fork 发布的版本。

### 新增

- **跨站搜索**：作品详情页内置 36 个 Galgame 站点的搜索入口，分资源站 / 攻略站 / 数据库 / 社区 18+ 四组，支持按标题与按编号两种模式
- **内置浏览器**：基于 `@capgo/inappbrowser`，支持登录态持久化（`CookieKeeper` 原生插件）、VNDB 页面自动中文化、首屏加载失败自动重试
- **全局搜索**：一次并发查询多个分类，支持中文作品名（先用 `search` 命中 VN，再用 VN id 反查角色与职员）
- **跳转设置**：跨站搜索与版本外链的浏览器打开方式可分别配置
- 收藏标签中文化、年龄分级彩色标识、深浅色主题、中 / 英 / 日 三语言界面

### 修复

- 描述 BBCode 未转义导致的 XSS
- i18n 键断链、路由缺少 catch-all
- 图片加载优化：缩略图优先 + 低并发预热队列 + 超时回退原图

---

## 更早

`v1.0.3` 之前的开发历史见上游仓库 [Cyancat000/vndbest](https://github.com/Cyancat000/vndbest)。