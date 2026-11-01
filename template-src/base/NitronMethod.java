package com.nicron.webview;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks a method of a {@link NitronPlugin} as callable from JavaScript.
 *
 * The method must be public and take exactly one parameter, a {@link PluginCall}:
 *
 * <pre>
 *   &#64;NitronMethod
 *   public void getLevel(PluginCall call) { ... call.resolve(result); }
 * </pre>
 *
 * Only annotated methods are reachable from JavaScript. Everything else in the
 * plugin class stays private to Java.
 */
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
public @interface NitronMethod {
}
