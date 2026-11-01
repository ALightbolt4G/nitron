package com.nicron.webview;

import android.app.Activity;
import org.json.JSONObject;

import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * Plain-JVM tests for the plugin runtime (no Android device needed).
 * Run with: node scripts/test-plugin-runtime.js
 */
public class PluginDispatcherTest {

    static int passed = 0, failed = 0;

    static void check(boolean cond, String name) {
        if (cond) { passed++; System.out.println("  ok   " + name); }
        else { failed++; System.out.println("  FAIL " + name); }
    }

    static final class Result {
        final String callId; final boolean ok; final String payload; final String thread;
        Result(String c, boolean o, String p, String t) { callId = c; ok = o; payload = p; thread = t; }
    }

    static final BlockingQueue<Result> results = new LinkedBlockingQueue<Result>();
    static final PluginDispatcher.Sink SINK = new PluginDispatcher.Sink() {
        public void deliver(String callId, boolean ok, String payloadJson) {
            results.add(new Result(callId, ok, payloadJson, Thread.currentThread().getName()));
        }
    };

    static Result next() throws Exception {
        return results.poll(3, TimeUnit.SECONDS);
    }

    // ── fixtures ────────────────────────────────────────────────────────────

    public static class EchoPlugin extends NitronPlugin {
        @NitronMethod public void echo(PluginCall call) throws Exception {
            call.resolve(new JSONObject().put("msg", call.getString("msg", "none")).put("n", call.getInt("n", -1)));
        }
        @NitronMethod public void boom(PluginCall call) { throw new IllegalStateException("kaboom"); }
        @NitronMethod public void twice(PluginCall call) { call.resolve(); call.resolve(); call.reject("late"); }
        @NitronMethod public void later(final PluginCall call) {
            new Thread(new Runnable() { public void run() {
                try { Thread.sleep(100); } catch (InterruptedException e) { }
                call.resolve(new JSONObject());
            }}).start();
        }
        @NitronMethod public void whoami(PluginCall call) throws Exception {
            call.resolve(new JSONObject().put("thread", Thread.currentThread().getName()));
        }
        @NitronMethod public void send(PluginCall call) throws Exception {
            emit("tick", new JSONObject().put("v", 1));
            call.resolve();
        }
        public void notAnnotated(PluginCall call) { call.resolve(); }
        @NitronMethod public void wrongSignature(String s) { }
        @NitronMethod void notPublicMethod(PluginCall call) { }
    }

    public static class NoMethodsPlugin extends NitronPlugin {
        public void nothing(PluginCall call) { }
    }

    static final class Event { final String plugin, event, data; Event(String p, String e, String d) { plugin = p; event = e; data = d; } }
    static final BlockingQueue<Event> events = new LinkedBlockingQueue<Event>();
    static String lastPerm = null;

    static final PluginHost HOST = new PluginHost() {
        public Activity activity() { return null; }
        public void emit(String p, String e, String d) { events.add(new Event(p, e, d)); }
        public void requestPermissions(NitronPlugin plugin, String[] perms, int code) { lastPerm = perms[0] + "#" + code; }
        public void runOnUi(Runnable r) { r.run(); }
    };

    // ── tests ───────────────────────────────────────────────────────────────

