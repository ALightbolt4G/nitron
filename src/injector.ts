// injector.ts — Copy developer's web files into the APK assets/ directory
//
// Copies the appropriate web assets from the developer's project into
// the unpacked APK's assets/ folder.
//
// Entry point resolution:
//   - If entry is "index.html" → copy entire project root to assets/
//   - If entry is "build/index.html" → copy contents of build/ to assets/
//   - If entry file is NOT "index.html" → create a redirect index.html
//
// Excluded: app.js, package.json, node_modules/, dist/, .git/

import { readdir, copyFile, mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { join, dirname, basename } from 'node:path'
import type { NitronConfig } from './types.js'

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
 * Smart entry-point resolution:
 * - "index.html"       → copies project root to assets/
 * - "build/index.html" → copies only build/ contents to assets/
 * - "dist/app.html"    → copies dist/ contents + creates redirect index.html
 *
 * @param config - The Nitron project configuration
 * @param projectDir - Developer's project directory
 * @param assetsDir - assets/ directory inside unpacked APK
 * @returns Number of files copied
 */
export async function injectAssets(config: NitronConfig, projectDir: string, assetsDir: string): Promise<number> {
  let count = 0
  const entryPath = (config.entry || 'index.html').replace(/\\/g, '/')
  const entryDir = dirname(entryPath)   // 'build' or '.'
  const entryFile = basename(entryPath) // 'index.html' or 'app.html'

  // Determine the source directory to copy from.
  // If entry is inside a subdirectory (e.g. build/index.html), copy
  // only that subdirectory's contents — NOT the whole project root.
  // This prevents bloat (copying src/, public/, etc.) and ensures
  // relative paths in framework builds (React, Vite, Next.js) work
  // because the build output lands at the root of assets/.
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
        if (entry.name.endsWith('.html')) {
          let html = await readFile(srcPath, 'utf-8')

          // ─── Fix absolute paths for Android WebView ───
          // Framework builds (React, Vue, Vite) use absolute paths like
          // src="/static/js/main.js". In Android WebView with file:// protocol,
          // "/" resolves to the filesystem root, NOT android_asset/.
          // Rewrite "/path" → "./path" so paths resolve relative to index.html.
          // Negative lookahead (?!//) avoids breaking protocol-relative URLs.
          html = html.replace(/(src|href|action)="\/(?!\/)/g, '$1="./')

          // Multi-page navigation support for WebView
          const navScript = `
<script>
  // Nitron Multi-Page Support
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a && a.href && (a.origin === window.location.origin || !a.href.startsWith('http'))) {
      e.preventDefault();
      window.location.href = a.href;
    }
  });
</script>`
          if (html.includes('</head>')) {
            html = html.replace('</head>', navScript + '\n</head>')
          } else {
            html += navScript
          }
          await writeFile(destPath, html)
        } else {
          await copyFile(srcPath, destPath)
        }
        count++
      }
    }
  }

  await copyRecursive(sourceDir, assetsDir)

  // ─── Entry file redirect ───────────────────────────────────
  // The Android Java WebView template always loads assets/index.html.
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
