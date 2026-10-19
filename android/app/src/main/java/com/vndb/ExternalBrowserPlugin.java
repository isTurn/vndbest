package com.vndb;

import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 自选浏览器：列出能处理网页链接的应用，并把 http(s) 链接定向交给指定应用打开。
 *
 * 列表来源有两条路，任一命中即收录：
 *  ① queryIntentActivities 探测（只看得到 AndroidManifest <queries> 声明的范围）
 *  ② 常见浏览器包名白名单 —— 配合 <queries><package> 声明，直接查这些包有没有装
 *
 * 为什么要 ②：Android 11+ 的包可见性让 ① 经常只返回「系统默认浏览器」一个，
 * 用户会看到列表里只有 Edge，误以为功能没做。白名单把主流/厂商浏览器补齐。
 */
@CapacitorPlugin(name = "ExternalBrowser")
public class ExternalBrowserPlugin extends Plugin {

    /** 常见浏览器包名，与 AndroidManifest 里的 <queries><package> 一一对应 */
    private static final String[] KNOWN_BROWSERS = new String[] {
            // Chrome 系
            "com.android.chrome", "com.chrome.beta", "com.chrome.dev", "com.chrome.canary",
            "org.chromium.chrome", "org.cromite.cromite", "com.kiwibrowser.browser",
            "com.brave.browser", "com.brave.browser_beta", "com.vivaldi.browser",
            "com.vivaldi.browser.snapshot",
            // Firefox 系
            "org.mozilla.firefox", "org.mozilla.firefox_beta", "org.mozilla.fenix",
            "org.mozilla.focus", "org.mozilla.fennec_fdroid", "us.spotco.mull",
            "org.ironfoxoss.ironfox",
            // 其它国际浏览器
            "com.microsoft.emmx", "com.microsoft.emmx.canary", "com.opera.browser",
            "com.opera.mini.native", "com.opera.gx", "com.duckduckgo.mobile.android",
            "com.ecosia.android", "com.yandex.browser", "mark.via.gp", "com.xbrowser.play",
            "com.alook.browser", "com.cloudmosa.puffinFree", "com.sec.android.app.sbrowser",
            "com.sec.android.app.sbrowser.beta", "com.samsung.android.browser",
            // 国产浏览器
            "com.tencent.mtt", "com.tencent.mtt.x86", "com.UCMobile", "com.UCMobile.intl",
            "com.uc.browser", "com.ucmobile", "com.quark.browser", "com.baidu.browser.apps",
            "com.baidu.searchbox", "com.qihoo.browser", "com.sohu.sohuvideo",
            "com.android.browser",
            // 厂商内置浏览器
            "com.miui.browser", "com.miui.browser.global", "com.mi.globalbrowser",
            "com.huawei.browser", "com.hihonor.browser", "com.heytap.browser",
            "com.coloros.browser", "com.oppo.browser", "com.vivo.browser", "com.bbk.browser",
            "com.meizu.flyme.browser", "com.lenovo.browser", "com.zte.browser",
            "com.transsion.phoenix", "com.transsion.browser", "com.android.htmlviewer"
    };

