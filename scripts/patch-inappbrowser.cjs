/**
 * 给 @capgo/inappbrowser 打两处小补丁（幂等，可重复执行）。
 *
 * 背景：这个插件把「工具栏自定义按钮」(`buttonNearDone`) 限制得很死——
 * toolbarType 为 activity / navigation / blank 时直接 reject，
 * 而我们的内置浏览器必须用 navigation（要前进 / 后退 / 刷新），
 * 结果就是工具栏上永远没有位置放入口，只能退回往页面里注入悬浮球。
 *
 * 两处改动：
 * 1) InAppBrowserPlugin.java：允许 navigation 与 buttonNearDone 共存
 *    （activity / blank 依然拒绝，那两个模式确实没有按钮位置）。
 * 2) WebViewDialog.java：navigation 分支不再无条件隐藏 toolbar 按钮，
 *    而是按 buttonNearDone 配置显示。图标走 'vector' 类型，指到
 *    android/app/src/main/res/drawable/ic_open_external.xml（本仓库自带）。
 *
 * 打完之后两个文件里会留下 `[vndbest patch]` 标记，脚本靠标记判断是否已打过，
 * 版本升级后锚点失配会直接报错退出，避免静默打不上补丁。
 *
 * 用法：node scripts/patch-inappbrowser.cjs（package.json 的 postinstall 会自动调用）
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const PLUGIN_DIR = path.join(ROOT, 'node_modules', '@capgo', 'inappbrowser', 'android', 'src', 'main', 'java', 'ee', 'forgr', 'capacitor_inappbrowser')
const MARKER = '[vndbest patch]'

/** 补丁 1：放开 navigation 模式的限制 */
const PLUGIN_NEEDLE = `            if (
                TextUtils.equals(toolbarType, "activity") ||
                TextUtils.equals(toolbarType, "navigation") ||
                TextUtils.equals(toolbarType, "blank")
            ) {`

const PLUGIN_REPLACE = `            // ${MARKER} navigation 工具栏也带前进/后退/刷新，插件本身就支持
            // 在工具栏尾部放一个自定义按钮，这里放开 navigation 的限制，
            // 让内置浏览器可以把「用外部浏览器打开」放到工具栏上。
            if (
                TextUtils.equals(toolbarType, "activity") ||
                TextUtils.equals(toolbarType, "blank")
            ) {`

/** 补丁 2：navigation 分支按配置显示工具栏按钮 */
const DIALOG_NEEDLE = `        } else if (TextUtils.equals(_options.getToolbarType(), "navigation")) {
            ImageButton buttonNearDoneView = _toolbar.findViewById(R.id.buttonNearDone);
            buttonNearDoneView.setVisibility(View.GONE);
            // Status bar color is already set at the top of this method, no need to set again
        } else if (TextUtils.equals(_options.getToolbarType(), "blank")) {`

const DIALOG_REPLACE = `        } else if (TextUtils.equals(_options.getToolbarType(), "navigation")) {
            // ${MARKER} navigation 模式下不再无条件隐藏自定义按钮：
            // 有配置就显示（用 vector 图标，省掉一套 SVG 解析路径），没有就保持隐藏。
            ImageButton navigationAuxButton = _toolbar.findViewById(R.id.buttonNearDone);
            Options.ButtonNearDone navigationAuxConfig = _options.getButtonNearDone();
            if (navigationAuxConfig != null) {
                int navigationAuxIconId = _context
                    .getResources()
                    .getIdentifier(
                        navigationAuxConfig.getIcon(),
                        "drawable",
                        _context.getPackageName()
                    );
                if (navigationAuxIconId != 0) {
                    navigationAuxButton.setImageResource(navigationAuxIconId);
                    navigationAuxButton.setColorFilter(iconColor);
                    navigationAuxButton.setVisibility(View.VISIBLE);
                    navigationAuxButton.setOnClickListener((view) ->
                        _options.getCallbacks().buttonNearDoneClicked()
                    );
                    Log.d("InAppBrowser", "${MARKER} navigation toolbar button shown: " + navigationAuxConfig.getIcon());
                } else {
                    Log.e("InAppBrowser", "${MARKER} navigation toolbar button icon not found: " + navigationAuxConfig.getIcon());
                    navigationAuxButton.setVisibility(View.GONE);
                }
            } else {
                navigationAuxButton.setVisibility(View.GONE);
            }
            // Status bar color is already set at the top of this method, no need to set again
        } else if (TextUtils.equals(_options.getToolbarType(), "blank")) {`

const targets = [
  { file: path.join(PLUGIN_DIR, 'InAppBrowserPlugin.java'), needle: PLUGIN_NEEDLE, replace: PLUGIN_REPLACE },
  { file: path.join(PLUGIN_DIR, 'WebViewDialog.java'), needle: DIALOG_NEEDLE, replace: DIALOG_REPLACE }
]

function patchOne({ file, needle, replace }) {
  const name = path.basename(file)
  if (!fs.existsSync(file)) {
    return { name, status: 'skip', detail: '插件文件不存在（未安装 @capgo/inappbrowser？）' }
  }
  let code = fs.readFileSync(file, 'utf8')

  if (code.includes(MARKER)) {
    return { name, status: 'already', detail: '已包含补丁标记' }
  }
  if (!code.includes(needle)) {
    return { name, status: 'error', detail: '锚点未匹配（插件版本可能变了），需要人工确认' }
  }

  code = code.replace(needle, replace)
  fs.writeFileSync(file, code, 'utf8')
  return { name, status: 'patched', detail: '写入成功' }
}

function main() {
  const results = targets.map(patchOne)
  let failed = false
  for (const r of results) {
    const icon = r.status === 'patched' ? '✔' : r.status === 'already' ? '·' : r.status === 'skip' ? '·' : '✖'
    console.log(`${icon} ${r.name}: ${r.detail}`)
    if (r.status === 'error') failed = true
  }
  if (failed) {
    console.error('\n[vndbest patch] 补丁失败：内置浏览器的工具栏按钮会失效，请检查插件版本。')
    process.exitCode = 1
  }
}

main()
