# 截图

README 里引用的界面截图，均来自真实运行环境（430×932 视口，3x 像素密度，Pillow 转为 860×1864 JPEG）。

| 文件 | 场景 | 说明 |
| --- | --- | --- |
| `home.jpg` | 仪表盘 | 平台数据小框、角色生日、刚发布的作品 |
| `vn-detail.jpg` | 作品详情 | 幸福噩梦（`v10957`）信息卡与封面 |
| `cross-search.jpg` | 跨站搜索 | 展开后的四组站点列表（36 站） |
| `search.jpg` | 全局搜索 | 关键词「幸福噩梦」的多分类结果 |
| `search-history.jpg` | 搜索历史 | 输入框下方的最近关键词 chip，可单条删除或清空全部 |
| `character-detail.jpg` | 角色详情 | Rhea（`c19634`） |
| `release-detail.jpg` | 版本详情 | `r47516`，封面回退到关联作品 |
| `release-list.jpg` | 版本列表 | 语言旗帜、标题原文在上 / 罗马音在下 |
| `settings.jpg` | 设置 | 设置首页 |

## 更新截图

1. 启动开发服务器：`npm run dev -- --port 5199 --host 127.0.0.1`
2. 用 headless Chrome + CDP 以 430×932、`deviceScaleFactor: 3`、`mobile: true` 逐页截取
3. 转成 JPEG（quality 86，宽度缩到 860）后覆盖上表对应文件

参考脚本骨架：

```js
// 关键步骤：Page.enable → Runtime.enable → Emulation.setDeviceMetricsOverride
await send('Emulation.setDeviceMetricsOverride', {
  width: 430,
  height: 932,
  deviceScaleFactor: 3,
  mobile: true
})
// 冷启动：先 about:blank 再进目标 hash 路由
await send('Page.navigate', { url: 'about:blank' })
await send('Page.navigate', { url: 'http://127.0.0.1:5199/#/vn/v10957' })
```

## 踩坑

- **同页改 hash 不重新加载**：要截冷启动效果必须 `Page.navigate` 到 `about:blank` 再进目标路由，否则拿到的是上一页残留状态。
- **必须轮询等待元素**：固定 `sleep` 会截到骨架屏；用 `!!document.querySelector('.page-sticky-header')` 循环等待。
- **连接正确的 target**：从 `/json/list` 里取 `type === 'page'` 的 `webSocketDebuggerUrl`；连到 browser target 会报 `'Runtime.enable' was not found`。
- **滚动用 `ion-content`**：Ionic 8 的 `ion-content.getScrollElement()` **返回 Promise**，必须 `await`；直接 `document.querySelector('ion-content').scrollTop = x` 无效。
- **搜索历史要先塞数据**：历史为空时整块隐藏，截图前用 `localStorage.setItem('vndb_search_history', JSON.stringify([...]))` 预置再 `location.reload()`。
- **统计数据依赖内置浏览器**：作品详情「统计」选项卡在普通浏览器里会显示「统计功能需要在内置浏览器中运行」，因此没有对应的截图。

单张请控制在 300KB 以内，避免仓库膨胀。
