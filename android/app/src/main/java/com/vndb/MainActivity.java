package com.vndb;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PhotoGalleryPlugin.class);
        registerPlugin(CookieKeeperPlugin.class);
        registerPlugin(ExternalBrowserPlugin.class);
        // 接收其他应用分享进来的图片（相册 / QQ 等），交给「以图搜作品」识别。
        // 冷启动与热启动的 Intent 都由插件的 handleOnNewIntent 接住，这里只注册。
        registerPlugin(ShareImagePlugin.class);
        super.onCreate(savedInstanceState);

        // 关掉 WebView 的过度滚动效果：内容滚到边界后继续拖动时，Chromium 会做「拉伸回弹」，
        // 整幅画面（含底部 fixed 的 TabBar）看起来都在弹性变形。CSS 侧已用
        // overscroll-behavior 收敛，这里再从原生层彻底禁掉 WebView 自己的过度滚动。
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().setOverScrollMode(android.view.View.OVER_SCROLL_NEVER);
            }
        } catch (Exception ignored) {
            // WebView 尚未就绪时忽略，不影响主流程
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        // 退到后台时立刻把 WebView 的 cookie 落盘：Android 在内存吃紧时会直接杀进程，
        // 不走到 onDestroy，未 flush 的会话 cookie 就丢了（表现为「重进软件要重新登录」）。
        try {
            android.webkit.CookieManager.getInstance().flush();
        } catch (Exception ignored) {
            // CookieManager 不可用时忽略，不影响主流程
        }
    }
}
