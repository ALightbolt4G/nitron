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

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.webkit.JavascriptInterface;

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
                        if (request.getOrigin() != null && request.getOrigin().toString().startsWith("https://" + ASSET_HOST)) {
                            request.grant(request.getResources());
                        } else {
                            request.deny();
                        }
                    }
                });
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (origin != null && origin.startsWith("https://" + ASSET_HOST)) {
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

                // Map to assets/www/ directory
                String assetPath = ASSET_PREFIX + path;

                try {
                    InputStream inputStream = getAssets().open(assetPath);
                    String mimeType = resolveMimeType(path);
                    String encoding = isTextMimeType(mimeType) ? "UTF-8" : null;

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

            // For external URLs (http/https to other domains),
            // also load inside WebView to support hybrid apps
            String scheme = uri.getScheme();
            if ("http".equals(scheme) || "https".equals(scheme)) {
                return false;
            }

            // Other schemes (tel:, mailto:, etc.) — let Android handle
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            // Hide splash screen when first page finishes loading
            hideSplash();
        }
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
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
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
            String url = webView.getUrl();
            return url != null && url.startsWith("https://" + ASSET_HOST);
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
