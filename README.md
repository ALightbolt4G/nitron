<p align="center">
  <h1 align="center">⚡ Nitron v2.0</h1>
  <p align="center">
    <strong>Convert HTML/CSS/JS into a real Android APK — with zero Android knowledge.</strong>
  </p>
  <p align="center">
    <a href="#quick-start">Quick Start</a> •
    <a href="#configuration">Configuration</a> •
    <a href="#web-first-runtime">Web-First Runtime</a> •
    <a href="#frameworks">Framework Compatibility</a>
  </p>
</p>

---

## What's New in v2.0.0 (The Web-First Runtime Update)

- 🚀 **Web-First Runtime (HTTPS-like local origin):** Completely rewrote the Android WebView runtime. We replaced the insecure and deprecated `file://` protocol with a custom `shouldInterceptRequest` handler that serves your local assets via an `https://` origin (`https://appassets.androidplatform.net/`).
  - Absolute paths (`/assets/image.png`) now work perfectly without regex rewriting.
  - `fetch()` requests to external HTTPS APIs now work normally, subject to the API's own CORS policy.
  - Cookies and `localStorage` are available using the WebView's HTTPS-like application origin.
- ⚙️ **New Configuration System (`nitron.config.json`):** You can now configure Nitron using a pure JSON file. No more need for a `package.json` in your build output folder!
- 🖼️ **Framework Presets:** Added the `--preset` flag to `nitron init` to automatically scaffold configurations for `nextjs`, `vite`, `react`, and `vanilla`.
- 🛡️ **Massive Permissions Expansion:** Expanded the known Android permissions dictionary from 21 to 70+, covering modern Android API levels (21–34+).
- ✨ **Default Icon:** If you don't provide an icon, Nitron automatically generates a fallback icon instead of failing the build.
- 🔧 **Advanced WebView Controls:** You can now configure `network.cleartext` (HTTP vs HTTPS), splash screen backgrounds, and hardware back-button behavior directly in your config.

---

## The Problem

Every tool that turns web apps into Android apps eventually forces you to open Android Studio, install Gradle, configure a JDK, and think like an Android developer.

Capacitor says "web-first" — then asks you to install Android Studio.  
Cordova says "cross-platform" — then requires 8GB of RAM for a build.  
PWAs can't ship on Google Play as real apps.

**Nitron makes Android completely invisible — not just simpler.**

You write HTML, CSS, and JavaScript. You run an npm command. You get a real `.apk` file in seconds. That's it.

---

## Quick Start

```bash
npx nitron init my-app --preset vanilla
cd my-app
npm run dev     # to preview locally
npm run build   # to generate APK
```

**Output:** `dist/app.apk` — a real Android APK, ready to install on any device or upload to Google Play.

No Android Studio. No Gradle. No SDK. Just npm and a Java runtime.

---

## Configuration (`nitron.config.json`)

The recommended way to configure your app is via `nitron.config.json` at the root of your project:

```json
{
  "name": "My App",
  "packageId": "com.myname.myapp",
  "version": "1.0.0",
  "entry": "index.html",
  "orientation": "portrait",
  "statusBar": true,
  "permissions": ["INTERNET", "CAMERA"],
  "icon": "./assets/icon.png",
  "network": {
    "cleartext": false
  },
  "webview": {
    "backButton": "history",
    "clearCacheOnStart": false
  },
  "splashScreen": {
    "backgroundColor": "#FFFFFF"
  }
}
```

*(Note: `app.js` and `package.json` configuration blocks are still fully supported for backwards compatibility).*

---

<a name="web-first-runtime"></a>

## Web-First Runtime

Nitron does not load your application using `file://`.

Instead, the WebView uses a local HTTPS-like origin:

`https://appassets.androidplatform.net/`

When the WebView requests a local asset, Nitron maps the URL to the application's bundled files:

```
https://appassets.androidplatform.net/assets/app.js
                         ↓
                    Nitron Runtime
                         ↓
                 APK assets/www/assets/app.js
```

Requests to external HTTPS URLs are passed through to the normal WebView networking stack. This architecture ensures absolute paths, framework assets (like `_next/`), and web APIs function exactly as intended.

---

<a name="frameworks"></a>

## Framework Compatibility Matrix

Nitron seamlessly bundles the output of any web framework. Because v2.0 uses a proper HTTPS-like local origin, modern features work out of the box.

### Next.js (Static Export)

Nitron fully supports Next.js **Static Exports**. Set `output: "export"` in your `next.config.js`.

| Feature | Status | Notes |
| --- | --- | --- |
| Static pages | ✅ | Works perfectly |
| Client Components | ✅ | Works perfectly |
| Browser APIs | ✅ | Works perfectly |
| Static assets / fonts / images | ✅ | Works perfectly (absolute paths supported) |
| `fetch()` to external APIs | ✅ | Works perfectly |
| Dynamic routes (`/[id]`) | ⚠️ | Requires `generateStaticParams()` |
| `getServerSideProps` | ❌ | No Node.js server at runtime |
| API routes | ❌ | No Node.js server at runtime |
| Server Actions | ❌ | No Node.js server at runtime |

### Vite / React / Vue / Svelte

- 100% compatible.
- You no longer need to worry about `base: './'` config; absolute paths from the root (`/assets/script.js`) resolve correctly!

---

## How It Works

Nitron uses a pre-built Android WebView template. When you run `npm run build`, it executes an 8-step pipeline that produces a signed APK in seconds without generating an Android project:

```
Your project
     ↓
Nitron
     ├── validates configuration
     ├── bundles web assets
     ├── patches Android metadata
     ├── packages the Web-First Runtime
     └── signs the APK
            ↓
        app.apk
```

The entire process takes seconds, uses ~200MB of RAM, and never shows you a single Android error message.

---

## Android Compatibility

Nitron packages applications using a WebView runtime and targets modern Android versions while maintaining compatibility with its configured minimum SDK.

| Android | Status |
| --- | --- |
| Android 5.0 (API 21) | Supported* |
| Android 9 (API 28) | Supported |
| Android 13 (API 33) | Supported |
| Android 14 (API 34) | Supported |
| Android 16 (API 36) | Tested |

*\*Feature availability may vary by Android/WebView version.*

---

## Requirements

- **Node.js** 18 or later
- **npm** (comes with Node.js)
- **Java Runtime Environment (JRE)** 8+ (for APK signing only — auto-detected)

That's it. No Android SDK, no Android Studio, no Gradle.

---

## License

[MIT](LICENSE) © [ALightbolt4G](https://github.com/ALightbolt4G)
