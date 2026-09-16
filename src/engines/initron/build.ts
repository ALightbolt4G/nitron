// engines/initron/build.ts — Orchestrate the full iOS build pipeline
//
// Two distinct outputs, both from the exact same app.js config:
//
//   --target ios-simulator   → unsigned NitronShell.app, zipped.
//                              No Apple Developer account needed at all —
//                              the iOS Simulator does not require code
//                              signing. This is the fast path for local
//                              testing (`open -a Simulator`, drag the .app
//                              in, or `xcrun simctl install`).
//
//   --target ios             → signed .ipa for a real device, using zsign
//                              (see signer.ts). Requires Apple Developer
//                              credentials — read from environment
//                              variables (NITRON_IOS_P12_PATH,
//                              NITRON_IOS_P12_PASSWORD,
//                              NITRON_IOS_PROVISION_PATH), same pattern as
//                              any CI/CD secret. This is an Apple platform
//                              requirement, not a Nitron limitation.

import { join, dirname } from 'node:path'
import { rm, mkdir, cp } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { readFile, writeFile, readdir, stat } from 'node:fs/promises'

import { unpackShellTemplate } from './shell-unpacker.js'
import { injectShellAssets } from './injector.js'
import { patchInfoPlist } from './plist.js'
import { generateIOSIcon } from './icon.js'
import { signApp, adHocSignApp } from './signer.js'
import { logger } from '../../logger.js'
import type { NitronConfig, BuildOptions } from '../../types.js'
import type { EngineBuildResult } from '../../core/engine.interface.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const BUILD_STEPS = 7

function getShellTemplatePath(variant: 'device' | 'simulator'): string {
  return join(__dirname, '..', 'template', 'shell', `shell-${variant}.zip`)
}

/** Recursively zip a directory (the .app bundle) into a single .zip file. */
async function zipDirectory(sourceDir: string, outputZipPath: string, rootName: string): Promise<void> {
  const zip = new JSZip()

  async function addDir(dir: string, zipFolder: JSZip): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        await addDir(fullPath, zipFolder.folder(entry.name)!)
      } else {
        const content = await readFile(fullPath)
        zipFolder.file(entry.name, content)
      }
    }
  }

  await addDir(sourceDir, zip.folder(rootName)!)
  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  await writeFile(outputZipPath, buffer)
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export async function build(
  config: NitronConfig,
  options: BuildOptions & { simulator?: boolean }
): Promise<EngineBuildResult> {
  const startTime = Date.now()
  const warnings: string[] = []
  let buildDir: string | null = null
  const isSimulator = options.target === 'ios-simulator' || options.simulator

  try {
    // ─── Step 1: Locate shell template ──────────────────────
    logger.step(1, BUILD_STEPS, 'Locating shell template...')
    const variant = isSimulator ? 'simulator' : 'device'
    const templatePath = getShellTemplatePath(variant)
    try {
      await stat(templatePath)
    } catch {
      throw new Error(
        `Shell template not found at ${templatePath}\n\n` +
        `The iOS shell must be built once via GitHub Actions (macOS is required\n` +
        `for this one-time step — Nitron cannot build it on your machine).\n` +
        `See: .github/workflows/build-shell-template.yml — run it manually,\n` +
        `download the "nitron-ios-shell-templates" artifact, and place\n` +
        `shell-${variant}.zip in template/shell/`
      )
    }

    // ─── Step 2: Unpack shell ────────────────────────────────
    logger.step(2, BUILD_STEPS, 'Unpacking iOS shell...')
    const appPath = await unpackShellTemplate(templatePath)
    buildDir = dirname(appPath)

    // ─── Step 3: Inject web assets ───────────────────────────
    logger.step(3, BUILD_STEPS, 'Injecting web assets...')
    const wwwDir = join(appPath, 'www')
    const fileCount = await injectShellAssets(config, options.projectDir, wwwDir)
    logger.success(`Injected ${fileCount} files`)

    // ─── Step 4: Generate icon ────────────────────────────────
    logger.step(4, BUILD_STEPS, 'Generating app icon...')
    const iconResult = await generateIOSIcon(config.icon, options.projectDir, appPath)

    // ─── Step 5: Patch Info.plist ────────────────────────────
    logger.step(5, BUILD_STEPS, 'Patching Info.plist...')
    await patchInfoPlist(join(appPath, 'Info.plist'), config, iconResult.iconBaseName)

    // ─── Step 6: Pack + sign ──────────────────────────────────
    await mkdir(options.outputDir, { recursive: true })
    let outputPath: string

    if (isSimulator) {
      logger.step(6, BUILD_STEPS, 'Packaging Simulator .app...')
      outputPath = join(options.outputDir, 'app-simulator.app.zip')
      await zipDirectory(appPath, outputPath, 'NitronShell.app')
      warnings.push(
        'Simulator build is unsigned by design (the iOS Simulator does not ' +
        'require code signing). It will NOT install on a real device — use ' +
        '`nitron build --target ios` with Apple Developer credentials for that.'
      )
    } else {
      logger.step(6, BUILD_STEPS, 'Signing for real device...')
      outputPath = join(options.outputDir, 'app.ipa')

      const p12Path = process.env.NITRON_IOS_P12_PATH
      const p12Password = process.env.NITRON_IOS_P12_PASSWORD
      const provisionPath = process.env.NITRON_IOS_PROVISION_PATH

      if (p12Path && p12Password && provisionPath) {
        await signApp(appPath, outputPath, config, {
          p12Path,
          p12Password,
          provisioningProfilePath: provisionPath,
        })
      } else {
        logger.warn(
          'No Apple Developer credentials found (NITRON_IOS_P12_PATH / ' +
          'NITRON_IOS_P12_PASSWORD / NITRON_IOS_PROVISION_PATH) — falling ' +
          'back to ad-hoc signing. This IPA will only install via ' +
          'sideloading tools, not a real Apple-trusted install.'
        )
        await adHocSignApp(appPath, outputPath)
        warnings.push('Ad-hoc signed — set Apple Developer credentials for a real-device-installable IPA.')
      }
    }

    // ─── Step 6: Verify + cleanup ─────────────────────────────
    logger.step(7, BUILD_STEPS, 'Finalizing...')
    const outStat = await stat(outputPath)

    if (buildDir) {
      await rm(buildDir, { recursive: true, force: true })
      buildDir = null
    }

    const duration = Date.now() - startTime
    logger.summary(outputPath, formatSize(outStat.size), formatDuration(duration))

    return {
      success: true,
      outputPath,
      duration,
      errors: [],
      warnings,
      artifactExtension: isSimulator ? 'app.zip' : 'ipa',
    }
  } catch (err: any) {
    if (buildDir) {
      try { await rm(buildDir, { recursive: true, force: true }) } catch {}
    }
    return {
      success: false,
      outputPath: null,
      duration: Date.now() - startTime,
      errors: [err.message],
      warnings,
      artifactExtension: isSimulator ? 'app.zip' : 'ipa',
    }
  }
}
