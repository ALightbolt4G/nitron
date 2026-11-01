package com.nicron.webview;

import org.json.JSONException;
import org.json.JSONObject;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.regex.Pattern;

/**
 * Finds the {@link NitronMethod}s of each plugin and runs calls coming from JavaScript.
 *
 * Deliberately free of Android-specific code (it only needs org.json) so its behavior
 * can be tested on a normal JVM.
 *
 * Safety rules:
 *  - only public methods annotated with {@link NitronMethod}, taking one {@link PluginCall}, are callable;
 *  - plugin and method names must be plain identifiers;
 *  - an exception inside a plugin rejects that call, it never crashes the app;
 *  - plugin code never runs on the main thread.
 */
final class PluginDispatcher {

    /** Where results go (the page, in the real app). */
    interface Sink {
        void deliver(String callId, boolean ok, String payloadJson);
    }

    static final int MAX_ARGS_LENGTH = 1024 * 1024;
    static final int MAX_PLUGINS = 32;

    private static final Pattern IDENT = Pattern.compile("^[A-Za-z_][A-Za-z0-9_]{0,63}$");
    private static final Pattern CALL_ID = Pattern.compile("^[A-Za-z0-9_-]{1,64}$");

    private static final class Registered {
        final NitronPlugin plugin;
        final Map<String, Method> methods = new LinkedHashMap<String, Method>();

        Registered(NitronPlugin plugin) {
            this.plugin = plugin;
        }
    }

    private final Sink sink;
    private final ExecutorService executor;
    private final Map<String, Registered> plugins = new LinkedHashMap<String, Registered>();

    PluginDispatcher(Sink sink) {
        this.sink = sink;
        this.executor = Executors.newCachedThreadPool(new ThreadFactory() {
            private int n = 0;

            @Override
            public synchronized Thread newThread(Runnable r) {
                Thread t = new Thread(r, "nitron-plugin-" + (++n));
                t.setDaemon(true);
                return t;
            }
        });
    }

    /**
     * Register a plugin under a JavaScript-visible name.
     *
     * @return the callable method names
     * @throws IllegalArgumentException for a bad name, a duplicate, or a plugin without callable methods
     */
    synchronized List<String> register(String name, NitronPlugin plugin) {
        if (name == null || !IDENT.matcher(name).matches()) {
            throw new IllegalArgumentException("Invalid plugin name: " + name);
        }
        if (plugins.containsKey(name)) {
            throw new IllegalArgumentException("Duplicate plugin name: " + name);
        }
        if (plugins.size() >= MAX_PLUGINS) {
            throw new IllegalArgumentException("Too many plugins (max " + MAX_PLUGINS + ")");
        }

        Registered reg = new Registered(plugin);
        for (Method m : plugin.getClass().getMethods()) {
            if (!m.isAnnotationPresent(NitronMethod.class)) continue;
            Class<?>[] params = m.getParameterTypes();
            if (params.length != 1 || params[0] != PluginCall.class) {
                System.err.println("Nitron: " + name + "." + m.getName()
                        + " ignored: a @NitronMethod must take exactly one PluginCall parameter");
                continue;
            }
            if (!IDENT.matcher(m.getName()).matches()) continue;
            if (reg.methods.containsKey(m.getName())) {
                System.err.println("Nitron: " + name + "." + m.getName()
                        + " ignored: overloaded @NitronMethod names are not supported");
                continue;
            }
            try {
                m.setAccessible(true);
            } catch (SecurityException ignored) {
            }
            reg.methods.put(m.getName(), m);
        }
        if (reg.methods.isEmpty()) {
            throw new IllegalArgumentException("Plugin " + name + " has no public @NitronMethod methods");
        }
        plugins.put(name, reg);
        return new ArrayList<String>(reg.methods.keySet());
    }

    synchronized List<String> pluginNames() {
        return new ArrayList<String>(plugins.keySet());
    }

    synchronized List<String> methodNames(String plugin) {
        Registered reg = plugins.get(plugin);
        return reg == null ? new ArrayList<String>() : new ArrayList<String>(reg.methods.keySet());
    }

    private synchronized Registered lookup(String plugin) {
        return plugin == null ? null : plugins.get(plugin);
    }

    /**
     * Run one call. Never throws; every problem becomes a rejected call.
     * The Sink may be invoked from any thread.
     */
    void dispatch(String pluginName, final String methodName, String argsJson, final String callId) {
        if (callId == null || !CALL_ID.matcher(callId).matches()) {
            return; // no valid id, so there is nobody to answer
        }

        final Registered reg = lookup(pluginName);
        if (reg == null) {
            reject(callId, "PLUGIN_NOT_FOUND", "Unknown plugin: " + pluginName);
            return;
        }
        final Method method = methodName == null ? null : reg.methods.get(methodName);
        if (method == null) {
            reject(callId, "METHOD_NOT_FOUND", "Unknown method: " + pluginName + "." + methodName);
            return;
        }

        JSONObject data;
        try {
            if (argsJson != null && argsJson.length() > MAX_ARGS_LENGTH) {
                reject(callId, "INVALID_ARGS", "Arguments are too large");
                return;
            }
            data = (argsJson == null || argsJson.trim().isEmpty()) ? new JSONObject() : new JSONObject(argsJson);
        } catch (JSONException e) {
            reject(callId, "INVALID_ARGS", "Arguments must be a JSON object");
            return;
        }

        final PluginCall call = new PluginCall(methodName, callId, data, sink);
        try {
            executor.execute(new Runnable() {
                @Override
                public void run() {
                    try {
                        method.invoke(reg.plugin, call);
                    } catch (InvocationTargetException e) {
                        Throwable cause = e.getCause() != null ? e.getCause() : e;
                        System.err.println("Nitron: plugin error in " + methodName + ": " + cause);
                        call.reject(String.valueOf(cause.getMessage() != null ? cause.getMessage() : cause), "PLUGIN_ERROR");
                    } catch (Throwable t) {
                        System.err.println("Nitron: could not call " + methodName + ": " + t);
                        call.reject("Could not call " + methodName, "PLUGIN_ERROR");
                    }
                }
            });
        } catch (RuntimeException e) {
            reject(callId, "SHUTDOWN", "Plugins are shutting down");
        }
    }

    void shutdown() {
        executor.shutdownNow();
    }

    private void reject(String callId, String code, String message) {
        sink.deliver(callId, false, errorJson(code, message));
    }

    static String errorJson(String code, String message) {
        JSONObject o = new JSONObject();
        try {
            if (code != null) o.put("code", code);
            o.put("message", message == null ? "" : message);
        } catch (JSONException ignored) {
        }
        return o.toString();
    }
}
