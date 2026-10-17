package com.cyancat.vndbest;

import android.webkit.CookieManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 让内置浏览器（@capgo/inappbrowser 的 WebView）记住登录态。
 *
 * 问题：WebView 的 CookieManager 把「没有 Max-Age/Expires 的会话 cookie」放在内存里，
 * 应用进程被系统回收（用户划掉后台）后这些 cookie 就没了，站点只能让你重新登录。
 * 另一个问题是 CookieManager 写盘是异步的，进程被强杀时未落盘的 cookie 也会丢。
 *
 * 这里做两件事：
 * 1) persist()  ：把指定站点当前的 cookie 重新写一遍并补上一年有效期，把会话 cookie
 *                 变成持久 cookie；随后 flush() 立即落盘。
 * 2) flush()    ：只把待写盘的 cookie 刷到磁盘（不改变任何 cookie 属性）。
 */
@CapacitorPlugin(name = "CookieKeeper")
public class CookieKeeperPlugin extends Plugin {

    /** 会话 cookie 转持久时给的有效期（秒）：一年 */
    private static final long MAX_AGE_SECONDS = 31536000L;

    @PluginMethod
    public void flush(PluginCall call) {
        try {
            CookieManager.getInstance().flush();
            call.resolve();
        } catch (Exception e) {
            call.reject("flush failed: " + e.getMessage());
        }
    }

    /**
     * 把 urls 里的 cookie 全部重写为持久 cookie 并落盘。
     *
     * @param call urls: JSArray<string>，例如 ["https://www.touchgal.ink", ...]
     */
    @PluginMethod
    public void persist(PluginCall call) {
        JSArray urls = call.getArray("urls");
        if (urls == null) {
            call.reject("urls is required");
            return;
        }

        CookieManager manager = CookieManager.getInstance();
        int rewritten = 0;
        int scanned = 0;

        try {
            for (int i = 0; i < urls.length(); i++) {
                String url = urls.getString(i);
                if (url == null || url.isEmpty()) continue;

                String cookieString = manager.getCookie(url);
                if (cookieString == null || cookieString.isEmpty()) continue;

                String[] pairs = cookieString.split("; ");
                for (String pair : pairs) {
                    int eq = pair.indexOf('=');
                    if (eq <= 0) continue;
                    scanned++;
                    // 只补有效期，不指定 Path/SameSite，交给 CookieManager 按 URL 默认处理，
                    // 避免把 Path=/xxx 的 cookie 错写成 Path=/
                    manager.setCookie(url, pair + "; Max-Age=" + MAX_AGE_SECONDS);
                    rewritten++;
                }
            }
            manager.flush();
        } catch (Exception e) {
            call.reject("persist failed: " + e.getMessage());
            return;
        }

        JSObject result = new JSObject();
        result.put("scanned", scanned);
        result.put("rewritten", rewritten);
        call.resolve(result);
    }

    /** 读出某个 url 的 cookie（调试用，不含 HttpOnly 属性信息） */
    @PluginMethod
    public void read(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }
        JSObject result = new JSObject();
        String cookieString = CookieManager.getInstance().getCookie(url);
        result.put("cookies", cookieString == null ? "" : cookieString);
        call.resolve(result);
    }

    /** 清空某个站点的 cookie（设置里的「退出所有内置浏览器登录」用） */
    @PluginMethod
    public void clear(PluginCall call) {
        try {
            CookieManager manager = CookieManager.getInstance();
            manager.removeAllCookies(null);
            manager.flush();
            call.resolve();
        } catch (Exception e) {
            call.reject("clear failed: " + e.getMessage());
        }
    }
}
