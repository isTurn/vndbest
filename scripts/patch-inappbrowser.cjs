/**
 * 给 @capgo/inappbrowser 打几处小补丁（幂等，可重复执行）。
 *
 * 背景一：这个插件把「工具栏自定义按钮」(`buttonNearDone`) 限制得很死——
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
 * 背景二：插件默认不装 DownloadListener（handleDownloads 默认 false），
 * WebView 遇到 Content-Disposition: attachment / <a download> 的链接会静默丢弃，
 * 用户看到的就是「点下载没反应」。这里再补两处：
 * 3) WebViewDialog.java：无条件安装 DownloadListener（不再受 handleDownloads 控制）。
 * 4) WebViewDialog.java：新增下载接管方法——http(s) 链接优先用显式组件交给 1DM+，
 *    没装下载管理器时退回系统 ACTION_VIEW（和「检查更新」走同一条路），
 *    最后才退回插件自带的下载流程；blob:/data: 没法外派，仍由插件自己落盘。
 *
 * 打完之后文件里会留下 `[vndbest patch]` 标记，脚本靠标记判断是否已打过，
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

/** 补丁 3：无条件安装 DownloadListener，把下载分发给外部下载器 */
const DOWNLOAD_LISTENER_MARKER = '[vndbest patch:download]'

const DOWNLOAD_LISTENER_NEEDLE = `        if (_options.getHandleDownloads()) {
            _webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
                Log.d(
                    "InAppBrowser",
                    "Handling WebView download: " + redactUrlForLogging(url) + ", mimeType=" + mimeType + ", bytes=" + contentLength
                );
                handleDownloadRequest(url, userAgent, contentDisposition, mimeType);
            });
        }`

const DOWNLOAD_LISTENER_REPLACE = `        // ${DOWNLOAD_LISTENER_MARKER} 无条件安装 DownloadListener：插件的 handleDownloads 默认
        // false，不装监听时 Content-Disposition: attachment / <a download> 的链接会被 WebView
        // 直接丢掉，用户看到的就是「点下载没反应」。分发逻辑见 routeDownloadToExternalApp。
        _webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            Log.d(
                "InAppBrowser",
                "Handling WebView download: " + redactUrlForLogging(url) + ", mimeType=" + mimeType + ", bytes=" + contentLength
            );
            routeDownloadToExternalApp(url, userAgent, contentDisposition, mimeType);
        });`

/** 补丁 4：新增下载分发方法（1DM+ → 系统 ACTION_VIEW → 插件自带下载） */
const DOWNLOAD_ROUTE_MARKER = '[vndbest patch:download-route]'

const DOWNLOAD_ROUTE_NEEDLE = `    private void handleDownloadRequest(String url, String userAgent, String contentDisposition, String mimeType) {`

const DOWNLOAD_ROUTE_REPLACE = `    // ${DOWNLOAD_ROUTE_MARKER} 下载分发：http(s) 优先交给系统里装的下载管理器（1DM+ / ADM），
    // 没有下载器时退回系统 ACTION_VIEW（和「检查更新」打开 APK 下载链接是同一条路），
    // 最后才用插件自带的下载流程；blob:/data: 这类页面内生成的 URL 没法外派，只能插件自己落盘。
    private static final String IDM_URL_HANDLER_CLASS = "idm.internet.download.manager.UrlHandlerDownloader";

    private static final String[] DOWNLOAD_MANAGER_PACKAGES = {
        "idm.internet.download.manager.plus",
        "idm.internet.download.manager",
        "com.dv.adm.pay",
        "com.dv.adm"
    };

    private static boolean isHttpDownloadUrl(String url) {
        if (TextUtils.isEmpty(url)) {
            return false;
        }
        return url.regionMatches(true, 0, "http://", 0, 7) || url.regionMatches(true, 0, "https://", 0, 8);
    }

    private boolean startDownloadExternalIntent(Intent intent) {
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            _context.startActivity(intent);
            return true;
        } catch (ActivityNotFoundException e) {
            return false;
        } catch (Exception e) {
            Log.w("InAppBrowser", "${DOWNLOAD_ROUTE_MARKER} startActivity failed: " + e.getMessage());
            return false;
        }
    }

    private boolean handDownloadToDownloadManager(String url) {
        if (!isHttpDownloadUrl(url)) {
            return false;
        }
        Uri uri = Uri.parse(url);
        // 1DM+ 一个包里注册了两个 ACTION_VIEW 的 activity，只按包名启动会弹系统选择框；
        // 真机实测给出显式组件时能直接进「下载文件」确认页。
        Intent idmIntent = new Intent(Intent.ACTION_VIEW, uri);
        idmIntent.setClassName("idm.internet.download.manager.plus", IDM_URL_HANDLER_CLASS);
        if (startDownloadExternalIntent(idmIntent)) {
            Log.d("InAppBrowser", "${DOWNLOAD_ROUTE_MARKER} download handed to 1DM+");
            return true;
        }
        for (String packageName : DOWNLOAD_MANAGER_PACKAGES) {
            Intent managerIntent = new Intent(Intent.ACTION_VIEW, uri);
            managerIntent.setPackage(packageName);
            if (startDownloadExternalIntent(managerIntent)) {
                Log.d("InAppBrowser", "${DOWNLOAD_ROUTE_MARKER} download handed to " + packageName);
                return true;
            }
        }
        return false;
    }

    private void routeDownloadToExternalApp(String url, String userAgent, String contentDisposition, String mimeType) {
        if (handDownloadToDownloadManager(url)) {
            return;
        }
        if (_options != null && _options.getHandleDownloads()) {
            handleDownloadRequest(url, userAgent, contentDisposition, mimeType);
            return;
        }
        // 没有下载管理器、插件自带下载也没开：退回系统 ACTION_VIEW，由默认浏览器接手。
        if (isHttpDownloadUrl(url)) {
            if (startDownloadExternalIntent(new Intent(Intent.ACTION_VIEW, Uri.parse(url)))) {
                Log.d("InAppBrowser", "${DOWNLOAD_ROUTE_MARKER} download handed to system handler");
                return;
            }
        }
        Log.w("InAppBrowser", "${DOWNLOAD_ROUTE_MARKER} cannot handle download: " + redactUrlForLogging(url));
    }

    private void handleDownloadRequest(String url, String userAgent, String contentDisposition, String mimeType) {`

const targets = [
  { file: path.join(PLUGIN_DIR, 'InAppBrowserPlugin.java'), needle: PLUGIN_NEEDLE, replace: PLUGIN_REPLACE },
  { file: path.join(PLUGIN_DIR, 'WebViewDialog.java'), needle: DIALOG_NEEDLE, replace: DIALOG_REPLACE },
  {
    file: path.join(PLUGIN_DIR, 'WebViewDialog.java'),
    needle: DOWNLOAD_LISTENER_NEEDLE,
    replace: DOWNLOAD_LISTENER_REPLACE,
    marker: DOWNLOAD_LISTENER_MARKER
  },
  {
    file: path.join(PLUGIN_DIR, 'WebViewDialog.java'),
    needle: DOWNLOAD_ROUTE_NEEDLE,
    replace: DOWNLOAD_ROUTE_REPLACE,
    marker: DOWNLOAD_ROUTE_MARKER
  }
]

function patchOne({ file, needle, replace, marker = MARKER }) {
  const name = path.basename(file)
  if (!fs.existsSync(file)) {
    return { name, status: 'skip', detail: '插件文件不存在（未安装 @capgo/inappbrowser？）' }
  }
  let code = fs.readFileSync(file, 'utf8')

  if (code.includes(marker)) {
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
