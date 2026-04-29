# Nitron — Detailed Use Case & Documentation Plan

> *"If you know npm, you can ship an Android app."*

---

## 1. Vision

Nitron is an npm package that converts HTML/CSS/JS projects into real Android APK files — with zero knowledge of Android required.

The developer only needs to know npm. Nothing else.

### Core Philosophy

| Principle | Meaning |
|---|---|
| Zero Android | The developer never sees Gradle, SDK, or Android Studio |
| npm-first | Every action is an npm command |
| Familiar structure | Feels like any other npm project |
| No magic | What happens under the hood is documented and predictable |

---

## 2. The Problem

| Tool | Core Problem | Secondary Problem |
|---|---|---|
| Android Studio | Requires 8-16GB RAM, 10-15min build time | Requires full Android knowledge |
| Capacitor | Still requires Android Studio to function | Plugin ecosystem is fragile and unmaintained |
| Cordova | Old architecture, complex setup | Same Android dependency as Capacitor |
| PWA | Cannot be published on Google Play as a real app | Limited device API access |

### The Hidden Problem Nobody Solved

Every existing solution forces the web developer to think like an Android developer at some point. Capacitor markets itself as "web-first" but still requires Android Studio for every build. Nitron's goal is to make Android completely invisible — not just simpler.

---

## 3. Target User

| Attribute | Description |
|---|---|
| Background | Web developer (HTML/CSS/JS) |
| npm knowledge | Comfortable — uses it daily |
| Android knowledge | Zero — and that should never change |
| Goal | Publish a real APK on Google Play |
| Current workaround | Stuck on PWA or gave up on mobile entirely |
| Frustration | Every tool eventually forces them to open Android Studio |

---

## 4. Use Cases

### UC-01 — Create New Project

| Field | Detail |
|---|---|
| Name | Create new Nitron project |
| Actor | Web developer |
| Trigger | Developer wants to start a new mobile app |
| Precondition | Node.js and npm installed |
| Goal | Get a ready-to-edit project folder |

**Flow:**
```
1. Developer runs: npm create nitron@latest
2. CLI asks: What is your app name?
3. CLI asks: What is your package ID? (e.g. com.myname.myapp)
4. CLI asks: What is the entry HTML file? (default: index.html)
5. Nitron scaffolds the project folder
6. Developer opens folder and starts editing HTML/CSS/JS
```

**Output:**
```
my-app/
├── index.html
├── style.css
├── main.js
├── app.js
└── package.json
```

**Success condition:** Developer is editing HTML within 60 seconds of running the command.

---

### UC-02 — Build APK

| Field | Detail |
|---|---|
| Name | Build Android APK |
| Actor | Web developer |
| Trigger | Developer is ready to test or publish |
| Precondition | Project created, HTML/CSS/JS ready |
| Goal | Get a working `.apk` file with zero Android knowledge |

**Flow:**
```
1. Developer runs: npm run build
2. Nitron reads app.js and package.json
3. Nitron validates the project structure
4. Nitron runs the full build pipeline internally
5. APK appears at dist/app.apk
6. CLI prints: ✓ Built successfully → dist/app.apk
```

**Output:** `dist/app.apk` — ready to install on device or upload to Google Play.

**Success condition:** Developer never opened Android Studio, never touched Gradle, never configured a keystore manually.

---

### UC-03 — Configure App Identity

| Field | Detail |
|---|---|
| Name | Configure app name, icon, permissions |
| Actor | Web developer |
| Trigger | Developer wants to customize app metadata |
| Goal | APK reflects correct app identity |

**app.js configuration options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | string | required | App display name on device |
| `packageId` | string | required | Unique Android package ID |
| `version` | string | `"1.0.0"` | App version |
| `entry` | string | `"index.html"` | HTML entry point |
| `orientation` | string | `"portrait"` | portrait / landscape / auto |
| `statusBar` | boolean | `true` | Show/hide Android status bar |
| `permissions` | string[] | `[]` | Android permissions needed |
| `icon` | string | `null` | Path to icon image |

**Example app.js:**
```javascript
import { app } from 'nitron'

app.init({
  name: "My App",
  packageId: "com.myname.myapp",
  version: "1.0.0",
  entry: "index.html",
  orientation: "portrait",
  statusBar: true,
  permissions: ["CAMERA", "INTERNET"],
  icon: "./assets/icon.png"
})
```

---

