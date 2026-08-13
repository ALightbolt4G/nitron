// injector.ts — Copy developer's web files into the APK assets/www/ directory
//
// v2.0 Architecture:
//   Assets are served via an HTTPS-like origin (appassets.androidplatform.net)
//   by shouldInterceptRequest() in MainActivity.java. This means:
//   - Absolute paths (/_next/, /assets/, /static/) work naturally
//   - No regex path-rewriting needed as primary solution
//   - Directory structure is preserved exactly as the framework outputs it
//
// Assets are placed in assets/www/ (not assets/ root) to keep the
// APK's asset namespace clean and match the URL path mapping.
//
// Excluded: app.js, nitron.config.json, package.json, node_modules/, dist/, .git/

import { readdir, copyFile, mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { join, dirname, basename } from 'node:path'
import type { NitronConfig } from './types.js'

/** Files and directories to exclude from injection */
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
 * Copy the developer's web assets into the APK's assets/www/ directory.
 *
 * Smart entry-point resolution:
 * - "index.html"       → copies project root to assets/www/
 * - "out/index.html"   → copies only out/ contents to assets/www/
 * - "dist/app.html"    → copies dist/ contents + creates redirect index.html
 *
 * @param config - The Nitron project configuration
 * @param projectDir - Developer's project directory
 * @param assetsDir - assets/www/ directory inside unpacked APK
 * @returns Number of files copied
 */
export async function injectAssets(config: NitronConfig, projectDir: string, assetsDir: string): Promise<number> {
  let count = 0
  const entryPath = (config.entry || 'index.html').replace(/\\/g, '/')
  const entryDir = dirname(entryPath)   // 'out' or '.'
  const entryFile = basename(entryPath) // 'index.html' or 'app.html'

  // Determine the source directory to copy from.
  // If entry is inside a subdirectory (e.g. out/index.html), copy
  // only that subdirectory's contents — NOT the whole project root.
  // This prevents bloat (copying src/, public/, etc.) and ensures
  // relative paths in framework builds work correctly.
  let sourceDir: string
  if (entryDir !== '.') {
    sourceDir = join(projectDir, entryDir)
    // Verify the entry directory actually exists
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

  // Ensure the target assets/www/ directory exists
  await mkdir(assetsDir, { recursive: true })

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
        // Copy all files as-is — no path rewriting needed.
        // The HTTPS-like origin (appassets.androidplatform.net) means
        // absolute paths resolve correctly within the WebView.
        await copyFile(srcPath, destPath)
        count++
      }
    }
  }

  await copyRecursive(sourceDir, assetsDir)

  // ─── Entry file redirect ───────────────────────────────────
  // The MainActivity always loads /index.html on the asset domain.
  // If the entry file has a different name (e.g. "app.html"), we
  // create a tiny index.html that instantly redirects to it.
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
    await writeFile(join(assetsDir, 'index.html'), redirectHtml)
    count++
  }

  return count
}
