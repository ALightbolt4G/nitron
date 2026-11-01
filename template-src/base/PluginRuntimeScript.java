package com.nicron.webview;

import java.util.List;
import java.util.Map;

/**
 * Builds the JavaScript that gives pages window.Nitron.plugins, Nitron.on / Nitron.off and the
 * Promise plumbing. Free of Android code so it can be tested on a normal JVM (and run in Node).
 *
 * window.Nitron is replaced by a plain JavaScript object that forwards the built-in
 * methods (showNotification, ...) to the native object, so existing code keeps working.
 * Plugin and method names reaching this class are plain identifiers (checked by PluginDispatcher),
 * so they are safe inside quoted JavaScript strings.
 */
final class PluginRuntimeScript {

    private PluginRuntimeScript() {
    }

    static String build(List<String> nativeMethods, Map<String, List<String>> plugins) {
        StringBuilder sb = new StringBuilder();
        sb.append("(function(){\n");
        sb.append("if(window.__nitronRuntimeReady)return;window.__nitronRuntimeReady=true;\n");
        sb.append("var bridge=window.__NitronPlugins,native=window.Nitron,pending={},handlers={},seq=0;\n");
        sb.append("function invoke(p,m,d){return new Promise(function(res,rej){");
        sb.append("var id='c'+(++seq)+'_'+Math.random().toString(36).slice(2,8);");
        sb.append("pending[id]={res:res,rej:rej};");
        sb.append("try{bridge.invoke(p,m,JSON.stringify(d===undefined?{}:d),id);}catch(e){delete pending[id];rej(e);}");
        sb.append("});}\n");
        sb.append("window.__nitronResolve=function(id,ok,payload){var c=pending[id];if(!c)return;delete pending[id];");
        sb.append("var v;try{v=JSON.parse(payload);}catch(e){v=payload;}");
        sb.append("if(ok){c.res(v);}else{var err=new Error(v&&v.message?v.message:'Plugin call failed');err.code=v&&v.code;c.rej(err);}};\n");
        sb.append("window.__nitronEmit=function(name,payload){var l=handlers[name];if(!l)return;");
        sb.append("var v;try{v=JSON.parse(payload);}catch(e){v=payload;}");
        sb.append("l.slice().forEach(function(f){try{f(v);}catch(e){console.error(e);}});};\n");
        sb.append("var api={};\n");

        for (String n : nativeMethods) {
            sb.append("api['").append(n).append("']=function(){return native['").append(n)
              .append("'].apply(native,arguments);};\n");
        }

        sb.append("api.plugins={};\n");
        for (Map.Entry<String, List<String>> plugin : plugins.entrySet()) {
            sb.append("api.plugins['").append(plugin.getKey()).append("']={");
            for (String method : plugin.getValue()) {
                sb.append("'").append(method).append("':function(d){return invoke('")
                  .append(plugin.getKey()).append("','").append(method).append("',d);},");
            }
            sb.append("};\n");
        }

        sb.append("api.on=function(n,f){(handlers[n]=handlers[n]||[]).push(f);};\n");
        sb.append("api.off=function(n,f){var l=handlers[n];if(!l)return;var i=l.indexOf(f);if(i>=0)l.splice(i,1);};\n");
        sb.append("window.Nitron=api;if(window.Nitron!==api){window.NitronRuntime=api;}\n");
        sb.append("})();\n");
        return sb.toString();
    }
}
