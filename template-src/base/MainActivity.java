// MainActivity.java — Nitron v2.0 Web-First Runtime
//
// This is the single activity that ships inside every Nitron APK.
// It creates a full-screen WebView with an HTTPS-like local origin,
// replacing the insecure file:// protocol used in v1.x.
//
// Architecture:
//   - Assets are served from assets/www/ inside the APK
//   - WebView loads https://appassets.androidplatform.net/index.html
//   - shouldInterceptRequest() intercepts this domain and serves local files
//   - Real network requests (APIs, CDNs) pass through untouched
//   - No deprecated APIs (no setAllowUniversalAccessFromFileURLs)
//
// To rebuild classes.dex from this source:
//   node scripts/prepare-template.js
//
// The resulting classes.dex goes into template/base.apk

package com.nicron.webview;

import android.Manifest;
import android.app.Activity;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.MimeTypeMap;
import android.webkit.WebChromeClient;
import android.webkit.PermissionRequest;
import android.webkit.GeolocationPermissions;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.view.Gravity;
import android.view.animation.AlphaAnimation;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashMap;
import java.util.Map;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.webkit.JavascriptInterface;
import android.content.ActivityNotFoundException;

public class MainActivity extends Activity {

    // The HTTPS-like domain used to serve local assets.
    // This is the same domain used by Android's WebViewAssetLoader,
    // ensuring compatibility and security best practices.
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String ASSET_PREFIX = "www/";

    private WebView webView;
    private FrameLayout rootLayout;
    private View splashView;

    // Runtime config read from AndroidManifest <meta-data>
    private String backButtonMode = "history";
    private boolean clearCacheOnStart = false;

    // External navigation policy (nitron.externalLinks / nitron.allowedHosts):
    //   "browser" (default) — http(s) links to other hosts open in the system browser
    //   "inapp"             — they load inside the WebView (legacy hybrid behavior)
    private String externalLinksMode = "browser";
    private final java.util.Set<String> allowedHosts = new java.util.HashSet<String>();

    // Native plugins (see NitronPlugin). Null when the app has no plugins.
    private PluginDispatcher pluginDispatcher = null;
    private final List<NitronPlugin> loadedPlugins = new ArrayList<NitronPlugin>();
    private static final String PLUGINS_REGISTRY = "nitron-plugins.json";
    private static final String RUNTIME_PATH = "__nitron/runtime.js";
    private static final String RUNTIME_TAG = "<script src=\"/" + RUNTIME_PATH + "\"></script>";
    private static final Pattern HEAD_TAG = Pattern.compile("<head[^>]*>", Pattern.CASE_INSENSITIVE);
    private static final Pattern HTML_TAG = Pattern.compile("<html[^>]*>", Pattern.CASE_INSENSITIVE);
    private static final Pattern DOCTYPE_TAG = Pattern.compile("<!doctype[^>]*>", Pattern.CASE_INSENSITIVE);
    /** Request codes 0x2000-0x3FFF belong to plugins: 0x2000 | (pluginIndex << 8) | code. */
    private static final int PLUGIN_REQUEST_BASE = 0x2000;

    // Last main-frame URL, updated on the UI thread. JavaScript-interface calls
    // arrive on a background thread, so they read this instead of WebView.getUrl().
    private volatile String currentPageUrl = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Full-screen, no title bar
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        // Read runtime configuration from manifest meta-data
        readMetaData();

        // Create root layout
        rootLayout = new FrameLayout(this);

        // Create and configure WebView
        webView = new WebView(this);
        configureWebView();

