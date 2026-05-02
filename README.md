<p align="center">
  <h1 align="center">⚡ Nitron</h1>
  <p align="center">
    <strong>Convert HTML/CSS/JS into a real Android APK — with zero Android knowledge.</strong>
  </p>
  <p align="center">
    <a href="#quick-start">Quick Start</a> •
    <a href="#configuration">Configuration</a> •
    <a href="#how-it-works">How It Works</a> •
    <a href="#comparison">Comparison</a>
  </p>
</p>

---

## What's New in v1.2.0
- ✅ Linux and Mac support
> **Note:** Linux and Mac support is implemented but not yet tested on physical machines. Community feedback welcome — if you encounter issues, please open a GitHub issue.
- ✅ Custom dev server port (\`--port\`)
- ✅ Improved permissions validation
- ✅ Multi-page navigation support
- ✅ Tested with React and Vue
- ✅ Android compatibility table
- ✅ Dependency updates and security improvements

---

## The Problem

Every tool that turns web apps into Android apps eventually forces you to open Android Studio, install Gradle, configure a JDK, and think like an Android developer.

Capacitor says "web-first" — then asks you to install Android Studio.  
Cordova says "cross-platform" — then requires 8GB of RAM for a build.  
PWAs can't ship on Google Play as real apps.

**Nitron makes Android completely invisible — not just simpler.**

You write HTML, CSS, and JavaScript. You run an npm command. You get a real `.apk` file. That's it.

---

## Quick Start

```bash
npx nitron init my-app
cd my-app
npm run dev     # to preview locally
npm run build   # to generate APK
```

**Output:** `dist/app.apk` — a real Android APK, ready to install on any device or upload to Google Play.

No Android Studio. No Gradle. No SDK. Just npm and a Java runtime.

---

## Configuration

All app settings live in a single `app.js` file:

```javascript
import { app } from 'nitron'

app.init({
  name: "My App",
  packageId: "com.myname.myapp",
  version: "1.0.0",
  entry: "index.html",
  orientation: "portrait",
  permissions: ["INTERNET", "CAMERA"],
  icon: "./assets/icon.png"
})
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | **required** | App display name on the device |
| `packageId` | `string` | **required** | Unique Android package ID (e.g. `com.myname.myapp`) |
| `version` | `string` | `"1.0.0"` | App version |
| `entry` | `string` | `"index.html"` | HTML entry point loaded by the app |
| `orientation` | `string` | `"portrait"` | `portrait` / `landscape` / `auto` |
| `statusBar` | `boolean` | `true` | Show or hide the Android status bar |
| `permissions` | `string[]` | `[]` | Android permissions (e.g. `CAMERA`, `INTERNET`) |
| `icon` | `string` | `null` | Path to app icon image |

---

## How It Works

Nitron uses a pre-built Android WebView template. When you run `npm run build`, it executes an 8-step pipeline that produces a signed APK in seconds:

```
npm run build
      │
      ▼
[1] Read Config       → Parse app.js + package.json
[2] Validate          → Check files exist, fields are valid
[3] Unpack Template   → Extract base WebView APK to temp dir
[4] Inject Assets     → Copy your HTML/CSS/JS into the APK
[5] Patch Manifest    → Write app name, package ID, permissions
[6] Repack            → Zip everything back into .apk format
[7] Sign              → Auto-sign with debug keystore
[8] Output            → dist/app.apk ✓
```

The entire process takes seconds, uses ~200MB of RAM, and never shows you a single Android error message.

> **Technical Note:** Nitron uses a custom, pure JavaScript AXML binary encoder. This means it generates the binary `AndroidManifest.xml` natively in Node.js, completely eliminating the need for bulky Android dependencies like `apktool` or `aapt2`.

---

## Framework Compatibility

Nitron seamlessly bundles the output of any web framework. Build your app using your favorite tool, and point Nitron to the output directory (e.g. `dist/` or `build/`).

- **React / Vite**: 100% compatible. Ensure you use relative paths in your build config (`base: './'`).
- **Vue**: 100% compatible.
- **Vanilla JS**: 100% compatible.

---

## Supported Android Versions

| Android Version | API Level | Supported |
|---|---|---|
| Android 5.0 (Lollipop) | 21 | ✅ Min supported |
| Android 9.0 (Pie) | 28 | ✅ |
| Android 11 | 30 | ✅ |
| Android 13 | 33 | ✅ |
| Android 14 | 34 | ✅ Target SDK |
| Android 16 | 36 | ✅ Tested |

---

## Comparison

| Feature | Nitron | Capacitor | Cordova | PWA |
|---|---|---|---|---|
| Needs Android Studio | ❌ Never | ✅ Always | ✅ Always | — |
| Needs Gradle | ❌ Never | ✅ Always | ✅ Always | — |
| Needs Java / JDK | ⚠️ JRE only(minimal) | ✅ Always | ✅ Always | — |
| npm-only workflow | ✅ Yes | ❌ No | ❌ No | ✅ Yes |
| Real APK output | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No |
| Google Play ready | ⚠️ Need Tests | ✅ Yes | ✅ Yes | ❌ No |
| Build time | Seconds | Minutes | Minutes | — |
| RAM during build | ~200MB | 4–16GB | 4–8GB | — |
| Setup time | ~60 seconds | 30–60 minutes | 30–60 minutes | Fast |
| Error messages | Web-friendly | Android stacktraces | Android stacktraces | — |
| iOS Support | ❌ No | ✅ Yes | ✅ Yes | ⚠️ Partial |

JRE 8+ required for APK signing. No JDK, no Android SDK, no Gradle.
---

## Project Structure

A Nitron project looks like any web project:

```
my-app/
├── index.html      ← Your app UI
├── style.css       ← Your styles
├── main.js         ← Your logic
├── app.js          ← Nitron config
└── package.json    ← npm config
```

No `android/` folder. No `platforms/`. No `gradle.properties`. Just your web files.

---

## Current Status

| Phase | Status | Description |
|---|---|---|
| Phase 1 | ✅ Complete | CLI scaffold, config reader, validator |
| Phase 2 | ✅ Complete | APK Build Pipeline (unpack → inject → sign) |
| Phase 3 | ✅ Complete | Developer Experience Polish (`init` and `dev`) |
| Phase 4 | ✅ Complete | Multi-Target Output (APK + PWA) |
| Phase 5 | ✅ Complete | Publishing Helpers, release signing |

---

## Production Release

When you are ready to publish your Android app to Google Play, you need a release keystore.

1. Generate a keystore (only do this once!):
   ```bash
   npx nitron keystore
   ```
2. Build for release:
   ```bash
   npx nitron build --release
   ```
   You will be prompted for your keystore password, and Nitron will generate a release-signed APK along with a Google Play checklist.

---

## Multi-Target Output (PWA)

Nitron can build both an Android APK and a Progressive Web App (PWA) from the exact same configuration.

```bash
npx nitron build --target android  # Default: Generates dist/app.apk
npx nitron build --target pwa      # Generates dist/pwa/
npx nitron build --target all      # Generates both
```

When building for `--target pwa`, Nitron automatically:
- Copies your assets to `dist/pwa/`
- Generates a fully compliant `manifest.json` based on `app.js`
- Generates a `service-worker.js` that caches all your assets for offline use
- Injects the necessary tags into your `index.html`

---

## Requirements

- **Node.js** 18 or later
- **npm** (comes with Node.js)
- **Java Runtime** 8+ (for APK signing only — auto-detected)

That's it. No Android SDK, no Android Studio, no Gradle.

---

## Contributing

Contributions are welcome! Nitron is an open-source project and community feedback is what makes it better.

### How to contribute

1. Fork the repository
2. Create a new branch: `git checkout -b feat/your-feature`
3. Make your changes
4. Run the build: `npm run build`
5. Test locally: `node dist/cli.js build`
6. Commit and push: `git commit -m "feat: your feature"`
7. Open a Pull Request

### What we need help with

- Testing on Linux and Mac (most needed right now)
- Testing with different web frameworks (React, Vue, Svelte, etc.)
- Testing on different Android versions
- Bug reports and edge cases

### Reporting issues

Please open a GitHub issue with:
- Your OS and version
- Node.js version
- The full error message
- Steps to reproduce

---

## License

[MIT](LICENSE) © [ALightbolt4G](https://github.com/ALightbolt4G)