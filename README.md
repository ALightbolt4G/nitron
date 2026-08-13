<p align="center">
  <img src="assets/default-icon.png" width="120" height="120" alt="Nitron Logo" />
  <h1 align="center">⚡ Nitron v2.0</h1>
  <p align="center">
    <strong>Convert HTML/CSS/JS into a real Android APK — with zero Android SDK knowledge.</strong>
  </p>
  <p align="center">
    <a href="#quick-start">Quick Start</a> •
    <a href="#configuration">Configuration</a> •
    <a href="#web-first-runtime">Web-First Runtime</a> •
    <a href="#frameworks">Framework Compatibility</a> •
    <a href="#under-the-hood">Under the Hood</a>
  </p>
</p>

---

## 🚀 What's New in v2.0.1 (Official Web-First Runtime Release)

Nitron v2.0 has been officially approved and fully rewritten from the ground up. We stopped fighting Android and started tricking it.

- **Secure HTTPS Local Origin (`appassets.androidplatform.net`)**: We completely removed the deprecated `file://` protocol. Your local web files are now served securely via a custom `shouldInterceptRequest` handler.
- **Zero CORS Issues**: Absolute paths (`/assets/image.png`), `fetch()` requests to external HTTPS APIs, Cookies, and `localStorage` work flawlessly just like they do on a real browser.
- **Micro-Architecture**: The entire Android runtime overhead is exactly **9.6 KB** (`classes.dex`). No bloated WebView frameworks.
- **New Configuration System (`nitron.config.json`)**: Configure Nitron using a pure JSON file. Supports splash screen colors, hardware back-button logic, and cleartext traffic control.
- **Dynamic Icons**: Don't have an app icon? Nitron v2.0 automatically provides a sleek glowing neutron default icon at all DPI sizes!
- **Framework Presets**: Added the `--preset` flag to `nitron init` to scaffold configurations for `nextjs`, `vite`, `react`, and `vanilla`.

---

## 🤔 The Problem Nitron Solves

Every tool that turns web apps into Android apps eventually forces you to open Android Studio, install Gradle, configure a JDK, and think like an Android developer.

- **Capacitor** says "web-first" — then asks you to install Android Studio.  
- **Cordova** says "cross-platform" — then requires 8GB of RAM for a build.  
- **PWAs** can't ship on Google Play as real apps.

**Nitron makes Android completely invisible — not just simpler.**
You write HTML, CSS, and JavaScript. You run an npm command. You get a real `.apk` file in 3 seconds. That's it.

---

## ⚡ Quick Start

You can use Nitron globally or locally in your web project.

### 1. Initialize Nitron

Navigate to your web project (e.g., a Next.js or Vite project) and run:

```bash
npx nitron init --preset vanilla
```

This will generate a `nitron.config.json` file in your project root.

### 2. Build your Web App

Compile your framework into static HTML/JS/CSS files (e.g., `out/` for Next.js or `dist/` for Vite):

```bash
npm run build
```

### 3. Generate the APK

Run the Nitron build command targeting your output folder:

```bash
npx nitron build
```

**Output:** `dist/app.apk` — a real Android APK, ready to install on any device or upload to Google Play!

---

## ⚙️ Configuration (`nitron.config.json`)

Nitron is controlled via a simple `nitron.config.json` file. Here is a fully detailed example:

