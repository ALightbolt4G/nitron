// icon/resizer.ts — Density-aware icon resizer
//
// Generates properly sized PNGs for each Android mipmap density bucket.
// Uses lossless PNG output and center-fit resize to preserve quality.

import sharp from 'sharp'
import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import {
  MIPMAP_BUCKETS,
  ADAPTIVE_SAFE_ZONE_RATIO,
  LEGACY_PADDING_RATIO,
  type ResolvedIconConfig,
} from './types.js'

/**
 * Parse a hex color string to RGBA components.
 */
function parseHexColor(hex: string): { r: number; g: number; b: number; alpha: number } {
  const clean = hex.replace('#', '')
  return {
    r: parseInt(clean.substring(0, 2), 16) || 0,
    g: parseInt(clean.substring(2, 4), 16) || 0,
    b: parseInt(clean.substring(4, 6), 16) || 0,
    alpha: 1,
  }
}

export interface ResizeStats {
  /** Total bytes saved vs copying the original to all buckets */
  totalOutputBytes: number
  /** Number of density variants generated */
  variantsGenerated: number
  /** Original file size */
  originalBytes: number
}

/**
 * Generate all mipmap density variants from a source icon.
 *
 * For each density bucket, generates two files:
 *   - ic_launcher.png — Legacy icon with solid background + padding
 *   - ic_launcher_foreground.png — Foreground layer (transparent bg, safe-zone padded)
 *
 * Key decisions:
 *   - `fit: 'contain'` prevents distortion on non-square inputs
 *   - `position: 'center'` ensures the icon is always centered (safe zone compliance)
 *   - PNG compression level 6 (balanced: lossless quality, reasonable file size)
 *   - Foreground uses ADAPTIVE_SAFE_ZONE_RATIO (72%) for Android's 66% safe circle
 *   - Legacy uses LEGACY_PADDING_RATIO (80%) for a cleaner look on older launchers
 */
export async function resizeIcons(
  config: ResolvedIconConfig,
  buildDir: string
): Promise<ResizeStats> {
  const { stat } = await import('node:fs/promises')
  const originalStat = await stat(config.srcPath)
  let totalOutputBytes = 0
  let variantsGenerated = 0

  const bgColor = parseHexColor(config.background)

  for (const bucket of MIPMAP_BUCKETS) {
    const mipmapDir = join(buildDir, `res/mipmap-${bucket.name}`)
    await mkdir(mipmapDir, { recursive: true })

    // ── Foreground layer (transparent bg, safe-zone padded) ──
    // Android clips adaptive foreground to a shape. Content must stay
    // within the 66% safe circle. We size to 72% to be slightly generous.
    const fgInner = Math.round(bucket.size * ADAPTIVE_SAFE_ZONE_RATIO)
    const fgPadTop = Math.floor((bucket.size - fgInner) / 2)
    const fgPadBottom = bucket.size - fgInner - fgPadTop

    const fgBuffer = await sharp(config.srcPath)
      .resize(fgInner, fgInner, {
        fit: 'contain',
        position: 'center',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .extend({
        top: fgPadTop,
        bottom: fgPadBottom,
        left: fgPadTop,
        right: fgPadBottom,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 6 })
      .toBuffer()

    await writeFile(join(mipmapDir, 'ic_launcher_foreground.png'), fgBuffer)
    totalOutputBytes += fgBuffer.length
    variantsGenerated++

    // ── Legacy icon (solid background + content padding) ──
    // For pre-API 26 launchers that don't support adaptive icons.
    const legacyInner = Math.round(bucket.size * LEGACY_PADDING_RATIO)
    const legacyPadTop = Math.floor((bucket.size - legacyInner) / 2)
    const legacyPadBottom = bucket.size - legacyInner - legacyPadTop

    const legacyBuffer = await sharp(config.srcPath)
      .resize(legacyInner, legacyInner, {
        fit: 'contain',
        position: 'center',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .extend({
        top: legacyPadTop,
        bottom: legacyPadBottom,
        left: legacyPadTop,
        right: legacyPadBottom,
        background: bgColor,
      })
      .png({ compressionLevel: 6 })
      .toBuffer()

    await writeFile(join(mipmapDir, 'ic_launcher.png'), legacyBuffer)
    totalOutputBytes += legacyBuffer.length
    variantsGenerated++
  }

  return {
    totalOutputBytes,
    variantsGenerated,
    originalBytes: originalStat.size,
  }
}
