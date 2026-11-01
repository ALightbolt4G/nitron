# Changelog

## v3.2.0

### Added
- **Native plugins (Android).** Write Java classes that extend `NitronPlugin`, list them in `plugins` in `nitron.config.json`, and call them from JavaScript as promises (`Nitron.plugins.Battery.getStatus()`). Plugins can send events (`Nitron.on('Bluetooth:found', ...)`), request permissions and react to the app lifecycle.
- `onPluginError`: `"error"` (default) stops the build when a plugin fails; `"warn"` leaves that plugin out and builds the app. Problems are reported with file and line (compile errors), or as a clear message (no plugin class, missing public constructor, duplicate name, minSdk below 21, outdated template).
- Examples in `examples/plugins/` (battery, Bluetooth) and a guide in `docs/PLUGINS.md`.
- `npm run test:plugins`: JVM tests for the plugin runtime and Node tests for the generated JavaScript (no device needed).
- AAB builds include every `classes*.dex`.

### Notes
- Plugins need a full JDK. R8 (the dex converter) is downloaded once, with a SHA-1 check, or taken from the Android SDK, `NITRON_D8` or `NITRON_R8_JAR`.
- The template must be rebuilt (`node scripts/prepare-template.js`); it now also produces `template/nitron-plugin-api.jar`.
- Apps with plugins get `window.Nitron` replaced by a plain object (the built-in methods are forwarded, so existing code keeps working). Apps without plugins are unchanged.
- Plugin sources that sit inside the web folder are never packaged as web assets.

## v3.1.5

### Security
- **External links no longer load inside the bridge-enabled WebView.** `webview.externalLinks` defaults to `"browser"`: links to other websites open in the system browser. Use `"inapp"` for the old behavior, or list trusted hosts (payment or sign-in pages) in `webview.allowedHosts`.
  - **Behavior change:** apps that navigate to third-party sites inside the WebView must now opt in with `"inapp"` or `allowedHosts`.
- `window.Nitron.showNotification()` now checks that the page comes from the app origin, like the permission requests already did.
- Origin checks compare the exact host. The previous prefix check also accepted look-alike hosts such as `appassets.androidplatform.net.example.com`.
- Values written into `AndroidManifest.xml` (app name, version, splash color) are XML-escaped, so a name like `Tom & Jerry` no longer breaks the build.

### Fixed
- `nitron --version` reads the real package version.
- `scripts/prepare-template.js` pointed at a file that no longer exists. It now builds every Java file in `template-src/base/`, finds or downloads `android.jar` and the R8 dexer by itself, and works with a plain JDK.
- `package.json` declared `MIT` while the repository is GPL-2.0 with the Nitron Output Exception. It now declares `GPL-2.0-only`.
- The Output Exception in `LICENSE` contained an unfilled placeholder for the GPL version; it now says version 2.

### Docs
- README: Google Play publishing flow (`nitron keystore`, `--release`, `dist/app.aab`), security model, limitations, and a demo GIF.
- Release notes moved out of the README into this file.

> After updating the Java template sources, rebuild `template/base.apk` with `node scripts/prepare-template.js` before publishing.

## v3.1.0 – v3.1.4

- Asset exclusion: the `exclude` array in `nitron.config.json` keeps files and folders out of the app (glob patterns and exact names).
- Default `targetSdk` raised to 36, with a warning for lower values when building an AAB.
- Fixes for AAB networking and R8 mapping, and `android.*` settings passed through the config parser.
- Project license changed from MIT to GPL-2.0 with the Nitron Output Exception.

## v3.0.0

- **iOS support (engine `initron`):** builds real iOS apps from the same `nitron.config.json`, using a WKWebView shell.
  - `nitron build --target ios-simulator` produces an unsigned `.app` for the iOS Simulator.
  - `nitron build --target ios` produces a signed `.ipa`, signed with zsign/ldid instead of Xcode's `codesign`. It needs an Apple Developer certificate (`NITRON_IOS_P12_PATH`, `NITRON_IOS_P12_PASSWORD`, `NITRON_IOS_PROVISION_PATH`).
  - One-time setup: `scripts/build-ios-toolchain.sh` and `scripts/build-shell-device.sh`, or `.github/workflows/build-shell-device.yml` on a plain Linux runner.
- The codebase is split into two engines, `src/engines/nitronoid/` (Android) and `src/engines/initron/` (iOS), sharing a small platform-agnostic core. See `ARCHITECTURE.md`.
- The Linux → `.ipa` pipeline was validated end to end and accepted by a third-party iOS package validator.

## v2.1.0

- WebView permission requests and geolocation prompts are validated against `https://appassets.androidplatform.net`.
- Native JavaScript interfaces: `window.Nitron.requestLocationPermission()`, `requestCameraPermission()`, `requestStoragePermission()`.
- `checkSelfPermission` before any request, avoiding unnecessary system dialogs.
- AAB support: `npx nitron build --target aab` (signing needs a full JDK).
- `window.Nitron.showNotification('Title', 'Message')`.
- Local files are served over a secure origin through `shouldInterceptRequest`; the `file://` protocol was removed.
- `nitron.config.json` with splash color, back-button behavior and cleartext control; default icon; `nitron init --preset` for `nextjs`, `vite`, `react` and `vanilla`.
