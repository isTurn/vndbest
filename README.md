# VNDBest

[![Build and Release APK](https://github.com/isTurn/vndbest/actions/workflows/release.yml/badge.svg)](https://github.com/isTurn/vndbest/actions/workflows/release.yml)
[![Version](https://img.shields.io/badge/version-1.0.3-blue.svg)](https://github.com/isTurn/vndbest/releases)
[![Platform](https://img.shields.io/badge/platform-Android-3DDC84.svg)](https://www.android.com/)
[![Vue](https://img.shields.io/badge/Vue-3.5-42b883.svg)](https://vuejs.org/)
[![Capacitor](https://img.shields.io/badge/Capacitor-8-119EFF.svg)](https://capacitorjs.com/)

VNDB（Visual Novel Database）的 Android 第三方客户端。基于 **Vue 3 + Vite + Ionic Vue + Capacitor** 构建，针对手机端浏览体验做了大量优化，并集成了跨站搜索、站内中文化、登录态持久化等增强功能。

> 本项目 fork 自 [Cyancat000/vndbest](https://github.com/Cyancat000/vndbest)，由 [isTurn](https://github.com/isTurn) 与 [Hatube01](https://github.com/Hatube01) 继续完善与发布。

---

## 功能

### 数据浏览

- **作品（VN）**：封面、简介、标签、角色、职员、版本、评分分布、游玩时长
- **角色**：立绘、特征、出演作品、生日
- **会社 / 职员**：作品列表、参与角色
- **版本（Release）**：发售日期、平台、语言、外部链接
- 六个维度的搜索页（作品 / 版本 / 角色 / 职员 / 会社 / 标签），支持标签与特征的多级筛选、剧透等级过滤、性内容过滤

### 全局搜索

在「搜索」页输入任意关键词（**支持中文作品名**），一次并发查询六个分类：

| 分组 | 说明 |
| --- | --- |
| 作品 | 命中 VN 本体，带评分与时长 |
| 版本 | 该作品的各平台发行版本 |
| 会社 | 开发商 / 发行商 |
| 角色 | 该作品的角色（与直接命中的角色合并去重） |
| 职员 | 该作品的制作人员（与直接命中的职员合并去重） |

中文名搜索通过「先用 `search` 命中 VN，再用 VN id 反查角色 / 职员」两层查询实现，因此「幸福噩梦」这类中文译名也能定位到 `v10957` 及其会社。

### 跨站搜索

作品详情页内置 **37 个** Galgame 相关站点的跨站搜索，分四组：

- **资源站**：TouchGal、失落小站、一起萌、稻荷、书音的图书馆、忧郁的弟弟、SearchGal、梓澪、ggbases
- **攻略站**：誠也の部屋、誠也存档、Sagaoz攻略、2DFan、Ai2、Moyu
- **数据库**：VNDB、bangumi、批评空间、月幕、kyara、Moepedia、VGMdb、Bishogedb、绯月、鲲galgame、animeShare
- **成人向**：DMM、Fanza、DLsite、nyaa、Sukebei、F95、eHentai、ExHentai、Hitomi

支持两种搜索模式：**按标题搜**（自动挑选最合适的标题，含别名/罗马音/中译）与**按 VN 编号搜**。TouchGal 在「内置浏览器」模式下会自动填入关键词并触发搜索。

### 内置浏览器

基于 [`@capgo/inappbrowser`](https://github.com/Cap-go/capacitor-inappbrowser) 的内嵌 WebView：

- **登录态持久化**：`CookieKeeper` 原生插件为每个会话 Cookie 补上 `Max-Age`（一年）并主动 `flush()`，避免 WebView 关闭后登录失效
- **VNDB 中文化**：内置「VNDB优先原文和中文化」脚本（v5.0.1 + VNDBTranslatorLib v5.0.0），打开 vndb.org 时自动注入，界面与标签按中文显示。可在「设置 → 外观」里关闭
- **首屏加载失败自动重试**：偶发网络抖动导致 WebView 白屏时会重试一次，不再直接甩去系统浏览器

### 其他

- **中 / 英 / 日** 三语言界面，VN 标签与角色特征均有中文化词典（3000+ 条）
- **深浅色主题**、可自定义标题显示顺序（原文 / 罗马音 / 中译）
- **隐私与过滤**：18+ 内容、截图过滤、剧透等级
- **本地收藏**与 VNDB 账号同步（API Token 登录）
- **图片加载优化**：缩略图优先 + 低并发预热队列 + 超时回退原图

---

## 截图

> 待补充。欢迎通过 PR 提交截图到 `docs/screenshots/`。

---

## 下载

从 [Releases](https://github.com/isTurn/vndbest/releases) 下载最新的 APK 安装。

- 要求 Android 7.0（API 24）及以上
- 包名 `com.vndb`

---

## 开发

```bash
npm install
npm run dev
```

开发服务器会代理 `/api/vndb` 到 `https://api.vndb.org/kana`，用于绕过浏览器 CORS 限制（PATCH / DELETE 请求需要）。

### 构建 Web 产物

```bash
npm run build
```

### 同步并构建 Android

```bash
npx cap sync android
cd android && ./gradlew assembleDebug
```

产物位于 `android/app/build/outputs/apk/debug/app-debug.apk`。

> **注意**：`npx cap sync android` 不可省略。它会生成 `capacitor.plugins.json` 并注册原生插件（`CookieKeeper`、`InAppBrowser`），手工拷贝 `dist/` 到 `android/app/src/main/assets/public/` 会导致插件未注册、相关功能失效。

### iOS

```bash
npx cap sync ios
npx cap open ios
```

需要 macOS + Xcode。

---

## 项目结构

```
src/
├── api/vndb.js              VNDB Kana API 封装（超时、429 限流、错误映射）
├── components/              可复用组件（列表、筛选面板、年龄标识等）
├── composables/             组合式函数（主题、隐私、收藏、更新检查、图片加载）
├── i18n/locales/            中 / 英 / 日 语言包 + 标签与特征词典
├── icons/                   Iconify 图标注册与名称映射
├── pages/                   页面（首页、搜索、详情、设置…）
├── router/                  路由（hash 模式）
└── utils/
    ├── crossSearch.js       跨站搜索站点表与链接构造
    ├── linkOpener.js        外链打开策略（内置 / 系统浏览器 + 全局拦截）
    ├── touchgalSearch.js    TouchGal 自动填词注入脚本
    ├── vndbTranslator.js    中文化脚本注入
    ├── imagePrefetch.js     图片预热队列
    ├── cookieKeeper.js      登录态持久化
    └── ulistLabels.js       收藏标签本地化
scripts/
├── build-vndb-translator.cjs   生成 public/vndb-translator.js
└── vendor/                     第三方脚本固化（VNDBTranslatorLib）
android/                        Capacitor Android 工程
docs/vndb-api-kana.md           VNDB Kana API 中文参考
```

---

## CI / 发布

推送到 `v*` 标签会触发 GitHub Actions 构建 Release APK 并创建 GitHub Release：

```bash
git tag v1.0.4
git push origin v1.0.4
```

流水线会：

1. 安装依赖、构建 Web 产物
2. 重新生成中文化脚本（`public/vndb-translator.js`）
3. `npx cap sync android` 注册原生插件
4. 构建 APK（release 变体，默认 debug 签名以便直接安装）
5. 上传到 GitHub Release

---

## 签名配置

CI 默认使用 **debug keystore** 签名 release APK，以便直接安装测试。如需正式签名，在仓库 Settings → Secrets 里配置：

| Secret | 说明 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | keystore 文件的 base64（`base64 -w0 my.keystore`） |
| `ANDROID_KEYSTORE_PASSWORD` | keystore 密码 |
| `ANDROID_KEY_ALIAS` | 密钥别名 |
| `ANDROID_KEY_PASSWORD` | 密钥密码 |

未配置时自动回退到 debug 签名。

---

## 第三方组件与致谢

本项目使用了以下第三方资源，版权归原作者所有：

| 组件 | 用途 | 来源 |
| --- | --- | --- |
| [VNDB优先原文和中文化](https://greasyfork.org/zh-CN/scripts/442355) v5.0.1 | 在内置浏览器里把 VNDB 页面中文化 | [Greasy Fork #442355](https://greasyfork.org/zh-CN/scripts/442355) |
| [VNDBTranslatorLib](https://greasyfork.org/scripts/445990-vndbtranslatorlib) v5.0.0 | 上者的翻译词典（其 `@require` 依赖） | [Greasy Fork #445990](https://greasyfork.org/scripts/445990) |
| [VNDB跨站搜索](https://greasyfork.org/zh-CN/scripts/600569) v2.5.14 | 跨站搜索站点表来源 | [Greasy Fork #600569](https://greasyfork.org/zh-CN/scripts/600569) |

两个油猴脚本以源码形式固化在仓库中（`scripts/vendor/`、`VNDB优先原文和中文化.js`、`VNDB跨站搜索.js`），由 `scripts/build-vndb-translator.cjs` 拼接成可注入的 IIFE。感谢以上脚本作者的劳动，版权归原作者所有；若原作者有异议，请联系移除。

界面数据来自 [VNDB](https://vndb.org/) 的公开 Kana API。本项目与 VNDB 官方无关。

---

## 免责声明

本项目仅作为 VNDB 的第三方客户端，方便在移动端浏览公开数据。所有内容版权归 VNDB 及其贡献者所有。使用时请遵守 [VNDB 使用条款](https://vndb.org/d17) 与各地法律法规。

---

## 上游

- 原项目：[Cyancat000/vndbest](https://github.com/Cyancat000/vndbest)
- 完善与发布：[isTurn/vndbest](https://github.com/isTurn/vndbest)、Hatube01

## 许可证

本仓库未声明开源许可证，默认保留所有权利。如需使用代码，请先联系仓库维护者。
