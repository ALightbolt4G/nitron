// engines/initron/plist.ts — Patch Info.plist inside NitronShell.app
//
// v3.0.0 update: the shell is no longer built by Xcode (see
// scripts/build-ios-toolchain.sh + scripts/build-shell-device.sh) — it's
// cross-compiled on Linux with clang + cctools-port. That means Info.plist
// is never run through Xcode's plist compiler, so it stays a plain XML
// property list the whole way through. This is simpler and more robust
// than the earlier binary-plist approach (no bplist-parser/creator round
// trip needed) — iOS has always accepted XML Info.plist files; binary is
// just Xcode's default optimization, not a hard requirement.

import { readFile, writeFile } from 'node:fs/promises'
import { parse, build } from 'plist'
import type { NitronConfig } from '../../types.js'
import { resolveIOSPermissions } from './permissions.js'

type PlistDict = Record<string, any>

/** Read and parse the XML Info.plist into a plain JS object. */
export async function readInfoPlist(path: string): Promise<PlistDict> {
  const xml = await readFile(path, 'utf-8')
  return parse(xml) as PlistDict
}

/** Serialize a plain JS object back to an XML Info.plist. */
export async function writeInfoPlist(path: string, dict: PlistDict): Promise<void> {
  const xml = build(dict, { pretty: true })
  await writeFile(path, xml, 'utf-8')
}

/** Map the shared `orientation` config value to the iOS UISupportedInterfaceOrientations array. */
function resolveOrientations(orientation: NitronConfig['orientation']): string[] {
  switch (orientation) {
    case 'landscape':
      return ['UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight']
    case 'auto':
      return [
        'UIInterfaceOrientationPortrait',
        'UIInterfaceOrientationLandscapeLeft',
        'UIInterfaceOrientationLandscapeRight',
      ]
    case 'portrait':
    default:
      return ['UIInterfaceOrientationPortrait']
  }
}

/**
 * Apply the developer's app.js configuration onto the shell's Info.plist.
 *
 * Note: bundle ID, display name, and version can ALSO be set later by zsign
 * at signing time (-b, -n, -r flags). We still set them here so that an
 * unsigned build (e.g. the Simulator target, which needs no signing at all)
 * already reflects the developer's config correctly.
 */
export async function patchInfoPlist(
  plistPath: string,
  config: NitronConfig,
  iconBaseName?: string
): Promise<void> {
  const dict = await readInfoPlist(plistPath)

  dict.CFBundleDisplayName = config.name
  dict.CFBundleName = config.name
  dict.CFBundleIdentifier = config.ios?.bundleId || config.packageId
  dict.CFBundleShortVersionString = config.version

  // These two keys are checked by nearly every upload/validation tool
  // (Apple Transporter, TestFlight, BrowserStack, etc.) — without them
  // an otherwise perfectly valid IPA gets rejected as "invalid" with no
  // clear reason. Xcode always injects these automatically, which is why
  // they're easy to miss when hand-assembling an Info.plist.
  dict.CFBundleSupportedPlatforms = ['iPhoneOS']
  dict.MinimumOSVersion = config.ios?.minimumVersion || '13.0'
  dict.UIDeviceFamily = [1] // 1 = iPhone/iPod touch, 2 = iPad
  dict.UISupportedInterfaceOrientations = resolveOrientations(config.orientation)

  if (iconBaseName) {
    dict.CFBundleIcons = {
      CFBundlePrimaryIcon: {
        CFBundleIconFiles: [iconBaseName],
        CFBundleIconName: iconBaseName,
      },
    }
  }

  dict.NSAppTransportSecurity = {
    NSAllowsArbitraryLoads: Boolean(config.network?.cleartext),
  }

  // Remove any leftover placeholder permission keys from the template,
  // then set exactly the ones this app declared.
  for (const key of Object.keys(dict)) {
    if (key.startsWith('NS') && key.endsWith('UsageDescription')) {
      delete dict[key]
    }
  }
  const permissions = resolveIOSPermissions(config.permissions, config.ios?.permissionDescriptions)
  for (const { key, text } of permissions) {
    dict[key] = text
  }

  await writeInfoPlist(plistPath, dict)
}
