// validator.ts — Validate project structure and config before build
//
// Two levels of validation:
// 1. Config validation: Are all required fields present and valid?
// 2. Project validation: Do referenced files actually exist on disk?
//
// v2.0: Expanded permissions dictionary to 50+ entries.

import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { NitronConfig, ValidationResult } from './types.js'

/**
 * Valid Android package ID format:
 * - At least 3 dot-separated segments
 * - Each segment starts with a lowercase letter
 * - Segments contain only lowercase letters and digits
 * - Examples: com.myname.myapp, org.example.app
 */
const PACKAGE_ID_REGEX = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/

/**
 * Known valid Android permissions.
 * v2.0: Expanded to cover modern Android permissions (API 21–34+).
 */
const KNOWN_PERMISSIONS = new Set([
  // ─── Network ──────────────────────────────────
  'INTERNET',
  'ACCESS_NETWORK_STATE',
  'ACCESS_WIFI_STATE',
  'CHANGE_WIFI_STATE',
  'CHANGE_NETWORK_STATE',
  'NEARBY_WIFI_DEVICES',         // Android 13+

  // ─── Location ─────────────────────────────────
  'ACCESS_FINE_LOCATION',
  'ACCESS_COARSE_LOCATION',
  'ACCESS_BACKGROUND_LOCATION',  // Android 10+

  // ─── Camera & Media ───────────────────────────
  'CAMERA',
  'RECORD_AUDIO',
  'READ_MEDIA_IMAGES',           // Android 13+
  'READ_MEDIA_VIDEO',            // Android 13+
  'READ_MEDIA_AUDIO',            // Android 13+
  'READ_MEDIA_VISUAL_USER_SELECTED', // Android 14+

  // ─── Storage (legacy) ─────────────────────────
  'READ_EXTERNAL_STORAGE',
  'WRITE_EXTERNAL_STORAGE',
  'MANAGE_EXTERNAL_STORAGE',     // Android 11+

  // ─── Contacts & Calendar ──────────────────────
  'READ_CONTACTS',
  'WRITE_CONTACTS',
  'GET_ACCOUNTS',
  'READ_CALENDAR',
  'WRITE_CALENDAR',

  // ─── Phone & SMS ──────────────────────────────
  'CALL_PHONE',
  'READ_PHONE_STATE',
  'READ_PHONE_NUMBERS',          // Android 8+
  'SEND_SMS',
  'RECEIVE_SMS',
  'READ_SMS',
  'RECEIVE_MMS',
  'RECEIVE_WAP_PUSH',
  'ANSWER_PHONE_CALLS',          // Android 8+

  // ─── Bluetooth ────────────────────────────────
  'BLUETOOTH',
  'BLUETOOTH_ADMIN',
  'BLUETOOTH_CONNECT',           // Android 12+
  'BLUETOOTH_SCAN',              // Android 12+
  'BLUETOOTH_ADVERTISE',         // Android 12+

  // ─── Sensors & Activity ───────────────────────
  'BODY_SENSORS',
  'BODY_SENSORS_BACKGROUND',     // Android 13+
  'ACTIVITY_RECOGNITION',        // Android 10+
  'HIGH_SAMPLING_RATE_SENSORS',

  // ─── Notifications ────────────────────────────
  'POST_NOTIFICATIONS',          // Android 13+

  // ─── Biometrics & Security ────────────────────
  'USE_BIOMETRIC',
  'USE_FINGERPRINT',

  // ─── System ───────────────────────────────────
  'VIBRATE',
  'WAKE_LOCK',
  'RECEIVE_BOOT_COMPLETED',
  'FOREGROUND_SERVICE',
  'FOREGROUND_SERVICE_LOCATION',
  'FOREGROUND_SERVICE_CAMERA',
  'FOREGROUND_SERVICE_MICROPHONE',
  'FOREGROUND_SERVICE_DATA_SYNC',
  'FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  'FOREGROUND_SERVICE_CONNECTED_DEVICE',
  'REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
  'SCHEDULE_EXACT_ALARM',
  'USE_EXACT_ALARM',             // Android 13+
  'REQUEST_INSTALL_PACKAGES',
  'SYSTEM_ALERT_WINDOW',
  'NFC',
  'FLASHLIGHT',
  'SET_ALARM',
])

const VALID_ORIENTATIONS = ['portrait', 'landscape', 'auto'] as const

/**
 * Validate the NitronConfig object for required fields and correct formats.
 * This checks the data itself, not the filesystem.
 */
export function validateConfig(config: NitronConfig): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // --- Required fields ---
  if (!config.name || config.name.trim() === '') {
    errors.push('Missing required field: name')
  }

  if (!config.packageId || config.packageId.trim() === '') {
    errors.push('Missing required field: packageId')
  } else if (!PACKAGE_ID_REGEX.test(config.packageId)) {
    errors.push(
      `Invalid packageId: "${config.packageId}" — must follow format: com.name.app (lowercase, at least 3 segments)`
    )
  }

  if (!config.entry || config.entry.trim() === '') {
    errors.push('Missing required field: entry')
  }

  // --- Format checks ---
  if (!VALID_ORIENTATIONS.includes(config.orientation as any)) {
    errors.push(
      `Invalid orientation: "${config.orientation}" — must be one of: ${VALID_ORIENTATIONS.join(', ')}`
    )
  }

  // --- Permission warnings ---
  for (const perm of config.permissions) {
    if (!KNOWN_PERMISSIONS.has(perm)) {
      warnings.push(
        `Unknown permission: "${perm}" — this may not be a valid Android permission`
      )
    }
  }

  // --- WebView config warnings ---
  if (config.webview?.backButton && !['history', 'exit'].includes(config.webview.backButton)) {
    warnings.push(
      `Invalid webview.backButton: "${config.webview.backButton}" — must be "history" or "exit", defaulting to "history"`
    )
  }

  return { valid: errors.length === 0, errors, warnings }
}

/**
 * Validate the project filesystem — check that referenced files exist.
 * This runs after config validation, so we know the config shape is valid.
 */
export async function validateProject(
  projectDir: string,
  config: NitronConfig
): Promise<ValidationResult> {
  const errors: string[] = []
  const warnings: string[] = []

  // --- Check entry HTML file exists ---
  const entryPath = resolve(projectDir, config.entry)
  try {
    await access(entryPath)
  } catch {
    errors.push(`Entry file not found: ${config.entry}`)
  }

  // --- Check icon file exists (warning only, not fatal) ---
  if (config.icon) {
    const iconSrc = typeof config.icon === 'string' ? config.icon : config.icon.src
    if (iconSrc) {
      const iconPath = resolve(projectDir, iconSrc)
      try {
        await access(iconPath)
      } catch {
        warnings.push(`Icon not found: ${iconSrc} — using default icon`)
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}
