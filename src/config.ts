// config.ts — Read + validate project configuration, merge into NitronConfig
//
// v2.0 Config resolution order:
//   1. nitron.config.json  (highest priority — explicit, no JS runtime needed)
//   2. app.js              (legacy — still fully supported)
//   3. package.json        (lowest — "nitron" field or basic fields)
//
// The nitron.config.json approach is recommended because:
//   - No package.json required in the build output directory
//   - No ES Module / CommonJS confusion
//   - No "type": "module" requirement
//   - CI/CD friendly — just a JSON file

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { _getCapturedConfig, _resetCapturedConfig } from './index.js'
import type { NitronConfig } from './types.js'

/** Default values for optional config fields */
const DEFAULTS: Omit<NitronConfig, 'name' | 'packageId'> = {
  version: '1.0.0',
  entry: 'index.html',
  orientation: 'portrait',
  statusBar: true,
  permissions: [],
  icon: null,
  network: { cleartext: false },
  splashScreen: null,
  webview: {
    clearCacheOnStart: false,
    backButton: 'history',
  },
}

/**
 * Merge a partial config with defaults into a complete NitronConfig.
 */
function mergeWithDefaults(partial: Record<string, any>): NitronConfig {
  return {
    name: partial.name ?? '',
    packageId: partial.packageId ?? '',
    version: partial.version ?? DEFAULTS.version,
    entry: partial.entry ?? DEFAULTS.entry,
    orientation: partial.orientation ?? DEFAULTS.orientation,
    statusBar: partial.statusBar ?? DEFAULTS.statusBar,
    permissions: partial.permissions ?? DEFAULTS.permissions,
    icon: partial.icon ?? DEFAULTS.icon,
    network: {
      cleartext: partial.network?.cleartext ?? DEFAULTS.network!.cleartext,
    },
    splashScreen: partial.splashScreen ?? DEFAULTS.splashScreen,
    webview: {
      clearCacheOnStart: partial.webview?.clearCacheOnStart ?? DEFAULTS.webview!.clearCacheOnStart,
      backButton: partial.webview?.backButton ?? DEFAULTS.webview!.backButton,
    },
  }
}

/**
 * Read and merge configuration from the developer's project.
 *
 * Resolution order:
 *   1. nitron.config.json (pure JSON, no runtime needed)
 *   2. app.js (dynamic import, triggers app.init())
 *   3. package.json "nitron" field
 *
 * @param projectDir - Absolute path to the developer's project directory
 * @returns Merged NitronConfig object
 */
export async function readConfig(projectDir: string): Promise<NitronConfig> {
  // ─── Try 1: nitron.config.json ──────────────────────────────
  const jsonConfigPath = resolve(projectDir, 'nitron.config.json')
  try {
    const raw = await readFile(jsonConfigPath, 'utf-8')
    let parsed: Record<string, any>
    try {
      parsed = JSON.parse(raw)
    } catch (parseErr: any) {
      throw new Error(`Invalid nitron.config.json — JSON parse error: ${parseErr.message}`)
    }
    return mergeWithDefaults(parsed)
  } catch (err: any) {
    // If file doesn't exist, try next source. If it exists but is invalid, throw.
    if (err.code !== 'ENOENT') {
      throw err
    }
  }

  // ─── Try 2: app.js (legacy) ──────────────────────────────────
  _resetCapturedConfig()
  const appJsPath = resolve(projectDir, 'app.js')
  const appJsUrl = pathToFileURL(appJsPath).href

  try {
    // Dynamic import executes app.js, which calls app.init() and captures the config
    // Adding a timestamp query to bust Node's module cache on repeated imports
    await import(`${appJsUrl}?t=${Date.now()}`)

    const captured = _getCapturedConfig()
    if (captured) {
      // app.js found and called app.init() — use its config
      // Also try to read package.json for version fallback
      let pkgVersion: string | undefined
      try {
        const pkgRaw = await readFile(resolve(projectDir, 'package.json'), 'utf-8')
        const pkg = JSON.parse(pkgRaw)
        pkgVersion = pkg.version
      } catch {
        // No package.json, that's fine
      }

      const merged = mergeWithDefaults(captured)
      if (!merged.version || merged.version === '1.0.0') {
        merged.version = pkgVersion ?? DEFAULTS.version!
      }
      return merged
    }
  } catch (err: any) {
    // If app.js doesn't exist, try next source. If it exists but errors, throw.
    if (err.code !== 'ERR_MODULE_NOT_FOUND' && err.code !== 'ENOENT') {
      throw new Error(`Failed to load app.js: ${err.message}`)
    }
  }

  // ─── Try 3: package.json "nitron" field ──────────────────────
  const pkgPath = resolve(projectDir, 'package.json')
  try {
    const raw = await readFile(pkgPath, 'utf-8')
    const pkgJson = JSON.parse(raw)
    const nitronField = pkgJson.nitron

    if (nitronField && typeof nitronField === 'object') {
      const merged = mergeWithDefaults(nitronField)
      // Use package.json version as fallback
      if (!merged.version || merged.version === '1.0.0') {
        merged.version = pkgJson.version ?? DEFAULTS.version!
      }
      return merged
    }
  } catch {
    // No package.json or invalid — fall through to error
  }

  // ─── No config found ──────────────────────────────────────────
  throw new Error(
    'No Nitron configuration found.\n\n' +
    'Create one of the following:\n\n' +
    '  1. nitron.config.json (recommended):\n' +
    '     {\n' +
    '       "name": "My App",\n' +
    '       "packageId": "com.myname.myapp"\n' +
    '     }\n\n' +
    '  2. app.js:\n' +
    '     import { app } from "nitron"\n' +
    '     app.init({ name: "My App", packageId: "com.myname.myapp" })\n\n' +
    '  3. package.json "nitron" field:\n' +
    '     { "nitron": { "name": "My App", "packageId": "com.myname.myapp" } }\n'
  )
}