### UC-04 — Live Preview *(Phase 3)*

| Field | Detail |
|---|---|
| Name | Preview app in browser before building |
| Actor | Web developer |
| Trigger | Developer wants to test UI quickly |
| Goal | See app in mobile viewport without building APK |

**Flow:**
```
1. Developer runs: npm run dev
2. Nitron starts local server
3. Opens browser at localhost:3000 in mobile viewport
4. Hot-reload on file changes
```

---

### UC-05 — Multi-Target Build *(Phase 4 — Future)*

| Field | Detail |
|---|---|
| Name | Build for multiple platforms |
| Actor | Web developer |
| Trigger | Developer wants APK + PWA from same codebase |
| Goal | One codebase, multiple outputs |

**Commands:**
```bash
npm run build --target android   → dist/app.apk
npm run build --target pwa       → dist/pwa/
npm run build --target all       → both
```

---

### UC-06 — Error Handling

| Scenario | Nitron Behavior |
|---|---|
| `index.html` not found | Clear error: "Entry file not found: index.html" |
| `app.js` missing required field | Clear error: "Missing required field: packageId" |
| Invalid package ID format | Clear error: "packageId must follow format: com.name.app" |
| Icon file not found | Warning (non-fatal): "Icon not found, using default" |
| Build fails internally | Clear error with suggestion, never a raw Java stacktrace |

**Rule:** The developer should never see an Android error. Nitron translates all internal errors into human-readable messages.

---

## 5. Architecture

### Project Structure (Developer's App)

```
my-app/
├── index.html          ← App UI entry point
├── style.css           ← Styles
├── main.js             ← App logic
├── assets/
│   └── icon.png        ← App icon (optional)
├── app.js              ← Nitron config
└── package.json        ← npm config
```

### Nitron Package Structure (Internal)

```
nitron/
├── src/
│   ├── cli.ts              ← CLI entry: npx nitron build
│   ├── config.ts           ← Read + validate app.js and package.json
│   ├── validator.ts        ← Validate project structure before build
│   ├── builder.ts          ← Core build pipeline controller
│   ├── unpacker.ts         ← Unzip base APK template
│   ├── injector.ts         ← Copy HTML/CSS/JS into APK assets/
│   ├── manifest.ts         ← Patch AndroidManifest.xml
│   ├── packer.ts           ← Repack folder into APK (zip)
│   ├── signer.ts           ← Auto-sign APK with debug keystore
│   ├── logger.ts           ← CLI output: progress, errors, success
│   └── types.ts            ← Shared TypeScript interfaces
├── template/
│   └── base.apk            ← Pre-built WebView APK template
├── scripts/
│   └── prepare-template.js ← Dev script to rebuild base.apk if needed
├── package.json
└── tsconfig.json
```

### What Each Source File Does

| File | Responsibility |
|---|---|
| `cli.ts` | Parses CLI arguments, routes to correct command (build, dev, init) |
| `config.ts` | Reads `app.js` and `package.json`, merges into unified config object |
| `validator.ts` | Checks entry HTML exists, required fields present, packageId format valid |
| `builder.ts` | Orchestrates the full build: calls unpacker → injector → manifest → packer → signer |
| `unpacker.ts` | Extracts `base.apk` (zip) into a temp directory |
| `injector.ts` | Copies developer's HTML/CSS/JS/assets into `assets/` inside unpacked APK |
| `manifest.ts` | Reads `AndroidManifest.xml`, patches app name, packageId, permissions, then writes back |
| `packer.ts` | Zips the modified APK folder back into a `.apk` file |
| `signer.ts` | Signs the APK using a generated debug keystore (auto-managed by Nitron) |
| `logger.ts` | Unified CLI output with colors, progress indicators, and clear error messages |
| `types.ts` | TypeScript interfaces: `NitronConfig`, `BuildOptions`, `BuildResult` |

---

## 6. Build Pipeline — Detailed

### Overview

```
npm run build
      │
      ▼
[1] Read Config
      │  Parse app.js + package.json
      │  Merge into NitronConfig object
      ▼
[2] Validate
      │  Check entry HTML exists
      │  Check required fields
      │  Check packageId format
      ▼
[3] Unpack Template
      │  Copy base.apk to temp dir
      │  Unzip into folder structure
      ▼
[4] Inject Assets
      │  Copy index.html + CSS + JS into assets/
      │  Copy icon if provided
      ▼
[5] Patch Manifest
      │  Open AndroidManifest.xml
      │  Write: app name, packageId, version, permissions
      │  Save back to file
      ▼
[6] Repack
      │  Zip modified folder back to .apk format
      ▼
[7] Sign
      │  Generate debug keystore if not exists
      │  Sign APK with apksigner
      ▼
[8] Output
         Copy signed APK to dist/app.apk
         Print: ✓ Built successfully → dist/app.apk
```

