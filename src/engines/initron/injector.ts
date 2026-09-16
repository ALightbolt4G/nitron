// engines/initron/injector.ts — Copy developer's web files into NitronShell.app/www/
//
// Mirrors engines/nitronoid/injector.ts exactly in spirit: same entry-point
// resolution rules, same exclusion list, same redirect-file trick for a
// non-standard entry filename. The destination differs (an .app bundle
// directory instead of an unpacked APK's assets/ folder) but the developer-
// facing behavior is identical across both platforms, by design.

import { readdir, copyFile, mkdir, writeFile, access } from 'node:fs/promises'
import { join, dirname, basename, relative } from 'node:path'
import type { NitronConfig } from '../../types.js'

const EXCLUDED = new Set([
  'app.js',
  'nitron.config.json',
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
 * Copy the developer's web assets into NitronShell.app/www/.
 *
 * @param config - The Nitron project configuration
 * @param projectDir - Developer's project directory
 * @param wwwDir - The www/ directory inside the unpacked .app bundle
 * @returns Number of files copied
 */
export async function injectShellAssets(config: NitronConfig, projectDir: string, wwwDir: string): Promise<number> {
  let count = 0
  const entryPath = (config.entry || 'index.html').replace(/\\/g, '/')
  const entryDir = dirname(entryPath)
  const entryFile = basename(entryPath)

  let sourceDir: string
  if (entryDir !== '.') {
    sourceDir = join(projectDir, entryDir)
    try {
      await access(sourceDir)
    } catch {
      throw new Error(
        `Entry directory "${entryDir}" not found in project.\n` +
        `Expected: ${sourceDir}\n` +
        `Hint: Did you run your framework's build command first? (e.g. npm run build)`
      )
    }
  } else {
    sourceDir = projectDir
  }

  const customExcludes = config.exclude || []
  const excludeRegexes = customExcludes.map(pattern => {
    let regexStr = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    regexStr = regexStr.replace(/\*/g, '.*').replace(/\?/g, '.')
    return new RegExp(`^${regexStr}$`)
  })

  await mkdir(wwwDir, { recursive: true })

  async function copyRecursive(srcDir: string, destDir: string): Promise<void> {
    const entries = await readdir(srcDir, { withFileTypes: true })
    for (const entry of entries) {
      if (EXCLUDED.has(entry.name)) continue
      const srcPath = join(srcDir, entry.name)
      const destPath = join(destDir, entry.name)

      const relPath = relative(sourceDir, srcPath).replace(/\\/g, '/')
      if (excludeRegexes.some(r => r.test(entry.name) || r.test(relPath))) {
        continue
      }

      if (entry.isDirectory()) {
        await mkdir(destPath, { recursive: true })
        await copyRecursive(srcPath, destPath)
      } else if (entry.isFile()) {
        await copyFile(srcPath, destPath)
        count++
      }
    }
  }

  await copyRecursive(sourceDir, wwwDir)

  // Entry file redirect — WKWebView shell always loads www/index.html
  if (entryFile !== 'index.html') {
    const redirectHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Loading...</title>
  <script>window.location.replace("./${entryFile}");</script>
</head>
<body></body>
</html>`
    await writeFile(join(wwwDir, 'index.html'), redirectHtml)
    count++
  }

  return count
}