        // Add WebView to layout
        rootLayout.addView(webView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));

        // Setup splash screen (will be hidden when page loads)
        setupSplashScreen();

        // Clear cache if configured
        if (clearCacheOnStart) {
            webView.clearCache(true);
        }

        // Native plugins must be registered before the first page starts
        loadPlugins();

        // Load the entry point via HTTPS-like origin
        webView.loadUrl("https://" + ASSET_HOST + "/index.html");

        setContentView(rootLayout);
    }

    /**
     * Configure the WebView with all necessary settings for a proper
     * web runtime environment. No deprecated file access APIs.
     */
    private void configureWebView() {
        WebSettings settings = webView.getSettings();

        // Core web features
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        // Viewport and zoom
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);

        // Cache
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Mixed content — allow HTTPS page to load HTTP resources if needed
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

        // Explicitly disable file access — we use shouldInterceptRequest instead
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);

        // Enable cookies
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        // Set up the asset-serving WebViewClient
        webView.setWebViewClient(new NitronWebViewClient());

        // Setup WebChromeClient to allow WebView permission requests securely
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (request.getOrigin() != null && isAppOrigin(request.getOrigin().toString())) {
                            request.grant(request.getResources());
                        } else {
                            request.deny();
                        }
                    }
                });
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (origin != null && isAppOrigin(origin)) {
                    callback.invoke(origin, true, false);
                } else {
                    callback.invoke(origin, false, false);
                }
            }
        });

        // Setup JS bridge
        webView.addJavascriptInterface(new NitronJSInterface(), "Nitron");
    }

    /**
     * Custom WebViewClient that intercepts requests to the asset domain
     * and serves files from the APK's assets/www/ directory.
     *
     * This replaces the deprecated file:// approach with a secure
     * HTTPS-like origin, following Android's WebViewAssetLoader pattern
     * without requiring the AndroidX dependency.
     */
    private class NitronWebViewClient extends WebViewClient {

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();

            // Only intercept requests to our asset domain
            if (ASSET_HOST.equals(uri.getHost())) {
                String path = uri.getPath();
                if (path == null || path.isEmpty() || "/".equals(path)) {
                    path = "/index.html";
                }

                // Remove leading slash
                if (path.startsWith("/")) {
                    path = path.substring(1);
                }

                // Plugin runtime script (generated, not an asset)
                if (pluginDispatcher != null && RUNTIME_PATH.equals(path)) {
                    byte[] js = buildRuntimeJs().getBytes(java.nio.charset.Charset.forName("UTF-8"));
                    return new WebResourceResponse("application/javascript", "UTF-8", new ByteArrayInputStream(js));
                }

                // Map to assets/www/ directory
                String assetPath = ASSET_PREFIX + path;

                try {
                    InputStream inputStream = getAssets().open(assetPath);
                    String mimeType = resolveMimeType(path);
                    String encoding = isTextMimeType(mimeType) ? "UTF-8" : null;

                    // Apps with plugins get the runtime script as the first script of every page
                    if (pluginDispatcher != null && "text/html".equals(mimeType)) {
                        inputStream = injectRuntimeTag(inputStream);
                    }

                    return new WebResourceResponse(mimeType, encoding, inputStream);
                } catch (IOException e) {
                    // Asset not found — return null to let WebView show its own 404
                    return null;
                }
            }

            // Non-asset requests (real APIs, CDNs) — pass through to normal networking
            return null;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();

            // Keep navigation within our asset domain inside the WebView
            if (ASSET_HOST.equals(uri.getHost())) {
                return false;
            }

            String scheme = uri.getScheme();
            if ("http".equals(scheme) || "https".equals(scheme)) {
                // Legacy hybrid mode, or a host the developer explicitly allowed.
                String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
                if ("inapp".equals(externalLinksMode) || allowedHosts.contains(host)) {
                    return false;
                }
                // Default: external pages never load inside the WebView that
                // carries the Nitron bridge. Hand them to the system browser.
                if (request.isForMainFrame()) {
                    openInSystemBrowser(uri);
                    return true;
                }
                return false;
            }

            // Other schemes (tel:, mailto:, etc.) — let Android handle
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            super.onPageStarted(view, url, favicon);
            currentPageUrl = url;
        }

        @Override
        public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
            super.doUpdateVisitedHistory(view, url, isReload);
            currentPageUrl = url;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            currentPageUrl = url;
            // Hide splash screen when first page finishes loading
            hideSplash();
        }
    }

    /**
     * Open a URL in the system browser instead of inside the bridge-enabled WebView.
     */
    private void openInSystemBrowser(Uri uri) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            // No browser available — ignore.
        }
    }

    /**
     * True when the page currently shown comes from the app's own origin.
     * Safe to call from any thread (reads a volatile updated on the UI thread).
     */
    private boolean isAppOriginNow() {
        return isAppOrigin(currentPageUrl);
    }

    /**
     * Exact origin match: https scheme, the asset host, default port.
     * A prefix check would also accept "appassets.androidplatform.net.evil.com".
     */
    private static boolean isAppOrigin(String url) {
        if (url == null) return false;
        Uri u = Uri.parse(url);
        return "https".equals(u.getScheme())
            && ASSET_HOST.equals(u.getHost())
            && u.getPort() == -1;
    }

    /**
     * Read runtime configuration from AndroidManifest <meta-data>.
     * This allows Nitron's build pipeline to inject config without
     * modifying the compiled Java code.
     */
    private void readMetaData() {
        try {
            ApplicationInfo appInfo = getPackageManager()
                .getApplicationInfo(getPackageName(), PackageManager.GET_META_DATA);
            Bundle meta = appInfo.metaData;
            if (meta != null) {
                backButtonMode = meta.getString("nitron.backButton", "history");
                clearCacheOnStart = meta.getBoolean("nitron.clearCacheOnStart", false);
                externalLinksMode = meta.getString("nitron.externalLinks", "browser");
                String hosts = meta.getString("nitron.allowedHosts", "");
                if (hosts != null && !hosts.isEmpty()) {
                    for (String h : hosts.split(",")) {
                        String host = h.trim().toLowerCase();
                        if (!host.isEmpty()) allowedHosts.add(host);
                    }
                }
            }
        } catch (PackageManager.NameNotFoundException e) {
            // Use defaults
        }
    }

    /**
     * Setup a simple splash screen overlay.
     * It displays a solid color and is removed when the page loads.
     */
    private void setupSplashScreen() {
        String splashColor = "#FFFFFF";

        try {
            ApplicationInfo appInfo = getPackageManager()
                .getApplicationInfo(getPackageName(), PackageManager.GET_META_DATA);
            Bundle meta = appInfo.metaData;
            if (meta != null) {
                String color = meta.getString("nitron.splashBackground", "#FFFFFF");
                if (color != null && !color.isEmpty()) {
                    splashColor = color;
                }
            }
        } catch (PackageManager.NameNotFoundException e) {
            // Use default white
        }

        splashView = new View(this);
        try {
            splashView.setBackgroundColor(Color.parseColor(splashColor));
        } catch (IllegalArgumentException e) {
            splashView.setBackgroundColor(Color.WHITE);
        }

        rootLayout.addView(splashView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));
    }

    /**
     * Hide the splash screen with a fade-out animation.
     */
    private void hideSplash() {
        if (splashView != null && splashView.getVisibility() == View.VISIBLE) {
            AlphaAnimation fadeOut = new AlphaAnimation(1.0f, 0.0f);
            fadeOut.setDuration(300);
            fadeOut.setFillAfter(true);
            splashView.startAnimation(fadeOut);
            splashView.postDelayed(new Runnable() {
                @Override
                public void run() {
                    if (splashView != null) {
                        splashView.setVisibility(View.GONE);
                        rootLayout.removeView(splashView);
                        splashView = null;
                    }
                }
            }, 300);
        }
    }

    @Override
    public void onBackPressed() {
        if ("history".equals(backButtonMode) && webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        for (NitronPlugin p : loadedPlugins) {
            try { p.onPause(); } catch (Throwable t) { System.err.println("Nitron: plugin onPause failed: " + t); }
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        for (NitronPlugin p : loadedPlugins) {
            try { p.onResume(); } catch (Throwable t) { System.err.println("Nitron: plugin onResume failed: " + t); }
        }
    }

    @Override
    protected void onDestroy() {
        for (NitronPlugin p : loadedPlugins) {
            try { p.onDestroy(); } catch (Throwable t) { System.err.println("Nitron: plugin onDestroy failed: " + t); }
        }
        if (pluginDispatcher != null) {
            pluginDispatcher.shutdown();
        }
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if ((requestCode & 0xE000) == PLUGIN_REQUEST_BASE) {
            int index = (requestCode >> 8) & 0x1F;
            int code = requestCode & 0xFF;
            if (index < loadedPlugins.size()) {
                try {
                    loadedPlugins.get(index).onRequestPermissionsResult(code, permissions, grantResults);
                } catch (Throwable t) {
                    System.err.println("Nitron: plugin permission callback failed: " + t);
                }
            }
            return;
        }
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    // ─── Native plugins ────────────────────────────────────────────────

    /** What plugins may ask of the app. */
    private final PluginHost pluginHost = new PluginHost() {
        @Override
        public Activity activity() {
            return MainActivity.this;
        }

        @Override
        public void emit(String pluginName, String event, String dataJson) {
            runScriptInPage("window.__nitronEmit&&window.__nitronEmit("
                    + jsString(pluginName + ":" + event) + "," + jsString(dataJson) + ")");
        }

        @Override
        public void requestPermissions(final NitronPlugin plugin, final String[] permissions, final int requestCode) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    final int index = loadedPlugins.indexOf(plugin);
                    if (index < 0) return;
                    if (Build.VERSION.SDK_INT >= 23) {
                        MainActivity.this.requestPermissions(permissions, PLUGIN_REQUEST_BASE | (index << 8) | requestCode);
                    } else {
                        // Before Android 6 permissions are granted at install time
                        int[] granted = new int[permissions.length];
                        plugin.onRequestPermissionsResult(requestCode, permissions, granted);
                    }
                }
            });
        }

        @Override
        public void runOnUi(Runnable runnable) {
            runOnUiThread(runnable);
        }
    };

    /** The only object plugins are reachable through. Calls from other origins are ignored. */
    private class PluginBridge {
        @JavascriptInterface
        public void invoke(String plugin, String method, String argsJson, String callId) {
            if (pluginDispatcher == null || !isAppOriginNow()) return;
            pluginDispatcher.dispatch(plugin, method, argsJson, callId);
        }
    }

    /**
     * Load the plugins listed in assets/nitron-plugins.json (written at build time).
     * A plugin that fails to load is skipped; it never stops the app from starting.
     */
    private void loadPlugins() {
        String json = readAssetText(PLUGINS_REGISTRY);
        if (json == null) return;

        try {
            JSONArray entries = new JSONObject(json).optJSONArray("plugins");
            if (entries == null || entries.length() == 0) return;

            PluginDispatcher dispatcher = new PluginDispatcher(new PluginDispatcher.Sink() {
                @Override
                public void deliver(String callId, boolean ok, String payloadJson) {
                    runScriptInPage("window.__nitronResolve&&window.__nitronResolve("
                            + jsString(callId) + "," + ok + "," + jsString(payloadJson) + ")");
                }
            });

            for (int i = 0; i < entries.length(); i++) {
                JSONObject entry = entries.optJSONObject(i);
                if (entry == null) continue;
                String name = entry.optString("name", "");
                String className = entry.optString("class", "");
                try {
                    Class<?> cls = Class.forName(className);
                    if (!NitronPlugin.class.isAssignableFrom(cls)) {
                        throw new IllegalArgumentException(className + " does not extend NitronPlugin");
                    }
                    NitronPlugin plugin = (NitronPlugin) cls.getConstructor().newInstance();
                    plugin.attach(pluginHost, name);
                    dispatcher.register(name, plugin);
                    loadedPlugins.add(plugin);
                } catch (Throwable t) {
                    System.err.println("Nitron: plugin " + name + " (" + className + ") was not loaded: " + t);
                }
            }

            if (loadedPlugins.isEmpty()) {
                dispatcher.shutdown();
                return;
            }
            pluginDispatcher = dispatcher;
            webView.addJavascriptInterface(new PluginBridge(), "__NitronPlugins");

            for (NitronPlugin plugin : new ArrayList<NitronPlugin>(loadedPlugins)) {
                try {
                    plugin.onLoad();
                } catch (Throwable t) {
                    System.err.println("Nitron: plugin onLoad failed: " + t);
                }
            }
        } catch (Throwable t) {
            System.err.println("Nitron: could not read " + PLUGINS_REGISTRY + ": " + t);
        }
    }

    private String readAssetText(String name) {
        InputStream in = null;
        try {
            in = getAssets().open(name);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
            return new String(out.toByteArray(), "UTF-8");
        } catch (IOException e) {
            return null;
        } finally {
            if (in != null) {
                try { in.close(); } catch (IOException ignored) { }
            }
        }
    }

    /** Run JavaScript in the page, but only while the page is the app's own page. */
    private void runScriptInPage(final String script) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (webView != null && isAppOriginNow()) {
                    webView.evaluateJavascript(script, null);
                }
            }
        });
    }

    /** A JavaScript string literal for any text (safe against quotes, newlines and U+2028/9). */
    private static String jsString(String value) {
        return JSONObject.quote(value == null ? "" : value)
                .replace("\u2028", "\\u2028")
                .replace("\u2029", "\\u2029");
    }

    /** Insert the runtime script tag at the top of the document head. */
    private InputStream injectRuntimeTag(InputStream original) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            byte[] buf = new byte[8192];
            int n;
            while ((n = original.read(buf)) != -1) out.write(buf, 0, n);
        } finally {
            original.close();
        }
        String html = new String(out.toByteArray(), "UTF-8");

        int at = 0;
        Matcher m = HEAD_TAG.matcher(html);
        if (m.find()) {
            at = m.end();
        } else if ((m = HTML_TAG.matcher(html)).find()) {
            at = m.end();
        } else if ((m = DOCTYPE_TAG.matcher(html)).find()) {
            at = m.end();
        }
        String result = html.substring(0, at) + RUNTIME_TAG + html.substring(at);
        return new ByteArrayInputStream(result.getBytes("UTF-8"));
    }

    /** The runtime script for this app's plugins (see PluginRuntimeScript). */
    private String buildRuntimeJs() {
        List<String> nativeMethods = new ArrayList<String>();
        for (Method m : NitronJSInterface.class.getDeclaredMethods()) {
            if (m.isAnnotationPresent(JavascriptInterface.class)) {
                nativeMethods.add(m.getName());
            }
        }
        java.util.Map<String, List<String>> plugins = new java.util.LinkedHashMap<String, List<String>>();
        for (String name : pluginDispatcher.pluginNames()) {
            plugins.put(name, pluginDispatcher.methodNames(name));
        }
        return PluginRuntimeScript.build(nativeMethods, plugins);
    }

    // ─── MIME Type Resolution ──────────────────────────────────────────

    /**
     * Resolve MIME type from file path extension.
     * Covers all common web asset types including modern formats.
     */
    private static String resolveMimeType(String path) {
        if (path == null || path.isEmpty()) return "application/octet-stream";

        // Get extension
        int dot = path.lastIndexOf('.');
        if (dot == -1) return "application/octet-stream";
        String ext = path.substring(dot + 1).toLowerCase();

        switch (ext) {
            // HTML
            case "html": case "htm": return "text/html";

            // Styles
            case "css": return "text/css";

            // JavaScript
            case "js": case "mjs": return "application/javascript";

            // JSON
            case "json": return "application/json";

            // Images
            case "png": return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "gif": return "image/gif";
            case "svg": return "image/svg+xml";
            case "webp": return "image/webp";
            case "ico": return "image/x-icon";
            case "avif": return "image/avif";

            // Fonts
            case "woff": return "font/woff";
            case "woff2": return "font/woff2";
            case "ttf": return "font/ttf";
            case "otf": return "font/otf";
            case "eot": return "application/vnd.ms-fontobject";

            // Media
            case "mp4": return "video/mp4";
            case "webm": return "video/webm";
            case "mp3": return "audio/mpeg";
            case "ogg": return "audio/ogg";
            case "wav": return "audio/wav";

            // Other web assets
            case "wasm": return "application/wasm";
            case "map": return "application/json";
            case "xml": return "application/xml";
            case "txt": return "text/plain";
            case "pdf": return "application/pdf";

            default: return "application/octet-stream";
        }
    }

    /**
     * Check if a MIME type is text-based (needs UTF-8 encoding header).
     */
    private static boolean isTextMimeType(String mimeType) {
        return mimeType != null && (
            mimeType.startsWith("text/") ||
            mimeType.equals("application/javascript") ||
            mimeType.equals("application/json") ||
            mimeType.equals("application/xml") ||
            mimeType.equals("image/svg+xml") ||
            mimeType.equals("application/wasm")
        );
    }

    /**
     * JavaScript Interface to expose Native features to the WebView.
     */
    private class NitronJSInterface {
        @JavascriptInterface
        public void showNotification(String title, String message) {
            // Only the app's own pages may raise notifications.
            if (!isAppOriginNow()) return;
            NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            String channelId = "nitron_default_channel";

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = new NotificationChannel(
                        channelId,
                        "Default Notifications",
                        NotificationManager.IMPORTANCE_DEFAULT
                );
                notificationManager.createNotificationChannel(channel);
            }

            Intent intent = new Intent(MainActivity.this, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            
            PendingIntent pendingIntent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                pendingIntent = PendingIntent.getActivity(MainActivity.this, 0, intent, PendingIntent.FLAG_IMMUTABLE);
            } else {
                pendingIntent = PendingIntent.getActivity(MainActivity.this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT);
            }

            Notification.Builder builder;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                builder = new Notification.Builder(MainActivity.this, channelId);
            } else {
                builder = new Notification.Builder(MainActivity.this);
            }

            int iconResId = getApplicationInfo().icon;
            
            builder.setSmallIcon(iconResId)
                   .setContentTitle(title)
                   .setContentText(message)
                   .setAutoCancel(true)
                   .setContentIntent(pendingIntent);

            notificationManager.notify((int) System.currentTimeMillis(), builder.build());
        }

        private boolean isSafeOrigin() {
            return isAppOrigin(webView.getUrl());
        }

        @JavascriptInterface
        public void requestLocationPermission() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (!isSafeOrigin()) return;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                            MainActivity.this.requestPermissions(new String[]{
                                Manifest.permission.ACCESS_FINE_LOCATION,
                                Manifest.permission.ACCESS_COARSE_LOCATION
                            }, 101);
                        }
                    }
                }
            });
        }

        @JavascriptInterface
        public void requestCameraPermission() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (!isSafeOrigin()) return;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                            MainActivity.this.requestPermissions(new String[]{
                                Manifest.permission.CAMERA,
                                Manifest.permission.RECORD_AUDIO
                            }, 102);
                        }
                    }
                }
            });
        }

        @JavascriptInterface
        public void requestStoragePermission() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (!isSafeOrigin()) return;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        if (checkSelfPermission(Manifest.permission.READ_MEDIA_IMAGES) != PackageManager.PERMISSION_GRANTED) {
                            MainActivity.this.requestPermissions(new String[]{
                                Manifest.permission.READ_MEDIA_IMAGES,
                                Manifest.permission.READ_MEDIA_VIDEO
                            }, 103);
                        }
                    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        if (checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                            MainActivity.this.requestPermissions(new String[]{
                                Manifest.permission.READ_EXTERNAL_STORAGE,
                                Manifest.permission.WRITE_EXTERNAL_STORAGE
                            }, 103);
                        }
                    }
                }
            });
        }
    }
}
