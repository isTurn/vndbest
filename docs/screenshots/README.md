# 截图

README 里引用的界面截图，均来自真实运行环境（430×932 视口，3x 像素密度，Pillow 转为 860×1864 JPEG）。

| 文件 | 场景 | 说明 |
| --- | --- | --- |
| `home.jpg` | 仪表盘 | 统计数据、角色生日、刚发布的作品 |
| `vn-detail.jpg` | 作品详情 | 幸福噩梦（`v10957`）信息卡与封面 |
| `cross-search.jpg` | 跨站搜索 | 展开后的四组站点列表 |
| `search.jpg` | 全局搜索 | 关键词「幸福噩梦」的多分类结果 |
| `character-detail.jpg` | 角色详情 | Rhea（`c19634`） |
| `release-detail.jpg` | 版本详情 | `r47516` |
| `settings.jpg` | 设置 | 设置首页 |

## 更新截图

1. 启动开发服务器：`npm run dev -- --port 5199 --host 127.0.0.1`
2. 用 headless Chrome + CDP 以 430×932、`deviceScaleFactor: 3`、`mobile: true` 逐页截取
3. 转成 JPEG（quality 86，宽度缩到 860）后覆盖上表对应文件

注意：在同一页面内改 hash 路由不会重新加载，要截冷启动效果需先 `Page.navigate` 到 `about:blank` 再进目标路由；截图前必须轮询等待目标元素出现，否则会截到骨架屏。

单张请控制在 300KB 以内，避免仓库膨胀。
