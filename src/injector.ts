// injector.ts — Copy developer's web files into the APK assets/ directory
//
// Copies all HTML, CSS, JS, images, fonts, and other assets from the
// developer's project into the unpacked APK's assets/ folder.
// Excluded: app.js, package.json, node_modules/, dist/, .git/

import { readdir, stat, copyFile, mkdir } from 'node:fs/promises'
import { join, relative } from 'node:path'

/** Files and directories to exclude from injection */
const EXCLUDED = new Set([
  'app.js',
  'package.json',
  'package-lock.json',
  'node_modules',
  'dist',
  '.git',
  '.gitignore',
  '.DS_Store',
  'Thumbs.db',
])

/**
 * Copy the developer's web assets into the APK's assets/ directory.
 *
 * @param projectDir - Developer's project directory
 * @param assetsDir - assets/ directory inside unpacked APK
 * @returns Number of files copied
 */
export async function injectAssets(projectDir: string, assetsDir: string): Promise<number> {
  let count = 0

  async function copyRecursive(srcDir: string, destDir: string): Promise<void> {
    const entries = await readdir(srcDir, { withFileTypes: true })

    for (const entry of entries) {
      // Skip excluded files/directories
      if (EXCLUDED.has(entry.name)) continue

      const srcPath = join(srcDir, entry.name)
      const destPath = join(destDir, entry.name)

      if (entry.isDirectory()) {
        await mkdir(destPath, { recursive: true })
        await copyRecursive(srcPath, destPath)
      } else if (entry.isFile()) {
        await copyFile(srcPath, destPath)
        count++
      }
    }
  }

  await copyRecursive(projectDir, assetsDir)
  return count
}