### Step-by-Step Details

#### Step 1 — Read Config

| Input | Output |
|---|---|
| `app.js` + `package.json` | `NitronConfig` object |

```typescript
interface NitronConfig {
  name: string
  packageId: string
  version: string
  entry: string
  orientation: "portrait" | "landscape" | "auto"
  statusBar: boolean
  permissions: string[]
  icon: string | null
}
```

---

#### Step 2 — Validate

| Check | Error if fails |
|---|---|
| `entry` file exists on disk | "Entry file not found: index.html" |
| `name` is present | "Missing required field: name" |
| `packageId` is present | "Missing required field: packageId" |
| `packageId` matches `com.x.y` format | "Invalid packageId format" |
| `icon` file exists (if provided) | Warning only — uses default |

---

#### Step 3 — Unpack Template

| Action | Detail |
|---|---|
| Source | `nitron/template/base.apk` |
| Destination | OS temp directory: `/tmp/nitron-build-{timestamp}/` |
| Method | Unzip (APK is a zip file) |

**Result folder structure:**
```
/tmp/nitron-build-123/
├── AndroidManifest.xml
├── classes.dex
├── assets/
│   └── (empty — will be filled in step 4)
├── res/
└── META-INF/
```

---

#### Step 4 — Inject Assets

| Action | Detail |
|---|---|
| Source | Developer's project folder |
| Destination | `assets/` inside unpacked APK |
| What gets copied | All HTML, CSS, JS, images, fonts, and other assets |
| What is excluded | `app.js`, `package.json`, `node_modules/`, `dist/` |

---

#### Step 5 — Patch AndroidManifest.xml

| Field patched | Source |
|---|---|
| `android:label` (app name) | `config.name` |
| `package` attribute | `config.packageId` |
| `android:versionName` | `config.version` |
| `uses-permission` entries | `config.permissions` |
| Screen orientation | `config.orientation` |

---

#### Step 6 — Repack

| Action | Detail |
|---|---|
| Input | Modified folder in `/tmp/nitron-build-{timestamp}/` |
| Output | `/tmp/nitron-unsigned.apk` |
| Method | Zip with correct APK compression settings |

---

#### Step 7 — Sign

| Action | Detail |
|---|---|
| Keystore location | `~/.nitron/debug.keystore` (auto-generated on first build) |
| Tool | `apksigner` (bundled with Nitron — developer never installs it) |
| Output | `dist/app.apk` (signed, ready to install) |

---

#### Step 8 — Output

| Action | Detail |
|---|---|
| Final file | `dist/app.apk` |
| CLI message | `✓ Built successfully → dist/app.apk (2.3MB) in 4.2s` |
| Cleanup | Temp directory deleted automatically |

---

## 7. TypeScript Types — Detailed

```typescript
// types.ts

export interface NitronConfig {
  name: string
  packageId: string
  version: string
  entry: string
  orientation: "portrait" | "landscape" | "auto"
  statusBar: boolean
  permissions: string[]
  icon: string | null
}

export interface BuildOptions {
  projectDir: string
  outputDir: string
  debug: boolean
}

export interface BuildResult {
  success: boolean
  outputPath: string | null
  duration: number
  errors: string[]
  warnings: string[]
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}
```

---

## 8. Nitron vs Competitors — Detailed

| Feature | Nitron | Capacitor | Cordova | PWA |
|---|---|---|---|---|
| Needs Android Studio | ❌ Never | ✅ Always | ✅ Always | — |
| Needs Gradle | ❌ Never | ✅ Always | ✅ Always | — |
| Needs Java / JDK | ❌ Never | ✅ Always | ✅ Always | — |
| npm-only workflow | ✅ Complete | ❌ No | ❌ No | ✅ Yes |
| Real APK output | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No |
| Google Play ready | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No |
| Build time | ✅ Seconds | ❌ Minutes | ❌ Minutes | — |
| RAM usage during build | ✅ ~200MB | ❌ 4-16GB | ❌ 4-8GB | — |
| Plugin complexity | ✅ None | ❌ Very high | ❌ Very high | — |
| Error messages | ✅ Web-friendly | ❌ Android stacktraces | ❌ Android stacktraces | — |
| Setup time | ✅ ~60 seconds | ❌ 30-60 minutes | ❌ 30-60 minutes | ✅ Fast |