```json
{
  "name": "My App",
  "packageId": "com.myname.myapp",
  "version": "1.0.0",
  "entry": "out/index.html",
  "orientation": "portrait",
  "statusBar": true,
  "permissions": ["INTERNET", "ACCESS_NETWORK_STATE", "CAMERA"],
  "icon": "./public/icon.png",
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

### Configuration Options

- **`entry`**: The path to your compiled entry file (e.g., `out/index.html`). Nitron will smartly inject the *contents* of the `out` directory, keeping paths clean.
- **`permissions`**: Nitron v2.0 recognizes over 70+ Android permissions (API 21-34). `INTERNET` is automatically included.
- **`icon`**: Path to a `.png` or `.jpg`. Nitron will automatically generate adaptive Android mipmap icons (MDPI to XXXHDPI). If omitted, a default Nitron icon is used.
- **`webview.backButton`**: Set to `"history"` to make the Android hardware back-button trigger browser back navigation.
- **`network.cleartext`**: Set to `true` to allow HTTP traffic. Default is `false` (HTTPS only).

---

<a name="web-first-runtime"></a>

## 🌐 Framework Compatibility & Best Practices

Nitron seamlessly bundles the output of any web framework. Because v2.0 uses a proper HTTPS-like local origin, modern features work out of the box.

### Next.js (Static Export)

Nitron fully supports Next.js **Static Exports**. Set `output: "export"` in your `next.config.js`.

> [!WARNING]
> **Next.js Dynamic Routes Warning:**
> Next.js `output: "export"` strictly prohibits dynamic routes (like `/products/[id]/page.tsx`) unless you provide a `generateStaticParams` function.
> **The Nitron Best Practice:** Convert your dynamic routes to use **Query Parameters** (e.g., `/products/detail/page.tsx`) and read the ID using `useSearchParams()`. Wrap the component in a React `<Suspense>` boundary to allow flawless client-side rendering within the APK!

| Feature | Status | Notes |
| --- | --- | --- |
| Static pages | ✅ | Works perfectly |
| Client Components | ✅ | Works perfectly (Wrap `useSearchParams` in `<Suspense>`) |
| `fetch()` to external APIs | ✅ | Works perfectly. **Make sure your backend CORS allows `https://appassets.androidplatform.net`!** |
| Dynamic routes (`/[id]`) | ⚠️ | Must use Query Parameters (`?id=...`) instead. |
| Server Actions / API Routes | ❌ | No Node.js server at runtime. |

### Vite / React / Vue / Svelte

- **100% compatible.**
- You no longer need to worry about `base: './'` configs! Absolute paths from the root (`/assets/script.js`) resolve correctly because of the HTTPS local origin.

---

<a name="under-the-hood"></a>

## 🧠 Under the Hood

How does Nitron v2.0 achieve blazing fast builds without Gradle or Android Studio?

### 1. The Web-First Runtime

Instead of using the vulnerable `setAllowUniversalAccessFromFileURLs()`, Nitron ships with a custom `shouldInterceptRequest` implementation written in pure Java.
When the Android `WebView` requests `https://appassets.androidplatform.net/css/style.css`, Nitron intercepts this request and reads the file directly from the APK's `assets/www/css/style.css` in memory. This tricks the WebView into thinking it's browsing a secure remote server, enabling all modern web features. It even has fallback logic to detect `.html` extensions and handle Single Page Application (SPA) routing!

### 2. The Build Pipeline

When you run `nitron build`:

1. **No Gradle**: Gradle is too slow and heavy. We bypass it entirely.
2. **Pre-compiled Template**: Nitron uses a highly optimized `base.apk` template.
3. **Asset Injection**: We unzip the template, inject your HTML/JS assets into `assets/www/`, and dynamically modify the `AndroidManifest.xml`.
4. **On-the-fly Compilation**: Nitron automatically downloads a tiny, portable version of `aapt2` to compile your app's icon and resources instantly.
5. **Re-packaging**: The modified files are zipped back together and cryptographically signed with a debug keystore using Node.js.

The result? An APK built in under **3 seconds** using standard Node.js scripts.

---

## 📱 Android Compatibility

| Android | Status |
| --- | --- |
| Android 5.0 (API 21) | Supported* |
| Android 9 (API 28) | Supported |
| Android 13 (API 33) | Supported |
| Android 14 (API 34) | Supported |
| Android 16 (API 36) | Tested & Ready |

*\*Feature availability may vary by Android/WebView version.*

---

## 🛠️ Requirements

- **Node.js** 18 or later
- **npm** (comes with Node.js)
- **Java Runtime Environment (JRE)** 8+ (for APK signing only — auto-detected)

That's it. No Android SDK, no Android Studio, no Gradle.

---

## 📝 License

[MIT](LICENSE) © [ALightbolt4G](https://github.com/ALightbolt4G)
