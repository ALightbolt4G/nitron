# Nitron v3.0.0 — Architecture & Full Technical Reference

This document is the complete internal reference for Nitron after the
v3.0.0 restructuring: the Android engine (`nitronoid`), the new iOS engine
(`initron`), every step of every pipeline, every file, and the reasoning
behind each design decision.

---

## 1) Overall Philosophy

Nitron turns an HTML/CSS/JS project into a real app on two platforms
**without** the developer needing to install or understand any official
platform tooling (no Android Studio, no Xcode) for day-to-day use. The
trick: instead of compiling every app from scratch, we prepare a **fixed
template** (`template/shell` for iOS, `template/base.apk` for Android) —
built *once*, by the project (not by the developer) — and every build
after that is just:

```
inject web assets → patch metadata (name/id/permissions) → sign → package
```

This principle is identical across both platforms, but the tools used at
each step are completely different — which is exactly why the two engines
are fully isolated from each other.

---

## 2) Full Project Layout

```
nitron/
├── src/
│   ├── cli.ts                 ← entry point, routes to each engine by --target
│   ├── config.ts               } shared between both engines (platform-agnostic)
│   ├── validator.ts            }
│   ├── types.ts                } NitronConfig, BuildOptions, BuildResult
│   ├── logger.ts                }
│   ├── pwa.ts                   } PWA generation (fully separate from Android/iOS)
│   ├── dev.ts, init.ts, presets.ts, index.ts
│   │
│   ├── core/
│   │   └── engine.interface.ts  ← the shared contract: BuildEngine
│   │
│   └── engines/
│       ├── nitronoid/           ← Android engine (logic unchanged from v2.1.0)
│       │   ├── build.ts         ← orchestrator (was builder.ts)
│       │   ├── unpacker.ts      ← unzips base.apk
│       │   ├── injector.ts      ← injects web assets into assets/
│       │   ├── manifest.ts      ← patches AndroidManifest.xml via aapt2
│       │   ├── aapt2-resource-builder.ts
│       │   ├── arsc-generator.ts
│       │   ├── packer.ts        ← packages the final APK
│       │   ├── aab-packer.ts    ← packages an AAB (for Google Play)
│       │   ├── bundletool.ts    ← wraps bundletool.jar
│       │   ├── signer.ts        ← wraps uber-apk-signer.jar
│       │   ├── keystore.ts      ← generates a keystore
│       │   ├── icon/            ← resizes/adapts the Android icon
│       │   └── index.ts         ← implements BuildEngine
│       │
│       └── initron/             ← iOS engine (entirely new in v3.0.0)
│           ├── build.ts         ← full pipeline orchestrator (7 steps)
│           ├── shell-unpacker.ts← unzips shell-device.zip / shell-simulator.zip
│           ├── injector.ts      ← injects web assets into NitronShell.app/www/
│           ├── icon.ts          ← generates the iOS app icon (legacy method, no asset catalog)
│           ├── permissions.ts   ← maps Android-style permission names to iOS keys
│           ├── plist.ts         ← reads/patches Info.plist (plain XML)
│           ├── signer.ts        ← wraps zsign (+ ad-hoc signing)
│           └── index.ts         ← implements BuildEngine
│
├── template-src/
│   ├── base/
│   │   └── MainActivity.java    ← Android template source (WebView Activity)
│   └── shell/
│       ├── src/
│       │   ├── main.m           ← entry point (no Storyboard)
│       │   ├── AppDelegate.h/.m ← creates the window, no UIScene lifecycle
│       │   └── ViewController.h/.m ← WKWebView logic (loads www/index.html)
│       ├── Info.plist           ← Info.plist template with text placeholders
│       └── www/index.html       ← placeholder page (replaced by the developer's content)
│
├── template/
│   ├── base.apk                 ← the built Android template (checked into the repo)
│   └── shell/                   ← empty in the repo, filled in after running the scripts/workflows
│       ├── shell-device.zip     ← (you produce this — see §5)
│       └── shell-simulator.zip  ← (you produce this — see §6, optional)
│
├── vendor/
│   ├── uber-apk-signer.jar      ← APK signing (Android)
│   └── zsign/linux/zsign        ← IPA signing (iOS) — built from source, Linux only for now
│
├── scripts/
│   ├── build-ios-toolchain.sh   ← builds the cctools-port + TAPI + SDK toolchain (once)
│   ├── build-shell-device.sh    ← compiles the actual iOS shell with that toolchain (Linux)
│   └── build-shell-simulator.sh ← compiles the Simulator shell (macOS only, needs xcrun)
│
└── .github/workflows/
    ├── build-shell-device.yml   ← runs the two scripts above automatically on a Linux runner
    └── build-shell-simulator.yml← (optional) builds a Simulator build, needs a macOS runner
```

---