---

## 9. Implementation Phases — Detailed

### Phase 1 — Core CLI & Config Reader

**Goal:** Running `nitron build` reads config without crashing.

| Task | File | Difficulty |
|---|---|---|
| Setup TypeScript project + tsconfig | root | Easy |
| Setup package.json with bin entry | root | Easy |
| Parse CLI arguments (build / init / dev) | `cli.ts` | Easy |
| Read and parse `package.json` | `config.ts` | Easy |
| Read and execute `app.js` to extract config | `config.ts` | Medium |
| Merge both into `NitronConfig` object | `config.ts` | Easy |
| Validate config and print errors | `validator.ts` | Easy |
| CLI logger with colors and progress | `logger.ts` | Easy |

**Done when:** `npx nitron build` prints the parsed config correctly and shows validation errors clearly.

---

### Phase 2 — APK Build Pipeline

**Goal:** Running `nitron build` produces a real APK file.

| Task | File | Difficulty |
|---|---|---|
| Obtain or build base WebView APK template | `template/base.apk` | Medium |
| Unpack base APK into temp directory | `unpacker.ts` | Easy |
| Copy developer assets into `assets/` | `injector.ts` | Easy |
| Read and patch `AndroidManifest.xml` | `manifest.ts` | Medium |
| Repack folder back into APK | `packer.ts` | Easy |
| Bundle `apksigner` binary inside package | `signer.ts` | Medium |
| Auto-generate debug keystore on first run | `signer.ts` | Medium |
| Sign APK automatically | `signer.ts` | Medium |
| Copy final APK to `dist/app.apk` | `builder.ts` | Easy |
| Cleanup temp directory after build | `builder.ts` | Easy |

**Done when:** `npx nitron build` outputs a real `.apk` that installs and runs on an Android device.

---

### Phase 3 — Developer Experience Polish

**Goal:** Make the tool feel professional and trustworthy.

| Task | File | Difficulty |
|---|---|---|
| `npm create nitron@latest` scaffold command | `cli.ts` | Medium |
| Interactive project setup (name, packageId) | `cli.ts` | Medium |
| `npm run dev` local preview server | `dev.ts` | Medium |
| Hot-reload on file changes during dev | `dev.ts` | Medium |
| Build progress bar with timing | `logger.ts` | Easy |
| Friendly error messages (never Android errors) | `logger.ts` | Easy |
| Warn on common mistakes (bad packageId, etc.) | `validator.ts` | Easy |

**Done when:** A web developer with zero Android knowledge can go from nothing to a running app in under 5 minutes.

---

### Phase 4 — Multi-Target Output *(Future)*

**Goal:** Same codebase produces APK + PWA.

| Task | File | Difficulty |
|---|---|---|
| `--target android` flag | `cli.ts` | Easy |
| `--target pwa` flag + PWA output | `pwa-builder.ts` | Medium |
| `--target all` flag | `cli.ts` | Easy |
| Generate `manifest.json` for PWA | `pwa-builder.ts` | Easy |
| Generate service worker for PWA | `pwa-builder.ts` | Medium |

---

### Phase 5 — Publishing Helpers *(Future)*

**Goal:** Help developer get APK onto Google Play.

| Task | Description | Difficulty |
|---|---|---|
| Release keystore generation | Generate production keystore with guided prompts | Medium |
| Release build signing | Sign with production keystore instead of debug | Easy |
| APK size report | Show what's taking up space in the APK | Medium |
| Google Play checklist | Print what's needed before submitting to Play Store | Easy |

---

## 10. Success Criteria

> Nitron is successful when a web developer who has never opened Android Studio can run two commands and have a working APK on their phone.

```bash
npm create nitron@latest my-app
cd my-app && npm run build
# → dist/app.apk ✓
```

### Measurable Success Metrics

| Metric | Target |
|---|---|
| Time from zero to working APK | Under 5 minutes |
| Number of Android-specific steps required | Zero |
| Build time | Under 30 seconds |
| RAM usage during build | Under 500MB |
| Error messages that mention Android/Gradle/Java | Zero |