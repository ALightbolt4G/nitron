#!/usr/bin/env node
// prepare-template.js — Build the base.apk template from source
//
// This script compiles the WebView activity into classes.dex and packages
// it as the base APK template that Nitron ships with.
//
// Prerequisites:
//   - JDK 8+ (javac)
//   - Android SDK Build Tools (d8)
//   - Android SDK Platform (android.jar)
//
// Usage:
//   node scripts/prepare-template.js [--android-jar <path>]
//
// The script will:
//   1. Compile MainActivity.java → .class files
//   2. Convert .class files → classes.dex using d8
//   3. Package classes.dex into template/base.apk (zip)

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')

const SRC_DIR = join(ROOT, 'template-src')
const TEMPLATE_DIR = join(ROOT, 'template')
const BUILD_DIR = join(ROOT, '.template-build')
const JAVA_FILE = join(SRC_DIR, 'MainActivity.java')

// Parse args
const args = process.argv.slice(2)
let androidJarPath = null
const jarIdx = args.indexOf('--android-jar')
if (jarIdx !== -1 && args[jarIdx + 1]) {
  androidJarPath = args[jarIdx + 1]
}

// Auto-detect android.jar
if (!androidJarPath) {
  const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
  if (androidHome) {
    // Find highest API level
    const platformsDir = join(androidHome, 'platforms')
    if (existsSync(platformsDir)) {
      const { readdirSync } = await import('node:fs')
      const platforms = readdirSync(platformsDir)
        .filter(d => d.startsWith('android-'))
        .sort((a, b) => {
          const numA = parseInt(a.split('-')[1])
          const numB = parseInt(b.split('-')[1])
          return numB - numA
        })
      if (platforms.length > 0) {
        androidJarPath = join(platformsDir, platforms[0], 'android.jar')
      }
    }
  }
}

if (!androidJarPath || !existsSync(androidJarPath)) {
  console.error('Error: Cannot find android.jar')
  console.error('Set ANDROID_HOME or pass --android-jar <path>')
  process.exit(1)
}

console.log(`Using android.jar: ${androidJarPath}`)

// Step 1: Clean and create build directory
if (existsSync(BUILD_DIR)) rmSync(BUILD_DIR, { recursive: true })
mkdirSync(BUILD_DIR, { recursive: true })
mkdirSync(TEMPLATE_DIR, { recursive: true })

// Step 2: Compile Java → .class
console.log('Compiling MainActivity.java...')
execSync(`javac -source 8 -target 8 -classpath "${androidJarPath}" -d "${BUILD_DIR}" "${JAVA_FILE}"`, {
  stdio: 'inherit'
})
console.log('✓ Compiled to .class files')

// Step 3: Convert .class → classes.dex using d8
console.log('Converting to DEX...')
const classFile = join(BUILD_DIR, 'com', 'nicron', 'webview', 'MainActivity.class')
execSync(`d8 --lib "${androidJarPath}" --output "${BUILD_DIR}" "${classFile}"`, {
  stdio: 'inherit'
})
console.log('✓ Generated classes.dex')

// Step 4: Create base.apk (just a zip with classes.dex)
console.log('Packaging base.apk...')
const JSZip = (await import('jszip')).default
const zip = new JSZip()

// Add classes.dex
const dexPath = join(BUILD_DIR, 'classes.dex')
zip.file('classes.dex', readFileSync(dexPath))

// Add empty assets directory marker
zip.folder('assets')

// Generate zip
const content = await zip.generateAsync({ type: 'nodebuffer' })
writeFileSync(join(TEMPLATE_DIR, 'base.apk'), content)
console.log(`✓ Created template/base.apk (${(content.length / 1024).toFixed(1)}KB)`)

// Cleanup
rmSync(BUILD_DIR, { recursive: true })
console.log('✓ Done')
