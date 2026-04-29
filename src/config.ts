// config.ts — Read + validate app.js and package.json, merge into NitronConfig
//
// Config priority: defaults < package.json < app.js
// The app.js is executed via dynamic import(), which triggers app.init()
// and captures the config via globalThis (see index.ts for details).

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
}

/**
 * Read and merge configuration from the developer's project.
 *
 * 1. Reads package.json for any nitron-specific fields
 * 2. Executes app.js via dynamic import() to capture app.init() config
 * 3. Merges everything with defaults into a unified NitronConfig
 *
 * @param projectDir - Absolute path to the developer's project directory
 * @returns Merged NitronConfig object
 */
export async function readConfig(projectDir: string): Promise<NitronConfig> {
  // Reset any previously captured config (clean slate)
  _resetCapturedConfig()

  // --- Read package.json ---
  const pkgPath = resolve(projectDir, 'package.json')
  let pkgJson: Record<string, any>

  try {
    const raw = await readFile(pkgPath, 'utf-8')
    pkgJson = JSON.parse(raw)
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      throw new Error('package.json not found — are you in a Nitron project directory?')
    }
    throw new Error(`Failed to read package.json: ${err.message}`)
  }

  // --- Execute app.js to capture config ---
  const appJsPath = resolve(projectDir, 'app.js')
  const appJsUrl = pathToFileURL(appJsPath).href

  try {
    // Dynamic import executes app.js, which calls app.init() and captures the config
    // Adding a timestamp query to bust Node's module cache on repeated imports
    await import(`${appJsUrl}?t=${Date.now()}`)
  } catch (err: any) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'ENOENT') {
      throw new Error('app.js not found — create an app.js file with your Nitron configuration')
    }
    throw new Error(`Failed to load app.js: ${err.message}`)
  }

  // Read the captured config — stored in globalThis, so it works
  // regardless of how the 'nitron' module was resolved (symlink, real path, etc.)
  const captured = _getCapturedConfig()
  if (!captured) {
    throw new Error(
      'app.js did not call app.init() — your app.js must call app.init({...}) with your configuration'
    )
  }

  // --- Merge: defaults < package.json < app.js ---
  const nitronPkg = pkgJson.nitron ?? {}

  const config: NitronConfig = {
    name: captured.name ?? nitronPkg.name ?? '',
    packageId: captured.packageId ?? nitronPkg.packageId ?? '',
    version: captured.version ?? pkgJson.version ?? DEFAULTS.version,
    entry: captured.entry ?? nitronPkg.entry ?? DEFAULTS.entry,
    orientation: captured.orientation ?? nitronPkg.orientation ?? DEFAULTS.orientation,
    statusBar: captured.statusBar ?? nitronPkg.statusBar ?? DEFAULTS.statusBar,
    permissions: captured.permissions ?? nitronPkg.permissions ?? DEFAULTS.permissions,
    icon: captured.icon ?? nitronPkg.icon ?? DEFAULTS.icon,
  }

  return config
}

