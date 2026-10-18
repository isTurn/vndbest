package com.vndb;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PhotoGalleryPlugin.class);
        registerPlugin(CookieKeeperPlugin.class);
        super.onCreate(savedInstanceState);
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