    /** 列出所有能打开网页的应用（排除本应用自己） */
    @PluginMethod
    public void listBrowsers(PluginCall call) {
        try {
            PackageManager pm = getContext().getPackageManager();
            String self = getContext().getPackageName();

            Map<String, String> found = new LinkedHashMap<>();

            // ① 浏览器标准入口：ACTION_MAIN + CATEGORY_APP_BROWSER。
            //    这是 Android 约定的「浏览器」声明方式（Chrome / Edge / Firefox 等
            //    都会注册），比按 https scheme 探测更准，也不会把「能打开网页的
            //    其它 App」混进来。
            try {
                Intent browserIntent = Intent.makeMainSelectorActivity(
                        Intent.ACTION_MAIN, Intent.CATEGORY_APP_BROWSER);
                collectFromIntent(pm, self, found, browserIntent);
            } catch (Exception ignored) {
                /* 老系统没有 makeMainSelectorActivity 时忽略 */
            }

            // ② intent 探测：http/https/html 各探一次，不用 MATCH_DEFAULT_ONLY，
            //    否则「不是默认应用」的浏览器会被全部过滤掉
            collectFromIntent(pm, self, found, new Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com")));
            collectFromIntent(pm, self, found, new Intent(Intent.ACTION_VIEW, Uri.parse("http://example.com")));
            Intent htmlIntent = new Intent(Intent.ACTION_VIEW);
            htmlIntent.setType("text/html");
            collectFromIntent(pm, self, found, htmlIntent);

            // ③ 白名单兜底：manifest 里声明了 package，就能直接查是否安装
            for (String pkg : KNOWN_BROWSERS) {
                if (pkg.equals(self) || found.containsKey(pkg)) continue;
                if (!isInstalled(pm, pkg)) continue;
                found.put(pkg, appLabel(pm, pkg, null));
            }

            // 系统默认浏览器（只用来打标记）
            String defaultPkg = "";
            ResolveInfo defaultInfo = pm.resolveActivity(
                    new Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com")), 0);
            if (defaultInfo != null && defaultInfo.activityInfo != null) {
                defaultPkg = defaultInfo.activityInfo.packageName;
            }

            List<JSObject> items = new ArrayList<>();
            for (Map.Entry<String, String> entry : found.entrySet()) {
                JSObject item = new JSObject();
                item.put("packageName", entry.getKey());
                item.put("label", entry.getValue());
                item.put("isDefault", entry.getKey().equals(defaultPkg));
                items.add(item);
            }

            Collections.sort(items, new Comparator<JSObject>() {
                @Override
                public int compare(JSObject a, JSObject b) {
                    return String.valueOf(a.optString("label", ""))
                            .compareToIgnoreCase(String.valueOf(b.optString("label", "")));
                }
            });

            JSArray array = new JSArray();
            for (JSObject item : items) array.put(item);

            JSObject result = new JSObject();
            result.put("browsers", array);
            result.put("ownPackage", self);
            result.put("defaultPackage", defaultPkg);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("listBrowsers failed: " + e.getMessage());
        }
    }

    private void collectFromIntent(PackageManager pm, String self, Map<String, String> found, Intent intent) {
        List<ResolveInfo> resolved;
        try {
            resolved = pm.queryIntentActivities(intent, 0);
        } catch (Exception e) {
            return;
        }
        if (resolved == null) return;
        for (ResolveInfo info : resolved) {
            if (info.activityInfo == null) continue;
            String pkg = info.activityInfo.packageName;
            if (pkg == null || pkg.equals(self) || found.containsKey(pkg)) continue;
            found.put(pkg, appLabel(pm, pkg, info));
        }
    }

    private boolean isInstalled(PackageManager pm, String pkg) {
        try {
            pm.getPackageInfo(pkg, 0);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * 优先用应用级名称：activity 的 label 有时为空，或者带 "Main" 之类的组件后缀。
     */
    private String appLabel(PackageManager pm, String pkg, ResolveInfo fallbackInfo) {
        try {
            ApplicationInfo appInfo = pm.getApplicationInfo(pkg, 0);
            CharSequence label = appInfo.loadLabel(pm);
            if (label != null && label.length() > 0) return label.toString();
        } catch (Exception ignored) {
            /* 拿不到应用信息时退回 activity 的 label */
        }
        if (fallbackInfo != null) {
            CharSequence label = fallbackInfo.loadLabel(pm);
            if (label != null && label.length() > 0) return label.toString();
        }
        return pkg;
    }

    /**
     * 用指定包名的应用打开链接。
     *
     * @param call url: string, packageName?: string
     *   packageName 为空 → 系统默认浏览器；
     *   packageName == "__chooser__" → 弹系统选择框（不受包可见性限制，能看到全部浏览器）
     */
    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.trim().isEmpty()) {
            call.reject("url is required");
            return;
        }

        String pkg = call.getString("packageName");
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (pkg != null && "__chooser__".equals(pkg.trim())) {
                // 系统选择框由系统进程渲染，包可见性限制不适用，
                // 所以即使列表里只看到默认浏览器，用户仍能在选择框里选任意一个
                Intent chooser = Intent.createChooser(intent, null);
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(chooser);
                call.resolve();
                return;
            }
            if (pkg != null && !pkg.trim().isEmpty()) {
                intent.setPackage(pkg.trim());
            }
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("open failed: " + e.getMessage());
        }
    }
}
