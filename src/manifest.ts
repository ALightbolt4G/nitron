// manifest.ts — Generate plain text AndroidManifest.xml from NitronConfig
//
// Generates a valid, standards-compliant AndroidManifest.xml string which
// is then compiled into a binary AXML file automatically by aapt2.
//
// v2.0: Added <meta-data> for WebView runtime configuration,
//       conditional cleartext traffic, and synced permissions dictionary.

import type { NitronConfig } from './types.js'

/** Map orientation string to Android XML attribute values */
const ORIENTATION_MAP: Record<string, string> = {
  portrait: 'portrait',
  landscape: 'landscape',
  auto: 'unspecified',
}

/**
 * Known valid Android permissions (synced with validator.ts).
 * Used here only for the "unknown permission" warning during manifest generation.
 */
const KNOWN_PERMISSIONS = new Set([
  // Network
  'INTERNET', 'ACCESS_NETWORK_STATE', 'ACCESS_WIFI_STATE', 'CHANGE_WIFI_STATE',
  'CHANGE_NETWORK_STATE', 'NEARBY_WIFI_DEVICES',
  // Location
  'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'ACCESS_BACKGROUND_LOCATION',
  // Camera & Media
  'CAMERA', 'RECORD_AUDIO', 'READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO',
  'READ_MEDIA_AUDIO', 'READ_MEDIA_VISUAL_USER_SELECTED',
  // Storage
  'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'MANAGE_EXTERNAL_STORAGE',
  // Contacts & Calendar
  'READ_CONTACTS', 'WRITE_CONTACTS', 'GET_ACCOUNTS', 'READ_CALENDAR', 'WRITE_CALENDAR',
  // Phone & SMS
  'CALL_PHONE', 'READ_PHONE_STATE', 'READ_PHONE_NUMBERS', 'SEND_SMS',
  'RECEIVE_SMS', 'READ_SMS', 'RECEIVE_MMS', 'RECEIVE_WAP_PUSH', 'ANSWER_PHONE_CALLS',
  // Bluetooth
  'BLUETOOTH', 'BLUETOOTH_ADMIN', 'BLUETOOTH_CONNECT', 'BLUETOOTH_SCAN', 'BLUETOOTH_ADVERTISE',
  // Sensors
  'BODY_SENSORS', 'BODY_SENSORS_BACKGROUND', 'ACTIVITY_RECOGNITION', 'HIGH_SAMPLING_RATE_SENSORS',
  // Notifications
  'POST_NOTIFICATIONS',
  // Biometrics
  'USE_BIOMETRIC', 'USE_FINGERPRINT',
  // System
  'VIBRATE', 'WAKE_LOCK', 'RECEIVE_BOOT_COMPLETED', 'FOREGROUND_SERVICE',
  'FOREGROUND_SERVICE_LOCATION', 'FOREGROUND_SERVICE_CAMERA', 'FOREGROUND_SERVICE_MICROPHONE',
  'FOREGROUND_SERVICE_DATA_SYNC', 'FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  'FOREGROUND_SERVICE_CONNECTED_DEVICE', 'REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
  'SCHEDULE_EXACT_ALARM', 'USE_EXACT_ALARM', 'REQUEST_INSTALL_PACKAGES',
  'SYSTEM_ALERT_WINDOW', 'NFC', 'FLASHLIGHT', 'SET_ALARM',
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
  const allowCleartext = config.network?.cleartext ?? false
  
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

  // ─── Build <meta-data> entries for WebView runtime config ───
  const metaDataEntries: string[] = []

  // Back button behavior
  const backButton = config.webview?.backButton ?? 'history'
  metaDataEntries.push(`            <meta-data android:name="nitron.backButton" android:value="${backButton}" />`)

  // Clear cache on start
  const clearCache = config.webview?.clearCacheOnStart ?? false
  metaDataEntries.push(`            <meta-data android:name="nitron.clearCacheOnStart" android:value="${clearCache}" />`)

  // Splash screen background color
  const splashBg = config.splashScreen?.backgroundColor ?? '#FFFFFF'
  metaDataEntries.push(`            <meta-data android:name="nitron.splashBackground" android:value="${splashBg}" />`)

  const metaDataXml = metaDataEntries.join('\n')

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
        android:usesCleartextTraffic="${allowCleartext}">
        
        <activity
            android:name="${activityName}"
            android:exported="true"
            android:configChanges="orientation|keyboardHidden|screenSize"
            android:screenOrientation="${orientation}">
            
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

${metaDataXml}
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
