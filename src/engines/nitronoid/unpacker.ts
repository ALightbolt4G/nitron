// unpacker.ts — Extract the base APK template into a temp directory
//
// The template is a zip file containing the pre-built WebView shell:
// classes.dex, resources, and folder structure.

import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import JSZip from 'jszip'

/**
 * Unpack the base APK template into a temporary build directory.
 *
 * @param templatePath - Path to the base.apk template file
 * @returns Path to the temp directory containing the unpacked APK
 */
export async function unpackTemplate(templatePath: string): Promise<string> {
  // Create unique temp directory
  const buildDir = join(tmpdir(), `nitron-build-${Date.now()}`)
  await mkdir(buildDir, { recursive: true })

  // Read and extract template
  const templateData = await readFile(templatePath)
  const zip = await JSZip.loadAsync(templateData)

  // Extract all files
  const entries = Object.entries(zip.files)
  for (const [path, file] of entries) {
    const outputPath = join(buildDir, path)

    if (file.dir) {
      await mkdir(outputPath, { recursive: true })
    } else {
      // Ensure parent directory exists
      const parentDir = join(outputPath, '..')
      await mkdir(parentDir, { recursive: true })

      const content = await file.async('nodebuffer')
      await writeFile(outputPath, content)
    }
  }

  // Ensure assets/ directory exists for injecting web files
  await mkdir(join(buildDir, 'assets'), { recursive: true })

  return buildDir
}
