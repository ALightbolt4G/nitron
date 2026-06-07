// manifest.ts — Generate plain text AndroidManifest.xml from NitronConfig
//
// Generates a valid, standards-compliant AndroidManifest.xml string which
// is then compiled into a binary AXML file automatically by aapt2.

import type { NitronConfig } from './types.js'

/** Map orientation string to Android XML attribute values */
const ORIENTATION_MAP: Record<string, string> = {
  portrait: 'portrait',
  landscape: 'landscape',
  auto: 'unspecified',
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
 * Generate a standard AndroidManifest.xml string from the NitronConfig.
 *
 * @param config - The developer's app configuration
 * @returns String containing the plain XML manifest
 */
export function generateManifestXml(config: NitronConfig): string {
  const orientation = ORIENTATION_MAP[config.orientation] ?? 'unspecified'
  const versionCode = versionToCode(config.version)
  
  // Always include INTERNET permission (needed for WebView)
  const permissions = [...new Set([...config.permissions.map(p => p.toUpperCase()), 'INTERNET'])]

  for (const perm of permissions) {
    if (!KNOWN_PERMISSIONS.has(perm)) {
      console.warn(`\n⚠ WARNING: Unknown permission "${perm}". This might cause build or runtime issues on Android.`)
    }
  }

  const permissionsXml = permissions
    .map(p => `    <uses-permission android:name="android.permission.${p}" />`)
    .join('\n')

  const activityName = 'com.nicron.webview.MainActivity'

  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${config.packageId}"
    android:versionCode="${versionCode}"
    android:versionName="${config.version}">

    <uses-sdk android:minSdkVersion="21" android:targetSdkVersion="34" />
    
${permissionsXml}

    <application
        android:label="${config.name}"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher"
        android:hardwareAccelerated="true"
        android:usesCleartextTraffic="true">
        
        <activity
            android:name="${activityName}"
            android:exported="true"
            android:configChanges="orientation|keyboardHidden|screenSize"
            android:screenOrientation="${orientation}">
            
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`
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
