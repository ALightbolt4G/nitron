// icon/adaptive.ts — Adaptive icon XML generator
//
// Android 8.0+ (API 26) uses adaptive icons: a foreground layer composited
// over a background (color or image) and clipped to the device's icon mask.
//
// This module generates the XML wrapper that tells Android how to composite
// the foreground PNG we generated in resizer.ts.

import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import type { ResolvedIconConfig } from './types.js'

/**
 * Generate the adaptive icon XML file for API 26+.
 *
 * Creates:
 *   res/mipmap-anydpi-v26/ic_launcher.xml
 *
 * This XML tells Android:
 *   - Background: solid color from config (e.g. "#000000")
 *   - Foreground: the ic_launcher_foreground PNG from the mipmap bucket
 *
 * Android selects the correct density foreground PNG automatically
 * based on the device's screen density.
 */
export async function generateAdaptiveIcon(
  config: ResolvedIconConfig,
  buildDir: string
): Promise<void> {
  const adaptiveDir = join(buildDir, 'res', 'mipmap-anydpi-v26')
  await mkdir(adaptiveDir, { recursive: true })

  const xml =
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n' +
    `    <background android:color="${config.background}"/>\n` +
    '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n' +
    '    <monochrome android:drawable="@mipmap/ic_launcher_foreground"/>\n' +
    '</adaptive-icon>\n'

  await writeFile(join(adaptiveDir, 'ic_launcher.xml'), xml)
}
