// manifest.ts — Generate binary AndroidManifest.xml from NitronConfig
//
// Takes the developer's config and produces a valid binary AXML manifest
// that Android can parse. Uses the custom AXML encoder in axml.ts.

import { encodeManifestToAxml } from './axml.js'
import type { NitronConfig } from './types.js'

/** Map orientation string to Android constant */
const ORIENTATION_MAP: Record<string, number> = {
  portrait: 1,
  landscape: 0,
  auto: -1,
}

/**
 * Generate a binary AndroidManifest.xml buffer from the NitronConfig.
 *
 * @param config - The developer's app configuration
 * @returns Buffer containing the binary AXML manifest
 */
export function generateManifest(config: NitronConfig): Buffer {
  const orientation = ORIENTATION_MAP[config.orientation] ?? -1

  // Always include INTERNET permission (needed for WebView)
  const permissions = [...new Set([...config.permissions, 'INTERNET'])]

  // The activity class name — fixed to the template's WebView activity
  const activityName = 'com.nicron.webview.MainActivity'

  return encodeManifestToAxml({
    packageId: config.packageId,
    versionCode: versionToCode(config.version),
    versionName: config.version,
    appLabel: config.name,
    permissions,
    activityName,
    screenOrientation: orientation,
  })
}

/**
 * Convert semver string to Android versionCode integer.
 * "1.2.3" → 1*10000 + 2*100 + 3 = 10203
 */
function versionToCode(version: string): number {
  const parts = version.split('.').map(Number)
  const major = parts[0] || 0
  const minor = parts[1] || 0
  const patch = parts[2] || 0
  return major * 10000 + minor * 100 + patch
}
