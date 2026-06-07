// icon/index.ts — Icon pipeline orchestrator
//
// This is the public API for the icon subsystem. It resolves the user's
// icon config (string or object), runs the pipeline stages in order,
// and reports statistics back to the builder.
//
// Pipeline:
//   1. Resolve config → ResolvedIconConfig
//   2. Check cache → skip if unchanged
//   3. Resize → generate mipmap variants
//   4. Adaptive → generate XML wrapper
//   5. Write cache → for next build

import { join } from 'node:path'
import { stat } from 'node:fs/promises'
import type { IconConfig } from '../types.js'
import type { ResolvedIconConfig } from './types.js'
import { resizeIcons, type ResizeStats } from './resizer.js'
import { generateAdaptiveIcon } from './adaptive.js'
import { checkIconCache, writeIconCache } from './cache.js'
import { validateIcon } from './validator.js'
import { MIPMAP_BUCKETS } from './types.js'

export interface IconPipelineResult {
  /** Whether the pipeline ran (false = cache hit, skipped) */
  executed: boolean
  /** Resize statistics (null if skipped) */
  stats: ResizeStats | null
  /** Whether adaptive icon XML was generated */
  adaptiveGenerated: boolean
}

/**
 * Resolve user-facing icon config into internal ResolvedIconConfig.
 *
 * Supports two input formats:
 *   - String: `"icon.png"` → resolved with defaults
 *   - Object: `{ src: "icon.png", background: "#000", adaptive: true }`
 */
export function resolveIconConfig(
  input: string | IconConfig,
  projectDir: string
): ResolvedIconConfig {
  if (typeof input === 'string') {
    return {
      srcPath: join(projectDir, input),
      background: '#FFFFFF',
      adaptive: true,
    }
  }

  return {
    srcPath: join(projectDir, input.src),
    background: input.background || '#FFFFFF',
    adaptive: input.adaptive !== false,
  }
}

/**
 * Execute the full icon generation pipeline.
 *
 * @param iconInput - User's icon config (string path or IconConfig object)
 * @param projectDir - Absolute path to the project root
 * @param buildDir - Absolute path to the APK build staging directory
 * @returns Pipeline result with stats
 */
export async function processIcon(
  iconInput: string | IconConfig,
  projectDir: string,
  buildDir: string
): Promise<IconPipelineResult> {
  // Step 1: Resolve config
  const config = resolveIconConfig(iconInput, projectDir)

  // Validate source exists and meets requirements
  const validation = await validateIcon(config)
  if (!validation.valid) {
    throw new Error(`Icon validation failed:\n  - ${validation.errors.join('\n  - ')}`)
  }

  // Step 2: Check cache
  const cacheValid = await checkIconCache(config, projectDir)
  if (cacheValid) {
    // Even if cached, we still need to generate output for this build
    // (build dir is temporary). Cache only tells us the input hasn't changed.
    // In the future, we could cache the output artifacts too.
  }

  // Step 3: Resize into mipmap density variants
  const stats = await resizeIcons(config, buildDir)

  // Step 4: Generate adaptive icon XML (if enabled)
  let adaptiveGenerated = false
  if (config.adaptive) {
    await generateAdaptiveIcon(config, buildDir)
    adaptiveGenerated = true
  }

  // Step 5: Write cache for next build
  await writeIconCache(config, projectDir)

  return {
    executed: true,
    stats,
    adaptiveGenerated,
  }
}

/**
 * Generate a text-based preview of how icons will be generated.
 * Used by `nitron icon preview` CLI command.
 */
export async function previewIcon(
  iconInput: string | IconConfig,
  projectDir: string
): Promise<string> {
  const config = resolveIconConfig(iconInput, projectDir)

  // Check source exists
  let srcInfo = ''
  try {
    const s = await stat(config.srcPath)
    const sizeKB = (s.size / 1024).toFixed(1)

    // Get image dimensions
    const sharp = (await import('sharp')).default
    const metadata = await sharp(config.srcPath).metadata()
    srcInfo = `${metadata.width}×${metadata.height} (${sizeKB}KB)`
  } catch {
    srcInfo = '⚠ FILE NOT FOUND'
  }

  const lines: string[] = [
    '',
    '🎨 Nitron Icon Preview',
    '═══════════════════════════════════════',
    '',
    `  Source:     ${config.srcPath}`,
    `  Dimensions: ${srcInfo}`,
    `  Background: ${config.background}`,
    `  Adaptive:   ${config.adaptive ? 'yes' : 'no'}`,
    '',
    '  📐 Mipmap Variants:',
    '  ─────────────────────────────────────',
  ]

  for (const bucket of MIPMAP_BUCKETS) {
    const fgInner = Math.round(bucket.size * 0.72)
    const padding = Math.round((bucket.size - fgInner) / 2)
    lines.push(
      `    mipmap-${bucket.name.padEnd(7)} │ ${bucket.size}×${bucket.size}px │ content: ${fgInner}×${fgInner}px │ padding: ${padding}px`
    )
  }

  lines.push(
    '',
    '  🔲 Adaptive Icon (API 26+):',
    '  ─────────────────────────────────────',
  )

  if (config.adaptive) {
    lines.push(
      `    Background:  ${config.background} (solid color)`,
      `    Foreground:  @mipmap/ic_launcher_foreground`,
      `    Safe zone:   72% center circle (Android clips to device shape)`,
      `    Output:      res/mipmap-anydpi-v26/ic_launcher.xml`,
    )
  } else {
    lines.push('    Disabled — using legacy icon only')
  }

  // Check cache status
  const cached = await checkIconCache(config, projectDir)
  lines.push(
    '',
    `  🗄️  Cache:      ${cached ? '✓ valid (rebuild will be skipped)' : '✗ stale (will regenerate)'}`,
    '',
    '═══════════════════════════════════════',
    '',
  )

  return lines.join('\n')
}

// Re-export types for convenience
export type { ResolvedIconConfig } from './types.js'
export { MIPMAP_BUCKETS } from './types.js'
