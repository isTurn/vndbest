# Capacitor 与插件依赖反射按名字查找类/方法，被 R8 优化掉就会在运行时抛
# ClassNotFoundException / NoSuchMethodError。这些 keep 规则是 release 开启
# minifyEnabled 的前提，删任何一条都可能导致桥接失效。

# --- Capacitor 核心 ---
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep @com.getcapacitor.PluginMethod class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public *;
}
-keepclassmembers class * extends com.getcapacitor.Plugin {
    public <init>(...);
}
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod

# --- 本项目 / 第三方插件（均通过注解 + 反射注册）---
-keep class com.vndb.** { *; }
-keep class ee.forgr.capacitor_inappbrowser.** { *; }
-keep class com.capacitorjs.plugins.** { *; }

# --- WebView 的 JS 接口不能被裁剪 ---
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class androidx.webkit.** { *; }

# --- 保留行号，便于线上崩溃定位；只隐藏源文件名 ---
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# --- 去掉日志（正式包不输出调试信息）---
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
}
