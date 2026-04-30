// builder.ts — Orchestrate the full APK build pipeline
//
// Pipeline: Read Config → Validate → Unpack → Inject → Manifest → Pack → Sign → Output
//
// This is the core of Nitron. Each step is a separate module,
// and builder.ts ties them together in sequence.

import { resolve, join } from 'node:path'
import { copyFile, rm, stat, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

import { unpackTemplate } from './unpacker.js'
import { injectAssets } from './injector.js'
import { generateManifest } from './manifest.js'
import { packApk } from './packer.js'
import { signApk } from './signer.js'
import { logger } from './logger.js'
import type { NitronConfig, BuildOptions, BuildResult } from './types.js'
import { writeFile } from 'node:fs/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const BUILD_STEPS = 8

/**
 * Get path to the base APK template bundled with Nitron.
 */
function getTemplatePath(): string {
  return join(__dirname, '..', 'template', 'base.apk')
}

/**
 * Format bytes into human-readable size.
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

/**
 * Format milliseconds into human-readable duration.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/**
 * Execute the full Nitron build pipeline.
 *
 * @param config - Validated NitronConfig
 * @param options - Build options (projectDir, outputDir, debug)
 * @returns BuildResult with success status, output path, duration, etc.
 */
export async function build(config: NitronConfig, options: BuildOptions): Promise<BuildResult> {
  const startTime = Date.now()
  const warnings: string[] = []
  let buildDir: string | null = null

  try {
    // ─── Step 1: Unpack Template ────────────────────────────
    logger.step(1, BUILD_STEPS, 'Unpacking template...')
    const templatePath = getTemplatePath()
    buildDir = await unpackTemplate(templatePath)

    if (options.debug) {
      logger.info(`Template unpacked to: ${buildDir}`)
    }

    // ─── Step 2: Inject Assets ──────────────────────────────
    logger.step(2, BUILD_STEPS, 'Injecting web assets...')
    const assetsDir = join(buildDir, 'assets')
    const fileCount = await injectAssets(options.projectDir, assetsDir)
    logger.success(`Injected ${fileCount} files`)

    // ─── Step 3: Generate Manifest ──────────────────────────
    logger.step(3, BUILD_STEPS, 'Generating AndroidManifest.xml...')
    const manifestBinary = generateManifest(config)
    const manifestPath = join(buildDir, 'AndroidManifest.xml')
    await writeFile(manifestPath, manifestBinary)

    if (options.debug) {
      logger.info(`Manifest size: ${formatSize(manifestBinary.length)}`)
    }

    // ─── Step 4: Pack APK ───────────────────────────────────
    logger.step(4, BUILD_STEPS, 'Packing APK...')
    const unsignedPath = join(options.outputDir, 'unsigned.apk')
    await packApk(buildDir, unsignedPath)

    // ─── Step 5: Sign APK ───────────────────────────────────
    logger.step(5, BUILD_STEPS, 'Signing APK...')
    const signedDir = join(options.outputDir, '.signing-temp')
    const signedApkPath = await signApk(unsignedPath, signedDir)

    // ─── Step 6: Move to final output ───────────────────────
    logger.step(6, BUILD_STEPS, 'Finalizing...')
    const finalPath = join(options.outputDir, 'app.apk')
    await copyFile(signedApkPath, finalPath)

    // ─── Step 7: Get file size ──────────────────────────────
    logger.step(7, BUILD_STEPS, 'Verifying output...')
    const apkStat = await stat(finalPath)

    // ─── Step 8: Cleanup ────────────────────────────────────
    logger.step(8, BUILD_STEPS, 'Cleaning up...')

    // Clean up temp files
    await rm(unsignedPath, { force: true })
    await rm(signedDir, { recursive: true, force: true })
    if (buildDir) {
      await rm(buildDir, { recursive: true, force: true })
      buildDir = null
    }

    const duration = Date.now() - startTime
    logger.summary(finalPath, formatSize(apkStat.size), formatDuration(duration))

    return {
      success: true,
      outputPath: finalPath,
      duration,
      errors: [],
      warnings,
    }
  } catch (err: any) {
    // Cleanup on failure
    if (buildDir) {
      try { await rm(buildDir, { recursive: true, force: true }) } catch {}
    }

    return {
      success: false,
      outputPath: null,
      duration: Date.now() - startTime,
      errors: [err.message],
      warnings,
    }
  }
}
