// MainActivity.java — Minimal WebView activity for Nitron APK template
//
// This is the single activity that ships inside every Nitron APK.
// It creates a full-screen WebView and loads index.html from assets/.
//
// To rebuild classes.dex from this source:
//   1. javac -classpath android.jar -d obj MainActivity.java
//   2. d8 --output . obj/com/nicron/webview/MainActivity.class
//
// The resulting classes.dex goes into template/base.apk

package com.nicron.webview;

import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Full-screen, no title bar
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        // Create WebView programmatically (no XML layout needed)
        webView = new WebView(this);

        // Configure WebView settings
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setDatabaseEnabled(true);

        // Handle navigation inside the WebView (don't open external browser)
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());

        // Load the entry HTML from assets/
        webView.loadUrl("file:///android_asset/index.html");

        // Set as content view
        setContentView(webView);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
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
}
