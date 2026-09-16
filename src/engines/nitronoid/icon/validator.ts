// icon/validator.ts — Icon input validation
//
// Validates the source icon file before the pipeline runs.
// Catches common mistakes early with clear error messages.

import sharp from 'sharp'
import { stat } from 'node:fs/promises'
import type { ResolvedIconConfig } from './types.js'

export interface IconValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  metadata?: {
    width: number
    height: number
    format: string
    sizeBytes: number
  }
}

const SUPPORTED_FORMATS = new Set(['png', 'jpeg', 'jpg', 'webp'])
const MIN_RECOMMENDED_SIZE = 192 // xxxhdpi
const IDEAL_SIZE = 512 // Play Store requirement

/**
 * Validate the source icon file for correctness and quality.
 *
 * Checks:
 *   1. File exists and is readable
 *   2. Format is PNG, JPEG, or WebP (PNG strongly recommended)
 *   3. Resolution >= 192×192 (minimum for xxxhdpi)
 *   4. Square aspect ratio (1:1)
 *   5. Not too small (warns if < 512×512 for Play Store)
 */
export async function validateIcon(config: ResolvedIconConfig): Promise<IconValidationResult> {
  const errors: string[] = []
  const warnings: string[] = []

  // 1. File existence
  let fileStat
  try {
    fileStat = await stat(config.srcPath)
  } catch {
    return {
      valid: false,
      errors: [`Icon file not found: ${config.srcPath}`],
      warnings: [],
    }
  }

  if (!fileStat.isFile()) {
    return {
      valid: false,
      errors: [`Icon path is not a file: ${config.srcPath}`],
      warnings: [],
    }
  }

  // 2. Read image metadata
  let metadata
  try {
    metadata = await sharp(config.srcPath).metadata()
  } catch (e: any) {
    return {
      valid: false,
      errors: [`Cannot read icon file (corrupted or unsupported format): ${e.message}`],
      warnings: [],
    }
  }

  const format = metadata.format || 'unknown'
  const width = metadata.width || 0
  const height = metadata.height || 0

  // 3. Format check
  if (!SUPPORTED_FORMATS.has(format)) {
    errors.push(
      `Unsupported icon format: "${format}". Use PNG (recommended), JPEG, or WebP.`
    )
  } else if (format !== 'png') {
    warnings.push(
      `Icon is ${format.toUpperCase()} — PNG is recommended for best quality (lossless + transparency)`
    )
  }

  // 4. Resolution check
  if (width < MIN_RECOMMENDED_SIZE || height < MIN_RECOMMENDED_SIZE) {
    errors.push(
      `Icon too small: ${width}×${height}px. Minimum is ${MIN_RECOMMENDED_SIZE}×${MIN_RECOMMENDED_SIZE}px (xxxhdpi).`
    )
  } else if (width < IDEAL_SIZE || height < IDEAL_SIZE) {
    warnings.push(
      `Icon is ${width}×${height}px. Recommended: ${IDEAL_SIZE}×${IDEAL_SIZE}px for Google Play Store listing.`
    )
  }

  // 5. Aspect ratio check
  if (width !== height) {
    const ratio = (width / height).toFixed(2)
    warnings.push(
      `Icon is not square: ${width}×${height}px (ratio ${ratio}:1). ` +
      `Android will pad to fit, which may look uncentered. Use a 1:1 square image.`
    )
  }

  // 6. Background color validation
  if (config.background && !/^#[0-9a-fA-F]{6}$/.test(config.background)) {
    errors.push(
      `Invalid background color: "${config.background}". Use 6-digit hex format: #RRGGBB`
    )
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metadata: {
      width,
      height,
      format,
      sizeBytes: fileStat.size,
    },
  }
}
