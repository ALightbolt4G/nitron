// signer.ts — Sign APK using uber-apk-signer (bundled JAR)
//
// uber-apk-signer handles:
// - Debug keystore generation (auto)
// - APK signing (v1 + v2)
// - Zipalign
//
// Requires Java Runtime 8+ on the developer's machine.

import { execFile } from 'node:child_process'
import { access, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { dirname, basename } from 'node:path'
import prompts from 'prompts'

const execFileAsync = promisify(execFile)

// Resolve path to the bundled uber-apk-signer JAR
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Get path to the bundled uber-apk-signer JAR.
 */
function getSignerJarPath(): string {
  // In dist: dist/cli.js → look for ../vendor/uber-apk-signer.jar
  return join(__dirname, '..', 'vendor', 'uber-apk-signer.jar')
}

/**
 * Check if Java is available on the system.
 */
export async function findJava(): Promise<string> {
  // Check JAVA_HOME first
  const javaHomeRaw = process.env.JAVA_HOME
  if (javaHomeRaw) {
    const javaHome = javaHomeRaw.trim()
    const ext = process.platform === 'win32' ? '.exe' : ''
    const javaBin = join(javaHome, 'bin', `java${ext}`)
    try {
      await execFileAsync(javaBin, ['-version'])
      return javaBin
    } catch (err) {
      console.error("JAVA_HOME check failed:", err)
      // JAVA_HOME set but invalid, fall through
    }
  }

  // Try system PATH
  try {
    await execFileAsync('java', ['-version'])
    return 'java'
  } catch {
    throw new Error(
      'Java not found — Nitron needs Java Runtime 8+ for APK signing.\n' +
      '  Install from: https://adoptium.net/\n' +
      '  Or set JAVA_HOME to your Java installation.'
    )
  }
}

/**
 * Check if Keytool is available on the system.
 */
export async function findKeytool(): Promise<string> {
  const javaHomeRaw = process.env.JAVA_HOME
  if (javaHomeRaw) {
    const javaHome = javaHomeRaw.trim()
    const ext = process.platform === 'win32' ? '.exe' : ''
    const keytoolBin = join(javaHome, 'bin', `keytool${ext}`)
    try {
      await execFileAsync(keytoolBin, ['-help'])
      return keytoolBin
    } catch (err) {
      // Fall through
    }
  }

  try {
    await execFileAsync('keytool', ['-help'])
    return 'keytool'
  } catch {
    throw new Error(
      'Keytool not found — Nitron needs the Java JDK (not just JRE) to generate a keystore.\n' +
      '  Install the full JDK from: https://adoptium.net/\n' +
      '  Or set JAVA_HOME to your JDK installation.'
    )
  }
}

/**
 * Sign an APK file using uber-apk-signer.
 *
 * @param unsignedApkPath - Path to the unsigned APK
 * @param outputDir - Directory where the signed APK will be placed
 * @returns Path to the signed APK file
 */
export async function signApk(unsignedApkPath: string, outputDir: string, options?: { release?: boolean, projectDir?: string }): Promise<string> {
  const java = await findJava()
  const signerJar = getSignerJarPath()

  // Verify signer JAR exists
  try {
    await access(signerJar)
  } catch {
    throw new Error(
      'uber-apk-signer.jar not found — the Nitron installation may be corrupted.\n' +
      `  Expected at: ${signerJar}`
    )
  }

  await mkdir(outputDir, { recursive: true })

  const args = [
    '-jar',
    signerJar,
    '--apks', unsignedApkPath,
    '--out', outputDir,
    '--allowResign',
  ]

  if (options?.release && options.projectDir) {
    const keystorePath = join(options.projectDir, 'nitron-release.keystore')
    try {
      await access(keystorePath)
    } catch {
      throw new Error(
        'Release keystore not found!\n' +
        'Run "npx nitron keystore" to generate a release keystore before building with --release.'
      )
    }

    const { password } = await prompts({
      type: 'password',
      name: 'password',
      message: 'Enter release keystore password'
    })

    if (!password) {
      throw new Error('Password is required for release signing.')
    }

    args.push(
      '--ks', keystorePath,
      '--ksAlias', 'release',
      '--ksPass', password,
      '--ksKeyPass', password
    )
  }

  try {
    const { stdout, stderr } = await execFileAsync(java, args, {
      timeout: 60000, // 60 second timeout
    })

    // uber-apk-signer outputs the signed APK with a modified filename
    // e.g., input "unsigned.apk" → output "unsigned-aligned-signed.apk"
    // We'll find the signed APK in the output directory
    const { readdir } = await import('node:fs/promises')
    const files = await readdir(outputDir)
    const signedApk = files.find(f => f.endsWith('-aligned-debugSigned.apk') || f.endsWith('-aligned-signed.apk'))

    if (!signedApk) {
      // Fallback: look for any APK
      const anyApk = files.find(f => f.endsWith('.apk'))
      if (anyApk) {
        return join(outputDir, anyApk)
      }
      throw new Error('Signing completed but no signed APK found in output')
    }

    return join(outputDir, signedApk)
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      throw new Error('Java not found during signing — ensure Java is installed and in PATH')
    }
    throw new Error(
      `APK signing failed: ${err.message}\n` +
      '  Make sure Java Runtime 8+ is installed.'
    )
  }
}
