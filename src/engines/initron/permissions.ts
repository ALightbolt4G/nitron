// engines/initron/permissions.ts — Map Nitron's shared permission names
// (Android constant names, e.g. "CAMERA") to iOS Info.plist usage-description
// keys, since that's the format app.js already uses across both platforms.
//
// Not every Android permission has an iOS equivalent (e.g. SMS access does
// not exist as an iOS API at all). Permissions with no mapping are silently
// ignored on this platform — they simply have no effect, same as an unknown
// flag would. This is intentional: a shared `permissions` array should not
// force the developer to write platform-specific config for the common case.

/**
 * Maps a shared permission name to the iOS Info.plist key that requires a
 * human-readable usage description, plus a reasonable generic default text.
 * `null` means Nitron intentionally does not map this permission on iOS
 * (no equivalent system API, or it needs no Info.plist entry at all).
 */
const PERMISSION_MAP: Record<string, { key: string; defaultText: string } | null> = {
  // ─── Camera & Microphone ──────────────────────────────
  CAMERA: { key: 'NSCameraUsageDescription', defaultText: 'This app needs access to the camera.' },
  RECORD_AUDIO: { key: 'NSMicrophoneUsageDescription', defaultText: 'This app needs access to the microphone.' },

  // ─── Location ──────────────────────────────────────────
  ACCESS_FINE_LOCATION: { key: 'NSLocationWhenInUseUsageDescription', defaultText: 'This app needs access to your location.' },
  ACCESS_COARSE_LOCATION: { key: 'NSLocationWhenInUseUsageDescription', defaultText: 'This app needs access to your approximate location.' },
  ACCESS_BACKGROUND_LOCATION: { key: 'NSLocationAlwaysAndWhenInUseUsageDescription', defaultText: 'This app needs access to your location, including in the background.' },

  // ─── Photos / Media ──────────────────────────────────────
  READ_MEDIA_IMAGES: { key: 'NSPhotoLibraryUsageDescription', defaultText: 'This app needs access to your photos.' },
  READ_MEDIA_VIDEO: { key: 'NSPhotoLibraryUsageDescription', defaultText: 'This app needs access to your videos.' },
  READ_MEDIA_VISUAL_USER_SELECTED: { key: 'NSPhotoLibraryUsageDescription', defaultText: 'This app needs access to selected photos.' },
  READ_EXTERNAL_STORAGE: { key: 'NSPhotoLibraryUsageDescription', defaultText: 'This app needs access to your photo library.' },
  WRITE_EXTERNAL_STORAGE: { key: 'NSPhotoLibraryAddUsageDescription', defaultText: 'This app needs permission to save photos.' },
  MANAGE_EXTERNAL_STORAGE: null, // No iOS equivalent (sandboxed filesystem model)

  // ─── Contacts & Calendar ─────────────────────────────────
  READ_CONTACTS: { key: 'NSContactsUsageDescription', defaultText: 'This app needs access to your contacts.' },
  WRITE_CONTACTS: { key: 'NSContactsUsageDescription', defaultText: 'This app needs access to your contacts.' },
  GET_ACCOUNTS: null,
  READ_CALENDAR: { key: 'NSCalendarsUsageDescription', defaultText: 'This app needs access to your calendar.' },
  WRITE_CALENDAR: { key: 'NSCalendarsUsageDescription', defaultText: 'This app needs access to your calendar.' },

  // ─── Bluetooth ─────────────────────────────────────────
  BLUETOOTH: { key: 'NSBluetoothAlwaysUsageDescription', defaultText: 'This app uses Bluetooth to connect to nearby devices.' },
  BLUETOOTH_ADMIN: { key: 'NSBluetoothAlwaysUsageDescription', defaultText: 'This app uses Bluetooth to connect to nearby devices.' },
  BLUETOOTH_CONNECT: { key: 'NSBluetoothAlwaysUsageDescription', defaultText: 'This app uses Bluetooth to connect to nearby devices.' },
  BLUETOOTH_SCAN: { key: 'NSBluetoothAlwaysUsageDescription', defaultText: 'This app scans for nearby Bluetooth devices.' },
  BLUETOOTH_ADVERTISE: { key: 'NSBluetoothAlwaysUsageDescription', defaultText: 'This app uses Bluetooth to connect to nearby devices.' },
  NEARBY_WIFI_DEVICES: { key: 'NSLocalNetworkUsageDescription', defaultText: 'This app discovers devices on your local network.' },

  // ─── Motion & Biometrics ─────────────────────────────────
  ACTIVITY_RECOGNITION: { key: 'NSMotionUsageDescription', defaultText: 'This app uses motion data to detect activity.' },
  BODY_SENSORS: { key: 'NSMotionUsageDescription', defaultText: 'This app uses sensor data related to your body.' },
  BODY_SENSORS_BACKGROUND: { key: 'NSMotionUsageDescription', defaultText: 'This app uses sensor data related to your body.' },
  HIGH_SAMPLING_RATE_SENSORS: null,
  USE_BIOMETRIC: { key: 'NSFaceIDUsageDescription', defaultText: 'This app uses Face ID to authenticate you.' },
  USE_FINGERPRINT: { key: 'NSFaceIDUsageDescription', defaultText: 'This app uses Face ID to authenticate you.' },

  // ─── No iOS equivalent — network/telephony/SMS are handled
  // differently (or not exposed at all) on iOS. Silently ignored. ───
  INTERNET: null,
  ACCESS_NETWORK_STATE: null,
  ACCESS_WIFI_STATE: null,
  CHANGE_WIFI_STATE: null,
  CHANGE_NETWORK_STATE: null,
  CALL_PHONE: null,
  READ_PHONE_STATE: null,
  READ_PHONE_NUMBERS: null,
  SEND_SMS: null,
  RECEIVE_SMS: null,
  READ_SMS: null,
  RECEIVE_MMS: null,
  RECEIVE_WAP_PUSH: null,
  ANSWER_PHONE_CALLS: null,
  // Push notifications on iOS are requested at runtime via
  // UNUserNotificationCenter, not declared in Info.plist — no mapping needed.
  POST_NOTIFICATIONS: null,
}

export interface ResolvedIOSPermission {
  /** The Info.plist key, e.g. "NSCameraUsageDescription" */
  key: string
  /** The usage description text shown to the user in the system prompt */
  text: string
}

/**
 * Resolve the shared `permissions` array + optional per-permission
 * description overrides into the set of Info.plist usage-description
 * entries this build actually needs.
 *
 * Multiple Android permissions can map to the same iOS key (e.g. both
 * ACCESS_FINE_LOCATION and ACCESS_COARSE_LOCATION map to
 * NSLocationWhenInUseUsageDescription) — in that case the first matching
 * permission's text wins, unless an explicit override is given for either.
 */
export function resolveIOSPermissions(
  permissions: string[],
  overrides: Record<string, string> | undefined
): ResolvedIOSPermission[] {
  const resolved = new Map<string, string>()

  for (const perm of permissions) {
    const mapping = PERMISSION_MAP[perm]
    if (!mapping) continue // no iOS equivalent — silently skip

    const overrideText = overrides?.[perm]
    if (!resolved.has(mapping.key) || overrideText) {
      resolved.set(mapping.key, overrideText ?? mapping.defaultText)
    }
  }

  return Array.from(resolved.entries()).map(([key, text]) => ({ key, text }))
}
