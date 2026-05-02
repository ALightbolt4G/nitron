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

const KNOWN_PERMISSIONS = new Set([
  'INTERNET',
  'CAMERA',
  'ACCESS_FINE_LOCATION',
  'ACCESS_COARSE_LOCATION',
  'READ_EXTERNAL_STORAGE',
  'WRITE_EXTERNAL_STORAGE',
  'RECORD_AUDIO',
  'VIBRATE',
  'ACCESS_NETWORK_STATE',
  'BLUETOOTH',
  'BLUETOOTH_ADMIN',
  'WAKE_LOCK',
  'READ_CONTACTS',
  'RECEIVE_BOOT_COMPLETED'
])

/**
 * Generate a binary AndroidManifest.xml buffer from the NitronConfig.
 *
 * @param config - The developer's app configuration
 * @returns Buffer containing the binary AXML manifest
 */
export function generateManifest(config: NitronConfig): Buffer {
  const orientation = ORIENTATION_MAP[config.orientation] ?? -1

  // Always include INTERNET permission (needed for WebView)
  const permissions = [...new Set([...config.permissions.map(p => p.toUpperCase()), 'INTERNET'])]

  for (const perm of permissions) {
    if (!KNOWN_PERMISSIONS.has(perm)) {
      console.warn(`\n⚠ WARNING: Unknown permission "${perm}". This might cause build or runtime issues on Android.`)
    }
  }

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
