// packer.ts — Repack the modified directory into an APK (zip) file
//
// APK files are zip archives with specific compression requirements:
// - resources.arsc: STORED (no compression)
// - classes.dex: DEFLATED
// - AndroidManifest.xml: STORED
// - Everything else: DEFLATED
//
// Note: zipalign is handled separately (uber-apk-signer can do it).

import { readdir, readFile, stat, mkdir } from 'node:fs/promises'
import { join, relative, extname } from 'node:path'
import { writeFile } from 'node:fs/promises'
import JSZip from 'jszip'

/** Files that should be stored without compression in the APK */
const STORE_FILES = new Set([
  'resources.arsc',
  'AndroidManifest.xml',
])

/** File extensions that should be stored without compression */
const STORE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.mp4',
  '.mp3',
  '.ogg',
  '.wav',
  '.arsc',
])

/**
 * Pack the build directory into an APK file.
 *
 * @param buildDir - Directory containing the unpacked/modified APK contents
 * @param outputPath - Where to write the final APK file
 */
export async function packApk(buildDir: string, outputPath: string): Promise<void> {
  const zip = new JSZip()

  // Recursively add all files from buildDir
  await addDirToZip(zip, buildDir, '')

  // Generate the zip buffer
  const content = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  })

  // Ensure output directory exists
  const outputDir = join(outputPath, '..')
  await mkdir(outputDir, { recursive: true })

  await writeFile(outputPath, content)
}

async function addDirToZip(zip: JSZip, baseDir: string, zipPath: string): Promise<void> {
  const entries = await readdir(baseDir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(baseDir, entry.name)
    const entryZipPath = zipPath ? `${zipPath}/${entry.name}` : entry.name

    // Skip META-INF (old signatures)
    if (entry.name === 'META-INF') continue

    if (entry.isDirectory()) {
      await addDirToZip(zip, fullPath, entryZipPath)
    } else if (entry.isFile()) {
      const data = await readFile(fullPath)
      const shouldStore = STORE_FILES.has(entry.name) ||
        STORE_EXTENSIONS.has(extname(entry.name).toLowerCase())

      zip.file(entryZipPath, data, {
        compression: shouldStore ? 'STORE' : 'DEFLATE',
        compressionOptions: shouldStore ? undefined : { level: 9 },
      })
    }
  }
}
