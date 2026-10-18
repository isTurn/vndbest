# 贡献指南

感谢你愿意为本项目出力。提交代码前请先读一遍下面几点，能省掉很多来回。

## 开发环境

| 依赖 | 版本要求 |
| --- | --- |
| Node.js | **>= 22**（`@capacitor/cli` 8.x 的硬性要求） |
| JDK | 21 |
| Android SDK | `platforms;android-36`、`build-tools;36.0.0` |

```bash
npm install
npm run dev          # 开发服务器，代理 /api/vndb 绕过 CORS
```

## 提交前自检

```bash
npm run build        # 必须能构建通过
```

改动涉及 Android 原生侧（`android/`、插件、`capacitor.config.json`）时，还要跑：

```bash
npx cap sync android
cd android && ./gradlew assembleDebug
```

> `npx cap sync android` **不可省略**。它会生成 `capacitor.plugins.json` 并注册原生插件；手工拷贝 `dist/` 会让 `CookieKeeper`、`InAppBrowser` 失效。

## 代码风格

- 提交信息用约定式前缀：`feat:` / `fix:` / `docs:` / `chore:` / `ci:`
- `.vue` 文件的 `<template>` 里，**一行 `@click` 不要写多条语句** —— 格式化工具折行后模板表达式会解析失败，请抽成方法
- 本项目 `.vue` 文件行尾混用 CRLF/LF，批量脚本改动前先探测 `'\r\n' in content`

## 需要留意的坑

这些都是踩过的，改到相关代码时容易重犯：

| 位置 | 说明 |
| --- | --- |
| `android/app/proguard-rules.pro` | release 开了 R8。改了插件的反射用法却没补 keep 规则，会在运行时崩 |
| `src/style.css` | 无层 CSS 规则优先级高于 `@layer utilities`。把规则写进 `@layer base` 才能让 Tailwind 的字号类生效 |
| `ion-img` | 不把 `src` 反射成 HTML 属性，读图片地址要 `el.src \|\| el.getAttribute('src')` |
| `ion-content` | Ionic 8 的 `getScrollElement()` **返回 Promise**，必须 `await` |
| VNDB API | `ulist_labels` 的 id=7（Voted）由服务端自动维护，不接受手动设置 |
| 跨站搜索 | 域名表用 base64 存储，避免完整域名出现在打包产物里触发静态扫描 |

## 报告问题

请使用 [Issue 模板](.github/ISSUE_TEMPLATE/bug_report.md)，并附上：

- App 版本（设置 → 关于应用）
- Android 版本与机型
- 复现步骤
- 截图或日志（如果是界面问题）

## 许可证说明

本仓库未声明开源许可证，默认保留所有权利。提交 PR 视为同意你的贡献以相同的条款授权本项目使用。
