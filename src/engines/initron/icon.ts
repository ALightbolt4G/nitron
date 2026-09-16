// engines/initron/icon.ts — Generate the iOS home-screen icon
//
// iOS has two ways to declare an app icon:
//
//   1. An Xcode asset catalog (Assets.xcassets/AppIcon.appiconset), compiled
//      by `actool` into a binary Assets.car. This is the modern, App-Store-
//      required approach — but actool only runs on macOS as part of Xcode,
//      so Nitron cannot regenerate it per-app without a Mac (same category
//      of problem as codesign, just with no zsign-equivalent workaround).
//
//   2. The legacy method: raw, un-catalogued PNG files dropped directly in
//      the bundle root, referenced by the CFBundleIcons key in Info.plist.
//      iOS has supported this since the App Store's earliest days and still
//      honors it today. Since it requires no compilation step at all, it's
//      the only option that fits Nitron's "no Xcode for regular builds"
//      model — so that's what we use here.
//
// Known limitation (documented, not hidden): this covers the home-screen
// icon for ad-hoc/sideloaded/TestFlight-internal installs. A real App Store
// submission additionally wants a 1024×1024 "marketing" icon delivered via
// an asset catalog, which — for now — still requires a one-time Xcode step,
// same as the shell template itself.

import sharp from 'sharp'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveIconConfig } from '../nitronoid/icon/index.js'
import type { NitronConfig } from '../../types.js'

/** iOS legacy icon sizes: [pointSize, scale] → pixel size */
const ICON_SIZES: Array<{ pointSize: number; scale: 2 | 3; pixels: number }> = [
  { pointSize: 60, scale: 2, pixels: 120 }, // iPhone app icon @2x
  { pointSize: 60, scale: 3, pixels: 180 }, // iPhone app icon @3x
]

export interface IOSIconResult {
  /** Base name to put in Info.plist's CFBundleIconFiles */
  iconBaseName: string
  /** Filenames written to the .app bundle root */
  filesWritten: string[]
}

/**
 * Generate the iOS home-screen icon files and write them into the .app bundle.
 *
 * iOS icons must NOT have an alpha channel (the system rejects/misrenders
 * icons with transparency), so — unlike the Android adaptive icon pipeline —
 * we flatten onto the configured background color instead of preserving
 * transparency.
 */
export async function generateIOSIcon(
  iconInput: NitronConfig['icon'],
  projectDir: string,
  appPath: string
): Promise<IOSIconResult> {
  const config = resolveIconConfig(iconInput ?? 'icon.png', projectDir)
  const filesWritten: string[] = []

  for (const { scale, pixels } of ICON_SIZES) {
    const buffer = await sharp(config.srcPath)
      .resize(pixels, pixels, { fit: 'contain', position: 'center' })
      .flatten({ background: config.background }) // iOS icons must be fully opaque
      .png({ compressionLevel: 6 })
      .toBuffer()

    const filename = `AppIcon60x60@${scale}x.png`
    await writeFile(join(appPath, filename), buffer)
    filesWritten.push(filename)
  }

  return {
    iconBaseName: 'AppIcon60x60',
    filesWritten,
  }
}
