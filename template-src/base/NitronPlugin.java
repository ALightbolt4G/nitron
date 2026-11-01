package com.nicron.webview;

import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;

import org.json.JSONObject;

import java.util.regex.Pattern;

/**
 * Base class for Nitron plugins.
 *
 * <pre>
 *   public class BatteryPlugin extends NitronPlugin {
 *     &#64;NitronMethod
 *     public void getLevel(PluginCall call) { ... call.resolve(result); }
 *   }
 * </pre>
 *
 * In JavaScript the plugin appears as <code>Nitron.plugins.Battery</code> (the class
 * name without the "Plugin" suffix) and every {@link NitronMethod} returns a Promise.
 * The class must be public, have a public no-argument constructor, and not be abstract.
 *
 * Plugin methods run on a background thread. Use {@link #runOnUiThread(Runnable)}
 * for anything that touches views.
 */
public abstract class NitronPlugin {

    private static final Pattern EVENT_NAME = Pattern.compile("^[A-Za-z0-9_.-]{1,64}$");

    private PluginHost host;
    private String pluginName;

    /** Called by the runtime right after the plugin is created. */
    final void attach(PluginHost host, String pluginName) {
        this.host = host;
        this.pluginName = pluginName;
    }

    /** Called once, on the main thread, after the plugin is attached. */
    protected void onLoad() {
    }

    protected void onPause() {
    }

    protected void onResume() {
    }

    protected void onDestroy() {
    }

    /** Result of {@link #requestPermissions(String[], int)}. Runs on the main thread. */
    protected void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
    }

    /** The name JavaScript uses for this plugin (Nitron.plugins.&lt;name&gt;). */
    protected final String getName() {
        return pluginName;
    }

    protected final Activity getActivity() {
        return host.activity();
    }

    protected final Context getContext() {
        return host.activity().getApplicationContext();
    }

    /**
     * Send an event to JavaScript. The page listens with
     * <code>Nitron.on('PluginName:event', data =&gt; ...)</code>.
     * Events are dropped if the visible page is not the app's own page.
     */
    protected final void emit(String event, JSONObject data) {
        if (event == null || !EVENT_NAME.matcher(event).matches()) {
            throw new IllegalArgumentException("Invalid event name: " + event);
        }
        host.emit(pluginName, event, data == null ? "{}" : data.toString());
    }

    /**
     * Ask the user for Android runtime permissions. The answer arrives in
     * {@link #onRequestPermissionsResult(int, String[], int[])}.
     *
     * @param requestCode any number from 0 to 255 (it is private to this plugin)
     */
    protected final void requestPermissions(String[] permissions, int requestCode) {
        if (requestCode < 0 || requestCode > 255) {
            throw new IllegalArgumentException("requestCode must be between 0 and 255");
        }
        host.requestPermissions(this, permissions, requestCode);
    }

    /** True if the permission is granted (always true below Android 6 for install-time permissions). */
    protected final boolean hasPermission(String permission) {
        if (Build.VERSION.SDK_INT < 23) return true;
        return host.activity().checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    protected final void runOnUiThread(Runnable runnable) {
        host.runOnUi(runnable);
    }
}
