package com.nicron.webview;

import org.json.JSONObject;

/**
 * One call from JavaScript to a plugin method. Finish it exactly once with
 * {@link #resolve(JSONObject)} or {@link #reject(String)}; later calls are ignored.
 * A call may be finished from any thread, and long after the method returned.
 */
public final class PluginCall {

    private final String methodName;
    private final String callId;
    private final JSONObject data;
    private final PluginDispatcher.Sink sink;
    private boolean finished = false;

    PluginCall(String methodName, String callId, JSONObject data, PluginDispatcher.Sink sink) {
        this.methodName = methodName;
        this.callId = callId;
        this.data = data == null ? new JSONObject() : data;
        this.sink = sink;
    }

    /** Name of the method being called. */
    public String getMethodName() {
        return methodName;
    }

    /** The object passed from JavaScript. Never null; empty when no argument was given. */
    public JSONObject getData() {
        return data;
    }

    public String getString(String key, String defaultValue) {
        return data.has(key) && !data.isNull(key) ? data.optString(key, defaultValue) : defaultValue;
    }

    public int getInt(String key, int defaultValue) {
        return data.optInt(key, defaultValue);
    }

    public long getLong(String key, long defaultValue) {
        return data.optLong(key, defaultValue);
    }

    public double getDouble(String key, double defaultValue) {
        return data.optDouble(key, defaultValue);
    }

    public boolean getBoolean(String key, boolean defaultValue) {
        return data.optBoolean(key, defaultValue);
    }

    public boolean has(String key) {
        return data.has(key) && !data.isNull(key);
    }

    /** Resolve the JavaScript promise with an empty object. */
    public void resolve() {
        resolve(new JSONObject());
    }

    /** Resolve the JavaScript promise with this object. */
    public void resolve(JSONObject result) {
        finish(true, (result == null ? new JSONObject() : result).toString());
    }

    /** Reject the JavaScript promise with an Error carrying this message. */
    public void reject(String message) {
        reject(message, null);
    }

    /** Reject with a message and a short machine-readable code (available as error.code). */
    public void reject(String message, String code) {
        finish(false, PluginDispatcher.errorJson(code, message));
    }

    private void finish(boolean ok, String payloadJson) {
        synchronized (this) {
            if (finished) return;
            finished = true;
        }
        sink.deliver(callId, ok, payloadJson);
    }

    /** True once resolve or reject was called. */
    public synchronized boolean isFinished() {
        return finished;
    }
}
