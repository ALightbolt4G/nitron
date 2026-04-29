// validator.ts — Validate project structure and config before build
//
// Two levels of validation:
// 1. Config validation: Are all required fields present and valid?
// 2. Project validation: Do referenced files actually exist on disk?

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

/** Known valid Android permissions */
const KNOWN_PERMISSIONS = new Set([
  'INTERNET',
  'CAMERA',
  'READ_EXTERNAL_STORAGE',
  'WRITE_EXTERNAL_STORAGE',
  'ACCESS_FINE_LOCATION',
  'ACCESS_COARSE_LOCATION',
  'RECORD_AUDIO',
  'VIBRATE',
  'WAKE_LOCK',
  'ACCESS_NETWORK_STATE',
  'BLUETOOTH',
  'BLUETOOTH_ADMIN',
  'NFC',
  'READ_CONTACTS',
  'WRITE_CONTACTS',
  'READ_CALENDAR',
  'WRITE_CALENDAR',
  'CALL_PHONE',
  'SEND_SMS',
  'RECEIVE_SMS',
  'READ_PHONE_STATE',
  'FLASHLIGHT',
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
    const iconPath = resolve(projectDir, config.icon)
    try {
      await access(iconPath)
    } catch {
      warnings.push(`Icon not found: ${config.icon} — using default icon`)
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}
