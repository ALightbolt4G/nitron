// engines/initron/signer.ts — Sign the .app bundle using the bundled zsign binary
//
// zsign is a cross-platform (Linux/Windows/macOS) open-source alternative to
// Apple's `codesign` — it re-signs .app/.ipa bundles with a real Apple
// certificate + provisioning profile, without Xcode. This is the iOS
// equivalent of uber-apk-signer.jar in engines/nitronoid/signer.ts.
//
// Real device installs and TestFlight/App Store submission REQUIRE a valid
// Apple Developer certificate (.p12) and provisioning profile
// (.mobileprovision) — this is an Apple platform requirement, not something
// Nitron can bypass. The Simulator target does not need any of this at all
// (see build.ts) — this signer is only invoked for `--target ios`.

import { execFile } from 'node:child_process'
import { access, mkdir, cp, rm } from 'node:fs/promises'
import { join, dirname, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { NitronConfig } from '../../types.js'

const execFileAsync = promisify(execFile)

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * zsign (like Apple's own IPA format) expects the .app to sit inside a
 * folder literally named "Payload" when producing an .ipa — that's the
 * real internal structure of every .ipa file ever shipped
 * (Payload/YourApp.app/...). Passing the bare .app directly makes zsign
 * sign the binary successfully but then fail with "Can't find payload
 * directory!" while trying to package the .ipa. This wraps the app in a
 * fresh Payload/ directory right before handing it to zsign.
 */
async function wrapInPayload(appPath: string): Promise<string> {
  const payloadDir = join(tmpdir(), `nitron-payload-${Date.now()}`, 'Payload')
  await mkdir(payloadDir, { recursive: true })
  const dest = join(payloadDir, basename(appPath))
  await cp(appPath, dest, { recursive: true })
  return payloadDir
}

async function cleanupPayload(payloadDir: string): Promise<void> {
  await rm(dirname(payloadDir), { recursive: true, force: true })
}

export interface IOSCredentials {
  /** Path to a .p12 certificate file */
  p12Path: string
  /** Password for the .p12 file */
  p12Password: string
  /** Path to a .mobileprovision file */
  provisioningProfilePath: string
}

/**
 * Resolve the path to the zsign binary.
 * Searches:
 * 1. NITRON_ZSIGN_PATH env variable
 * 2. Bundled vendor/zsign/<platform>/zsign
 * 3. Local toolchain/bin/zsign
 * 4. Common macOS Homebrew paths (/opt/homebrew/bin/zsign, /usr/local/bin/zsign)
 * 5. System PATH lookup (which / where)
 */
export async function findZsign(): Promise<string> {
  // 1. Explicit env var
  if (process.env.NITRON_ZSIGN_PATH) {
    try {
      await access(process.env.NITRON_ZSIGN_PATH)
      return process.env.NITRON_ZSIGN_PATH
    } catch {}
  }

  // 2. Bundled vendor path
  const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux'
  const ext = process.platform === 'win32' ? '.exe' : ''
  const bundledPath = join(__dirname, '..', 'vendor', 'zsign', platform, `zsign${ext}`)
  try {
    await access(bundledPath)
    return bundledPath
  } catch {}

  // 3. Local toolchain path
  const localToolchainPath = join(__dirname, '..', 'toolchain', 'bin', `zsign${ext}`)
  try {
    await access(localToolchainPath)
    return localToolchainPath
  } catch {}

  // 4. Common macOS Homebrew paths
  if (process.platform === 'darwin') {
    for (const macPath of ['/opt/homebrew/bin/zsign', '/usr/local/bin/zsign']) {
      try {
        await access(macPath)
        return macPath
      } catch {}
    }
  }

  // 5. System PATH lookup
  try {
    const lookupCmd = process.platform === 'win32' ? 'where' : 'which'
    const { stdout } = await execFileAsync(lookupCmd, ['zsign'])
    const found = stdout.trim().split(/\r?\n/)[0]
    if (found) {
      await access(found)
      return found
    }
  } catch {}

  if (process.platform === 'win32') {
    throw new Error(
      `zsign binary not found for Windows.\n\n` +
      `iOS apps can be built directly on Windows using WSL2 (where the bundled Linux zsign runs out-of-the-box):\n` +
      `  wsl npx nitron build --target ios\n\n` +
      `Alternatively, build a native zsign.exe (https://github.com/zhlynn/zsign) and set NITRON_ZSIGN_PATH.`
    )
  }

  if (process.platform === 'darwin') {
    throw new Error(
      `zsign binary not found for macOS.\n\n` +
      `Install zsign via Homebrew:\n` +
      `  brew install zsign\n\n` +
      `Or build from source: https://github.com/zhlynn/zsign`
    )
  }

  throw new Error(
    `zsign binary not found for Linux.\n` +
    `Expected at: ${bundledPath}\n` +
    `Install it via your package manager or set NITRON_ZSIGN_PATH.`
  )
}

/**
 * Sign a .app bundle for real-device installation, producing a .ipa file.
 *
 * @param appPath - Path to the unpacked, already-injected-and-patched .app bundle
 * @param outputIpaPath - Where to write the signed .ipa
 * @param config - Nitron project config (used for bundle id / name / version overrides)
 * @param credentials - Apple certificate + provisioning profile
 */
export async function signApp(
  appPath: string,
  outputIpaPath: string,
  config: NitronConfig,
  credentials: IOSCredentials
): Promise<void> {
  const zsign = await findZsign()
  const bundleId = config.ios?.bundleId || config.packageId
  const payloadDir = await wrapInPayload(appPath)

  const args = [
    '-k', credentials.p12Path,
    '-p', credentials.p12Password,
    '-m', credentials.provisioningProfilePath,
    '-o', outputIpaPath,
    '-b', bundleId,
    '-n', config.name,
    '-r', config.version,
    payloadDir,
  ]

  try {
    await execFileAsync(zsign, args)
  } catch (err: any) {
    const details = [err.stdout, err.stderr].filter(Boolean).join('\n').trim()
    throw new Error(
      `zsign failed to sign the app: ${err.message}${details ? `\n\n${details}` : ''}\n` +
      `Common causes: expired certificate, bundle ID not matching the\n` +
      `provisioning profile, or an expired/revoked provisioning profile.`
    )
  } finally {
    await cleanupPayload(payloadDir)
  }
}

/**
 * Ad-hoc sign a .app bundle without a real Apple certificate.
 * Useful for local testing on a jailbroken device or with sideloading tools
 * — NOT valid for App Store or TestFlight distribution.
 */
export async function adHocSignApp(appPath: string, outputIpaPath: string): Promise<void> {
  const zsign = await findZsign()
  const payloadDir = await wrapInPayload(appPath)
  try {
    await execFileAsync(zsign, ['-a', '-o', outputIpaPath, payloadDir])
  } catch (err: any) {
    const details = [err.stdout, err.stderr].filter(Boolean).join('\n').trim()
    throw new Error(`zsign ad-hoc signing failed: ${err.message}${details ? `\n\n${details}` : ''}`)
  } finally {
    await cleanupPayload(payloadDir)
  }
}
