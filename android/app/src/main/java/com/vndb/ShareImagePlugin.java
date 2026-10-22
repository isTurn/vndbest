package com.vndb;

import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;

/**
 * 接收系统分享进来的图片（相册、QQ、浏览器……点「分享」后选「以图搜作品」）。
 *
 * 为什么要有这个插件：
 * 网页里的 <input type="file"> 只能让用户自己去挑图；别的应用分享图片过来时，
 * 系统是把图片 URI 塞进 Intent 交给 Activity 的，WebView 完全看不到。
 * 所以需要在原生侧接住 Intent，把图片复制到 App 缓存目录，再让 JS 去取。
 *
 * 两个关键点：
 * 1. handleOnNewIntent() 冷启动 / 热启动都会被调用（Capacitor 的 BridgeActivity
 *    在 load() 里也会用启动 Intent 调一次），所以只要在这里记下 Intent 就够了，
 *    MainActivity 不需要额外处理。
 * 2. 分享进来的 content:// URI 带的是临时读权限，Activity 一销毁就可能失效，
 *    因此要尽快把字节复制到 getCacheDir() 下自己的文件里再交给 JS。
 *    复制放在 getPending() 的插件线程里做，不占主线程。
 */
@CapacitorPlugin(name = "ShareImage")
public class ShareImagePlugin extends Plugin {

    private static final String TAG = "ShareImage";
    private static final Object LOCK = new Object();
    /** 缓存目录里超过这个时间的旧图会被清掉，避免越堆越大 */
    private static final long STALE_FILE_MS = 60 * 60 * 1000L;

    /** 待处理的分享 Intent；null 表示当前没有分享进来的图片 */
    private static Intent pendingIntent = null;

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent == null) {
            return;
        }

        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            return;
        }

        synchronized (LOCK) {
            pendingIntent = new Intent(intent);
        }
        Log.d(TAG, "captured share intent: " + action);

        // JS 侧监听器不一定已经挂好（冷启动时必然还没挂），
        // retainUntilConsumed = true 让事件保留到第一个监听器注册时补发。
        notifyListeners("shareImage", new JSObject(), true);
    }

    /**
     * 取走这一次分享进来的图片。没有待处理图片时返回空对象。
     * 返回 { path, name, mimeType }，path 是 App 缓存目录里的绝对路径。
     */
    @PluginMethod
    public void getPending(PluginCall call) {
        Intent intent;
        synchronized (LOCK) {
            intent = pendingIntent;
            pendingIntent = null;
        }

        if (intent == null) {
            call.resolve(new JSObject());
            return;
        }

        // 读 content:// 流是 IO，放到 Capacitor 的插件线程上执行
        getBridge().execute(() -> {
            try {
                JSObject result = copySharedImage(intent);
                call.resolve(result != null ? result : new JSObject());
            } catch (Exception error) {
                call.reject("读取分享的图片失败", error);
            }
        });
    }

    /** 把分享进来的图片复制到缓存目录，返回给 JS 的信息 */
    private JSObject copySharedImage(Intent intent) throws Exception {
        Uri uri = extractFirstUri(intent);
        if (uri == null) {
            return null;
        }

        ContentResolver resolver = getContext().getContentResolver();
        String mimeType = intent.getType();
        if (mimeType == null) {
            mimeType = resolver.getType(uri);
        }
        if (mimeType == null) {
            mimeType = "image/jpeg";
        }
        if (!mimeType.startsWith("image/")) {
            // 分享的是文件但不是图片，直接忽略
            return null;
        }

        File dir = new File(getContext().getCacheDir(), "shared-image");
        if (!dir.exists() && !dir.mkdirs()) {
            return null;
        }
        cleanStaleFiles(dir);

        String fileName = "shared-" + System.currentTimeMillis() + "." + extensionOf(mimeType);
        File target = new File(dir, fileName);

        try (InputStream in = resolver.openInputStream(uri);
             OutputStream out = new FileOutputStream(target)) {
            if (in == null) {
                return null;
            }
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
        }

        Log.d(TAG, "shared image copied to " + target.getAbsolutePath());

        JSObject result = new JSObject();
        result.put("path", target.getAbsolutePath());
        result.put("name", fileName);
        result.put("mimeType", mimeType);
        return result;
    }

    /**
     * 取分享进来的第一张图。
     *
     * 这里不按 action 分支死取，而是四条路依次兜底：不同应用（相册、QQ、浏览器、
     * 第三方分享面板）塞图片的位置并不统一。实测 ZUI 的分享面板对
     * ACTION_SEND_MULTIPLE 也可能只给一个 Uri 而不是列表，所以：
     * 1. EXTRA_STREAM 是单个 Uri（ACTION_SEND 的常规写法）
     * 2. EXTRA_STREAM 是 Uri 列表（ACTION_SEND_MULTIPLE 的常规写法），取第一张
     * 3. Intent 的 data
     * 4. ClipData 的第一项
     */
    private Uri extractFirstUri(Intent intent) {
        Uri single = getSingleStream(intent);
        if (single != null) {
            return single;
        }

        ArrayList<Uri> uris = getStreamList(intent);
        if (uris != null && !uris.isEmpty()) {
            return uris.get(0);
        }

        Uri data = intent.getData();
        if (data != null) {
            return data;
        }

        ClipData clip = intent.getClipData();
        if (clip != null && clip.getItemCount() > 0) {
            return clip.getItemAt(0).getUri();
        }
        return null;
    }

    /** EXTRA_STREAM 里是单个 Uri 时返回它，类型不符（例如其实是列表）时返回 null */
    @SuppressWarnings("deprecation")
    private Uri getSingleStream(Intent intent) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                return intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class);
            }
            Object raw = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            return raw instanceof Uri ? (Uri) raw : null;
        } catch (Exception ignored) {
            return null;
        }
    }

    /** EXTRA_STREAM 里是 Uri 列表时返回它，类型不符（例如其实是单个 Uri）时返回 null */
    @SuppressWarnings("deprecation")
    private ArrayList<Uri> getStreamList(Intent intent) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                return intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri.class);
            }
            return intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
        } catch (Exception ignored) {
            return null;
        }
    }

    /** 清理一小时前的旧图（不删刚存进来的，避免把正在识别的图删掉） */
    private void cleanStaleFiles(File dir) {
        File[] files = dir.listFiles();
        if (files == null) {
            return;
        }
        long threshold = System.currentTimeMillis() - STALE_FILE_MS;
        for (File file : files) {
            if (file.isFile() && file.lastModified() < threshold) {
                //noinspection ResultOfMethodCallIgnored
                file.delete();
            }
        }
    }

    private String extensionOf(String mimeType) {
        switch (mimeType) {
            case "image/png":
                return "png";
            case "image/webp":
                return "webp";
            case "image/gif":
                return "gif";
            case "image/bmp":
                return "bmp";
            case "image/heic":
            case "image/heif":
                return "heic";
            default:
                return "jpg";
        }
    }
}
