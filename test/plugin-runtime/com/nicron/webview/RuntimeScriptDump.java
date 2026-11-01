package com.nicron.webview;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Prints the generated runtime script, so Node can run it against a fake bridge. */
public class RuntimeScriptDump {
    public static void main(String[] args) {
        List<String> nativeMethods = Arrays.asList("showNotification", "requestCameraPermission");
        Map<String, List<String>> plugins = new LinkedHashMap<String, List<String>>();
        plugins.put("Echo", new ArrayList<String>(Arrays.asList("echo", "boom")));
        plugins.put("Battery", new ArrayList<String>(Arrays.asList("getStatus")));
        System.out.print(PluginRuntimeScript.build(nativeMethods, plugins));
    }
}
