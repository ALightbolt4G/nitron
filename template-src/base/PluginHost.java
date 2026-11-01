package com.nicron.webview;

import android.app.Activity;

/** What a plugin may ask of the app. Implemented by MainActivity. */
interface PluginHost {
    Activity activity();

    /** Send an event to the page as "PluginName:event". */
    void emit(String pluginName, String event, String dataJson);

    void requestPermissions(NitronPlugin plugin, String[] permissions, int requestCode);

    void runOnUi(Runnable runnable);
}
