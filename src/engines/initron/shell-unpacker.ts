// engines/initron/shell-unpacker.ts — Extract the .app shell template into a temp dir
//
// The shell template ships as a zip containing a single top-level
// NitronShell-*.app directory (produced by the one-time GitHub Actions
// build — see .github/workflows/build-shell-template.yml). This just
// extracts it and returns the path to that .app directory so the rest
// of the pipeline can inject into and sign it directly.

import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import JSZip from 'jszip'

/**
 * Unpack a shell .app template zip into a fresh temp build directory.
 *
 * @param templateZipPath - Path to shell-device.zip or shell-simulator.zip
 * @returns Absolute path to the extracted NitronShell*.app directory
 */
export async function unpackShellTemplate(templateZipPath: string): Promise<string> {
  const buildDir = join(tmpdir(), `nitron-ios-build-${Date.now()}`)
  await mkdir(buildDir, { recursive: true })

  const templateData = await readFile(templateZipPath)
  const zip = await JSZip.loadAsync(templateData)

  let appDirName: string | null = null

  for (const [path, file] of Object.entries(zip.files)) {
    const outputPath = join(buildDir, path)

    // Track the top-level .app directory name so we can hand its full
    // path back to the caller.
    const topLevel = path.split('/')[0]
    if (topLevel.endsWith('.app')) {
      appDirName = topLevel
    }

    if (file.dir) {
      await mkdir(outputPath, { recursive: true })
    } else {
      await mkdir(join(outputPath, '..'), { recursive: true })
      const content = await file.async('nodebuffer')
      await writeFile(outputPath, content)
    }
  }

  if (!appDirName) {
    throw new Error(
      `Shell template at ${templateZipPath} does not contain a .app directory.\n` +
      `Hint: re-run the "Build Nitron iOS Shell Template" GitHub Action and re-download the artifact.`
    )
  }

  return join(buildDir, appDirName)
}