## 3) The `nitronoid` Engine (Android) — Logic Unchanged

Fully moved from `src/` to `src/engines/nitronoid/` during the
restructuring, **without changing a single line of internal logic** —
just file moves and import-path fixes. The pipeline is exactly what it was
in v2.1.0:

1. **`unpacker.ts`** — unzips `template/base.apk` into a temp directory
2. **`injector.ts`** — copies the developer's files into `assets/`
3. **`manifest.ts` + `aapt2-resource-builder.ts` + `arsc-generator.ts`** —
   patch `AndroidManifest.xml` and resources (name, permissions, icon) via
   `aapt2` (a standalone tool from Google, a full substitute for Android
   Studio)
4. **`packer.ts`** (or `aab-packer.ts` for an AAB target) — packages the
   final artifact
5. **`signer.ts`** — signs with `uber-apk-signer.jar` (or `keystore.ts` to
   generate a new key if the user doesn't have one)

Unified entry point: `src/engines/nitronoid/index.ts` exports
`nitronoidEngine`, which implements `BuildEngine` (§4).

---

## 4) The Shared Contract: `BuildEngine`

```typescript
// src/core/engine.interface.ts
interface BuildEngine {
  readonly name: string                // "nitronoid" | "initron"
  readonly artifactExtension: string   // "apk" | "ipa"
  build(config: NitronConfig, options: BuildOptions): Promise<EngineBuildResult>
}
```

`cli.ts` calls `build()` from either `nitronoid/build.ts` or
`initron/build.ts` directly, based on `--target`. There is no shared logic
inside the engines themselves — the isolation is real, not just
organizational.

---

## 5) The `initron` Engine (iOS) — Full Details

### 5.1 Why the `aapt2` approach doesn't transfer directly

Xcode's internal tools (`clang`, `ld`, `codesign`, `actool`, etc.) are
tied to the iOS SDK, and using that SDK outside of Xcode/macOS is
explicitly prohibited in Apple's SDK license agreement. That's a **legal**
constraint, not a purely technical one — but since all of these tools are
built on open-source compilers and libraries (LLVM/Clang, and even
Apple's own `cctools` source, which is open under the APSL-2.0 license), a
community (mainly from the iOS jailbreaking world, the Theos project) has
built real, working, cross-platform alternatives. Nitron uses them in
full:

| Apple tool | Replacement used in initron |
| --- | --- |
| `codesign` | `zsign` (the branch we use) or `ldid` (a lighter alternative from the same ecosystem) |
| `plutil` | the `plist` npm package (pure JS, works with plain XML plists directly) |
| `ld` (the linker) | `cctools-port` — a Linux port of Apple's own real `ld64` |
| `clang` + iOS SDK headers | `clang` itself (available on Linux) + an SDK from the `theos/sdks` community project |
| `actool` (asset catalogs) | **bypassed entirely** — we use the old-style iOS app icon method (raw PNG files + the `CFBundleIcons` Info.plist key) instead, because `actool` itself has no standalone replacement, and this approach doesn't need one at all |

### 5.2 The key difference between the "real device" and "simulator" paths

| | `--target ios` (real device) | `--target ios-simulator` |
| --- | --- | --- |
| Needs macOS? | **No, never** (100% Linux) | Yes (one-time step only, via GitHub Actions) |
| Why | The device SDK (`iPhoneOS.sdk`) is available from `theos/sdks` | The simulator SDK (`iPhoneSimulator.sdk`) is **not** available from that same community source — the jailbreak community has no use for the simulator |
| Signing | Required (zsign with a real certificate, or ad-hoc) | Not required at all (the simulator doesn't check signatures) |
| Use case | Installing on a real iPhone, TestFlight, App Store | Fast local testing, no Apple account needed |

### 5.3 The `build.ts` steps (7 steps, matching the tool's own numbering)

```
[1/7] Locate the template (shell-device.zip or shell-simulator.zip)
[2/7] Unpack it into a temp directory (shell-unpacker.ts)
[3/7] Inject web assets into NitronShell.app/www/ (injector.ts)
[4/7] Generate the app icon (icon.ts)
[5/7] Patch Info.plist: name, bundle ID, version, orientation, permissions (plist.ts)
[6/7] Package: either a direct zip (Simulator) or sign with zsign (real device)
[7/7] Final verification and temp-file cleanup
```

### 5.4 Permission Mapping (`permissions.ts`)

`app.js`/`nitron.config.json` uses the same Android permission names
(e.g. `CAMERA`, `ACCESS_FINE_LOCATION`) on both platforms, to avoid
duplicating configuration. `permissions.ts` contains a full mapping table
for 25+ permissions to their iOS `NS*UsageDescription` equivalents, each
with a reasonable default text. Any Android permission with no real iOS
equivalent (e.g. SMS, phone calls) is silently ignored — no negative
effect on the build.

A developer can supply a custom description instead of the default via:

```json
"ios": {
  "permissionDescriptions": {
    "CAMERA": "We need the camera to scan barcodes"
  }
}
```

### 5.5 The Icon (`icon.ts`) — and why it's "legacy"

The modern approach (an asset catalog compiled by `actool`) is impossible
without Xcode. What Nitron uses instead: raw PNG files
(`AppIcon60x60@2x.png`, `AppIcon60x60@3x.png`) placed directly at the root
of the `.app`, referenced via the `CFBundleIcons` key in Info.plist — a
method Apple itself has supported since the App Store's earliest days and
still honors today. It matters because it needs **zero compilation**, so
it fits perfectly with Nitron's inject-at-build-time model.

**Documented limitation:** this method is entirely sufficient for direct
installs / TestFlight, but an actual App Store submission additionally
wants a 1024×1024 "marketing" icon delivered through a real asset
catalog — which still requires one Xcode step (see §6).

---

## 6) The Steps You Actually Need to Run (one-time)

### 6.1 Building the real-device shell (100% Linux, zero macOS)

```bash
# On any Linux machine with reasonable resources (4+ cores recommended, not required)
bash scripts/build-ios-toolchain.sh   # builds the full toolchain, once only
bash scripts/build-shell-device.sh    # compiles the actual shell, takes seconds
```

Output: `template/shell/shell-device.zip` — after that, `nitron build
--target ios` works immediately.

**Or**, instead of running them manually, trigger
`.github/workflows/build-shell-device.yml` from the Actions tab on GitHub
(a plain Linux runner; the slow step — apple-libtapi — is cached, so after
the first run it's a matter of minutes), then download the resulting
artifact.

**Note on resources:** the `apple-libtapi` step compiles a slice of LLVM.
On a single-core machine this can take hours; on 4+ cores it's typically
10–20 minutes. Tune the `JOBS` variable in the script to your core count.

### 6.2 Building the simulator shell (optional, needs macOS)

Only if you want to test in the iOS Simulator without an Apple account:
run `.github/workflows/build-shell-simulator.yml` (needs a macOS runner —
GitHub provides these free for limited minutes), and place the resulting
`shell-simulator.zip` into `template/shell/`.

### 6.3 Apple Certificate (only if you need a real, non-ad-hoc install)

```bash
export NITRON_IOS_P12_PATH=/path/to/cert.p12
export NITRON_IOS_P12_PASSWORD=your-password
export NITRON_IOS_PROVISION_PATH=/path/to/profile.mobileprovision
nitron build --target ios --project ./my-app
```

If no certificate is found, `initron` automatically falls back to ad-hoc
signing (via zsign) — useful for quick testing, but not valid for an
App-Store-trusted install.

---

## 7) Full CLI Reference

```bash
nitron init                          # scaffold a new project
nitron build --target android        # APK
nitron build --target aab            # Android App Bundle (Google Play)
nitron build --target ios            # signed IPA (real device)
nitron build --target ios-simulator  # unsigned .app (for the Simulator)
nitron build --target pwa            # Progressive Web App
nitron build --target all            # everything (iOS falls back to the Simulator artifact automatically)
nitron dev                           # local dev server
nitron keystore                      # generate a new Android keystore
```

---

## 8) `nitron.config.json` Reference (iOS-related fields)

```jsonc
{
  "name": "My App",
  "packageId": "com.myname.myapp",   // also used as the default iOS bundle ID
  "version": "1.0.0",
  "entry": "index.html",
  "orientation": "portrait",          // "portrait" | "landscape" | "auto"
  "permissions": ["CAMERA", "ACCESS_FINE_LOCATION"],
  "icon": "icon.png",

  "ios": {
    "bundleId": "com.myname.myapp.ios",     // optional, overrides packageId
    "minimumVersion": "13.0",                // optional (defaults to 13.0)
    "permissionDescriptions": {
      "CAMERA": "custom text instead of the default"
    }
  }
}
```

---

## 9) Known Limitations (documented plainly, nothing hidden)

1. **Official App Store submission needs one extra macOS step** for the
   1024 marketing icon via a real asset catalog — direct installs /
   TestFlight do not need it.
2. **The iOS Simulator still needs macOS** (one-time), because its SDK
   isn't available from a Linux-friendly community source.
3. **Swift is not supported in the shell** — we use Objective-C because
   the `cctools-port` toolchain supports it maturely, while cross-
   compiling Swift for iOS from Linux is still immature (it needs a Swift
   runtime matching iOS's exact ABI, which is hard to obtain outside
   Xcode). This has zero effect on anything outside the shell's own
   files — the developer's own code is still plain HTML/JS as always.
4. **`vendor/zsign/` is Linux-only for now** — contributions to build a
   macOS/Windows binary are welcome (same spirit as the existing "Testing
   on Linux and Mac" call for help already in the main Android README).
5. **This entire approach bypasses Apple's SDK license agreement for use
   outside Xcode.** A deliberate, conscious choice, made because
   effectiveness was explicitly prioritized over Apple policy compliance
   — but worth knowing before shipping this to any wide audience.

---

## 10) Troubleshooting

These entries are split into two groups: issues you might hit while
**building the toolchain** (§6.1, one-time), and issues while **running
`nitron build --target ios`** on an actual project. Everything below this
line except the last four rows was found and fixed during a real,
first-time build on Windows/WSL2 — not theoretical.

| Error | Likely cause | Fix |
| --- | --- | --- |
| `Shell template not found` | You haven't run §6 yet | Run `scripts/build-ios-toolchain.sh` then `build-shell-device.sh` |
| `apple-libtapi` build is extremely slow | Too few CPU cores | Set `JOBS` in the script, or use GitHub Actions (§6.1). A single vCPU can take **hours**; 4 cores is usually 10–20 min |
| `git clone` fails with "Could not resolve host" mid-build | WSL2's DNS resolution breaks, especially with certain VPNs/networks | Set a manual `/etc/resolv.conf` (`nameserver 8.8.8.8`), then `wsl --shutdown` from PowerShell and reopen. The script is safe to re-run — it skips any step whose output already exists on disk |
| `make: pkg-config: No such file or directory` while building zsign | `pkg-config` wasn't installed — a real gap in `build-ios-toolchain.sh` that shipped in early v3.0.0, now fixed | Fixed as of this doc; if you still hit it: `sudo apt-get install -y pkg-config`, then `rm -rf .build ../../bin/zsign` inside `zsign/build/linux/` and re-run `make` |
| `/usr/bin/ld: unrecognised emulation mode: llvm` when compiling the shell | `clang`'s Darwin driver only auto-detects a linker literally named `ld` via `-B` search paths; cctools-port's linker is named `arm-apple-darwin11-ld`, so clang silently falls back to the host's own `/usr/bin/ld` (GNU ld), which can't parse Apple-style linker flags at all | Already fixed in `build-shell-device.sh` via `-fuse-ld="$TOOLCHAIN/bin/arm-apple-darwin11-ld"` (an absolute path, not just a suffix) |
| `zsign ... Can't find payload directory!` (but "Signed OK!" appears first) | zsign expects the `.app` to sit inside a directory literally named `Payload/` when producing an `.ipa` — the real internal structure of every `.ipa` ever shipped. Passing the bare `.app` signs the binary fine but fails at the packaging step | Already fixed in `signer.ts` (`wrapInPayload()`) — every call to zsign now wraps the app in a fresh `Payload/` dir first |
| Upload rejected by a device-testing platform (BrowserStack, Apple Transporter, etc.) with something like `DEVICE_FAMILY_NOT_SUPPORTED` or a generic "invalid IPA" | Xcode normally injects several Info.plist keys automatically that a hand-assembled Info.plist won't have: `CFBundleSupportedPlatforms`, `MinimumOSVersion`, `UIDeviceFamily` | Already fixed in `plist.ts` — all three are now set on every build |
| Icon generation fails: `Input file is missing: .../icon.png` | No `icon` was set in the config, but Nitron still defaults to looking for `icon.png` in the project root | Either add an `icon.png` to the project, or copy Nitron's own bundled default: `cp assets/default-icon.png <project>/icon.png` |
| `zsign failed to sign` (certificate path) | Expired certificate, or bundle ID doesn't match the provisioning profile | Make sure `ios.bundleId` exactly matches the profile |
| App opens to a blank white screen | Wrong `entry` path in the config, or `www/index.html` missing | Make sure the developer's own build step (e.g. `npm run build`) ran before Nitron |
| An error message only says "Command failed: ..." with no further detail | A caught error's `.message` doesn't include the subprocess's actual stdout/stderr unless explicitly captured | Fixed in `signer.ts` — errors now include the full `stdout`/`stderr` from the failing tool |

### Validated end-to-end (not just theoretical)

As of this revision, the full `--target ios` pipeline has produced a real,
structurally valid `.ipa` — confirmed by:

- `file` reporting a genuine `Mach-O 64-bit arm64 executable` for the compiled shell binary
- `unzip -l` showing the correct `Payload/NitronShell.app/...` structure, including `_CodeSignature/CodeResources`
- The `.ipa` being **accepted** by BrowserStack App Live's upload validation (a real third-party iOS package validator)

What's still pending independent confirmation: actually launching the
app on a real device or the Simulator and confirming the WKWebView
renders correctly (structural validity doesn't guarantee runtime
behavior — see §9 for what's proven vs. what still needs a real device).