    public static void main(String[] args) throws Exception {
        PluginDispatcher d = new PluginDispatcher(SINK);
        EchoPlugin echo = new EchoPlugin();
        echo.attach(HOST, "Echo");

        System.out.println("registration");
        List<String> methods = d.register("Echo", echo);
        check(methods.contains("echo") && methods.contains("boom"), "annotated methods are registered");
        check(!methods.contains("notAnnotated"), "unannotated public method is NOT callable");
        check(!methods.contains("wrongSignature"), "wrong signature is ignored");
        check(!methods.contains("notPublicMethod"), "non-public method is ignored");
        check(d.pluginNames().contains("Echo"), "plugin listed");

        try { d.register("Echo", echo); check(false, "duplicate name rejected"); }
        catch (IllegalArgumentException e) { check(true, "duplicate name rejected"); }
        try { d.register("bad name", new EchoPlugin()); check(false, "invalid name rejected"); }
        catch (IllegalArgumentException e) { check(true, "invalid name rejected"); }
        try { d.register("1abc", new EchoPlugin()); check(false, "name starting with digit rejected"); }
        catch (IllegalArgumentException e) { check(true, "name starting with digit rejected"); }
        try { d.register("Empty", new NoMethodsPlugin()); check(false, "plugin without @NitronMethod rejected"); }
        catch (IllegalArgumentException e) { check(true, "plugin without @NitronMethod rejected"); }

        System.out.println("calls");
        d.dispatch("Echo", "echo", "{\"msg\":\"hi\",\"n\":7}", "c1");
        Result r = next();
        check(r != null && r.ok && r.callId.equals("c1"), "echo resolves");
        JSONObject p = new JSONObject(r.payload);
        check("hi".equals(p.getString("msg")) && p.getInt("n") == 7, "arguments reach the plugin");

        d.dispatch("Echo", "echo", null, "c2");
        r = next();
        check(r.ok && new JSONObject(r.payload).getInt("n") == -1, "missing arguments become an empty object");

        d.dispatch("Echo", "whoami", "{}", "c3");
        r = next();
        check(new JSONObject(r.payload).getString("thread").startsWith("nitron-plugin-"), "plugin code runs on a background thread");

        d.dispatch("Echo", "boom", "{}", "c4");
        r = next();
        check(r != null && !r.ok && "PLUGIN_ERROR".equals(new JSONObject(r.payload).optString("code")), "exception becomes a rejected call");
        check(new JSONObject(r.payload).getString("message").contains("kaboom"), "rejection carries the message");

        d.dispatch("Echo", "twice", "{}", "c5");
        r = next();
        check(r != null && r.ok, "first resolve wins");
        check(results.poll(300, TimeUnit.MILLISECONDS) == null, "second resolve/reject is ignored");

        d.dispatch("Echo", "later", "{}", "c6");
        check(results.poll(30, TimeUnit.MILLISECONDS) == null, "async call stays pending");
        r = next();
        check(r != null && r.ok && r.callId.equals("c6"), "async call resolves later");

        System.out.println("rejections");
        d.dispatch("Nope", "echo", "{}", "e1");
        r = next();
        check(!r.ok && "PLUGIN_NOT_FOUND".equals(new JSONObject(r.payload).getString("code")), "unknown plugin");
        d.dispatch("Echo", "nope", "{}", "e2");
        r = next();
        check(!r.ok && "METHOD_NOT_FOUND".equals(new JSONObject(r.payload).getString("code")), "unknown method");
        d.dispatch("Echo", "notAnnotated", "{}", "e3");
        r = next();
        check(!r.ok && "METHOD_NOT_FOUND".equals(new JSONObject(r.payload).getString("code")), "unannotated method cannot be called");
        d.dispatch("Echo", "toString", "{}", "e4");
        r = next();
        check(!r.ok, "java.lang.Object methods cannot be called");
        d.dispatch("Echo", "echo", "{not json", "e5");
        r = next();
        check(!r.ok && "INVALID_ARGS".equals(new JSONObject(r.payload).getString("code")), "malformed JSON");
        d.dispatch("Echo", "echo", "[1,2]", "e6");
        r = next();
        check(!r.ok && "INVALID_ARGS".equals(new JSONObject(r.payload).getString("code")), "JSON array is not accepted");
        d.dispatch("Echo", "echo", "{}", "bad id!");
        check(results.poll(300, TimeUnit.MILLISECONDS) == null, "invalid call id gets no answer (and cannot inject)");
        d.dispatch("Echo", "echo\"); alert(1); //", "{}", "e7");
        r = next();
        check(!r.ok, "method name with quotes is rejected");

        StringBuilder big = new StringBuilder("{\"a\":\"");
        for (int i = 0; i < PluginDispatcher.MAX_ARGS_LENGTH; i++) big.append('x');
        big.append("\"}");
        d.dispatch("Echo", "echo", big.toString(), "e8");
        r = next();
        check(!r.ok && "INVALID_ARGS".equals(new JSONObject(r.payload).getString("code")), "oversized arguments");

        System.out.println("plugin API");
        d.dispatch("Echo", "send", "{}", "p1");
        next();
        Event ev = events.poll(1, TimeUnit.SECONDS);
        check(ev != null && ev.plugin.equals("Echo") && ev.event.equals("tick") && ev.data.contains("\"v\":1"), "emit reaches the host");
        try { echo.emit("bad event!", null); check(false, "invalid event name rejected"); }
        catch (IllegalArgumentException e) { check(true, "invalid event name rejected"); }
        try { echo.requestPermissions(new String[]{"x"}, 256); check(false, "requestCode > 255 rejected"); }
        catch (IllegalArgumentException e) { check(true, "requestCode > 255 rejected"); }
        echo.requestPermissions(new String[]{"android.permission.CAMERA"}, 5);
        check("android.permission.CAMERA#5".equals(lastPerm), "requestPermissions reaches the host");

        // many parallel calls
        for (int i = 0; i < 50; i++) d.dispatch("Echo", "echo", "{\"n\":" + i + "}", "m" + i);
        int got = 0;
        while (got < 50 && next() != null) got++;
        check(got == 50, "50 parallel calls all answered");

        d.shutdown();
        System.out.println("\n" + passed + " passed, " + failed + " failed");
        System.exit(failed == 0 ? 0 : 1);
    }
}
