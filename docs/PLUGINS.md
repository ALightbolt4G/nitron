# Writing Nitron plugins

A plugin is a Java class that gives your web app access to Android features that
`window.Nitron` does not cover: Bluetooth, usage stats, sensors, anything the Android
SDK offers. You write the Java, Nitron compiles it into the app, and your JavaScript
calls it like an async function.

```js
const { level, charging } = await Nitron.plugins.Battery.getStatus()
```

Plugins work in the Android build (APK and AAB). iOS builds ignore them with a warning.

## Requirements

- A full **JDK** (not just a JRE). `javac -version` must work in your terminal.
- Internet on the first plugin build: Nitron downloads `android.jar` and R8 (the tool that
  converts Java classes to Android's DEX format) into `~/.nitron/android/`. R8 needs **Java 11 or newer**.
- `minSdk` 21 or higher (the default).

Already have the Android SDK? Nitron uses `$ANDROID_HOME/build-tools/*/d8` or `lib/d8.jar` when it finds
them. You can also point to your own tools with `NITRON_D8` (a `d8` launcher) or `NITRON_R8_JAR` (an `r8.jar`).

Plugin builds also need a template that contains the plugin runtime. If you build the template
yourself, run `node scripts/prepare-template.js` after updating.

## Quick start

1. Create `plugins/BatteryPlugin.java` (a ready-made copy is in `examples/plugins/`):

```java
package com.example.plugins;

import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;

import com.nicron.webview.NitronMethod;
import com.nicron.webview.NitronPlugin;
import com.nicron.webview.PluginCall;

import org.json.JSONObject;

public class BatteryPlugin extends NitronPlugin {

    @NitronMethod
    public void getStatus(PluginCall call) throws Exception {
        Intent battery = getContext().registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        int level = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, -1);

        JSONObject result = new JSONObject();
        result.put("level", Math.round(100f * level / scale));
        call.resolve(result);
    }
}
```

2. List it in `nitron.config.json`:

```json
{
  "plugins": ["./plugins/BatteryPlugin.java"]
}
```

3. Build and call it from your page:

```bash
npx nitron build
```

```js
const status = await Nitron.plugins.Battery.getStatus()
console.log(status.level)
```

## The plugin class

- It must be **public**, **not abstract**, and a **top-level** class that extends `NitronPlugin`.
- It needs a **public constructor with no parameters**. Don't write a constructor; use `onLoad()` for setup.
- Its JavaScript name is the class name without the `Plugin` suffix: `BatteryPlugin` becomes `Nitron.plugins.Battery`.
  The name must be a plain identifier and unique in the app.
- Helper classes, abstract base classes and other files can live next to it. An entry in `plugins` can be a
  single `.java` file or a **directory**; a directory is compiled together as one unit.
- A plugin can use any Android API and any permission the app declares in `permissions`.

### Methods

Only methods marked `@NitronMethod` can be called from JavaScript. They must be `public`, take exactly one
`PluginCall`, and have a unique name (no overloads). Everything else stays private to Java.

`PluginCall` gives you:

| | |
| --- | --- |
| `getData()` | The object passed from JavaScript (never null). |
| `getString(key, default)`, `getInt`, `getLong`, `getDouble`, `getBoolean`, `has(key)` | Read arguments. |
| `resolve()` / `resolve(JSONObject)` | Finish successfully. |
| `reject(message)` / `reject(message, code)` | Fail. JavaScript gets an `Error` with `.message` and `.code`. |

Finish every call exactly once. Extra `resolve`/`reject` calls are ignored. You may finish a call later,
from any thread (a scan result, a callback). A call that is never finished leaves the JavaScript promise pending.
If a method throws, Nitron rejects that call with the exception message; the app does not crash.

### Threads

Plugin methods run on a **background thread**, never on the main thread. Use `runOnUiThread(Runnable)`
for anything that touches views, and keep each call reasonably short or finish it asynchronously.

### Events

Send data to the page whenever you like:

```java
emit("found", new JSONObject().put("name", "Speaker"));
```

```js
Nitron.on('Bluetooth:found', device => console.log(device))   // "PluginName:event"
Nitron.off('Bluetooth:found', handler)
```

Event names use letters, digits, `_`, `.` and `-`. Events are dropped while the visible page is not the app's own page.

### Permissions

Declare the permissions in `permissions` in `nitron.config.json` (Nitron warns if your plugin code mentions
one that is missing). For permissions that need the user's approval:

```java
requestPermissions(new String[]{Manifest.permission.CAMERA}, 1);   // requestCode 0 to 255

@Override
protected void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) { ... }
```

`hasPermission(String)` tells you whether a permission is already granted. Some permissions (for example
Usage Access) are not granted through a dialog; your plugin has to send the user to the matching Settings screen.
Google Play reviews sensitive permissions, so check its policy before you rely on them.

### Lifecycle

Override any of these if you need them: `onLoad()`, `onPause()`, `onResume()`, `onDestroy()`.

## When a plugin cannot be built

Nitron checks each plugin during the build and tells you what is wrong, with file and line for compile errors.
`onPluginError` decides what happens:

| Setting | Result |
| --- | --- |
| `"error"` (default) | The build stops with the message. Use this for releases. |
| `"warn"` | The failing plugin is left out, the app is built without it, and a warning is printed. |

With `"warn"`, JavaScript that calls the missing plugin fails at runtime, so guard it:

```js
if (Nitron.plugins && Nitron.plugins.Bluetooth) { ... }
```

Checks include: Java compile errors; the class is public with a public no-argument constructor; at least one
plugin class exists; no two plugins share a JavaScript name; at most 32 plugins; and a warning when a plugin
has no `@NitronMethod` or uses a permission that is not declared.

## Security notes

- Plugin code runs inside your app with all of your app's permissions. Only include code you trust.
- Calls are accepted only while the page shown is from the app's own origin, and only for `@NitronMethod` methods.
  External websites open in the system browser by default (`webview.externalLinks`).
- Android exposes JavaScript bridges to every frame of a page. **Do not embed untrusted iframes** in an app
  whose plugins do sensitive things.
- Arguments arrive as one JSON object (max 1 MB). Validate them like any other input.

## Limits

- Java only (no Kotlin yet) and no extra libraries (`.jar`/`.aar`) yet.
- Android only, `minSdk` 21+, up to 32 plugins per app.
- Overloaded method names are not supported.

## How it works

1. `javac` compiles each entry against `android.jar` and `template/nitron-plugin-api.jar` (the plugin API, compile-time only).
2. Nitron reads the compiled classes, finds the concrete subclasses of `NitronPlugin`, and checks them.
3. R8's D8 converts the classes to DEX; they are added to the app as `classes2.dex`, `classes3.dex`, ...
4. `assets/nitron-plugins.json` lists the plugins. At startup the app creates them and registers their methods.
5. Pages of the app get a small script (`/__nitron/runtime.js`, injected as the first script of each HTML page)
   that replaces `window.Nitron` with an object holding the built-in methods plus `plugins`, `on` and `off`.
   If the page cannot replace `window.Nitron`, the same object is available as `window.NitronRuntime`.

## Troubleshooting

- **`Nitron.plugins` is undefined:** the app has no plugins that loaded. Run
  `adb logcat | grep Nitron` and look for "plugin ... was not loaded". Also check that the template was rebuilt
  (`node scripts/prepare-template.js`).
- **`javac was not found`:** install a JDK and reopen the terminal.
- **`R8 needs Java 11 or newer`:** use JDK 11+ or set `NITRON_D8` to a `d8` launcher.
- **A call never finishes:** your method returned without calling `resolve` or `reject`.
- **Permission denied:** declare it in `permissions` and request it at runtime if Android requires it.

## Running the tests

```bash
npm run test:plugins
```

This compiles the plugin runtime on a normal JVM and runs the dispatcher tests, then runs the generated
JavaScript against a fake bridge in Node. It does not need a device. Test your own plugins on a real device.
