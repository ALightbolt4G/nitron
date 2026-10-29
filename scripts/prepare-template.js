#!/usr/bin/env node
// prepare-template.js — Build template/base.apk (and the plugin API jar) from source
//
// Compiles the Java sources in template-src/base/ into classes.dex and packages
// it as the base APK template that Nitron ships with.
//
// Prerequisites:
//   - A JDK (javac). JDK 11+ is needed if the script has to use R8 as the dexer.
//   - Internet access on the first run, unless you point the flags below at local files.
//
// Usage:
//   node scripts/prepare-template.js [--android-jar <path>] [--r8-jar <path>] [--d8 <path>]
//
// How the tools are found:
//   android.jar : --android-jar, $ANDROID_JAR, ~/.nitron/android/android.jar (the same
//                 cache `nitron build` uses), $ANDROID_HOME/platforms/android-*/android.jar,
//                 otherwise downloaded from Google.
//   dexer       : --d8, a `d8` command (PATH or $ANDROID_HOME/build-tools/*), --r8-jar,
//                 build-tools/*/lib/d8.jar, otherwise R8 is downloaded from Google Maven.
//
// Output:
//   template/base.apk              classes.dex + assets/
//   template/nitron-plugin-api.jar the public plugin API (compile-time only, never dexed
//                                  into plugins — it already lives inside base.apk)

import { execFileSync } from 'node:child_process'
import {
  existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, createWriteStream,
} from 'node:fs'
import { join, resolve, dirname, relative, delimiter } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import https from 'node:https'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const SRC_DIR = join(ROOT, 'template-src', 'base')
const TEMPLATE_DIR = join(ROOT, 'template')
const BUILD_DIR = join(ROOT, '.template-build')
const CACHE_DIR = join(homedir(), '.nitron', 'android')

const MIN_API = 21
const R8_VERSION = '8.5.35'
const R8_URL = `https://dl.google.com/dl/android/maven2/com/android/tools/r8/${R8_VERSION}/r8-${R8_VERSION}.jar`
const PLATFORM_URL = 'https://dl.google.com/android/repository/platform-36_r01.zip'

/** Source files that make up the public plugin API (kept out of plugin dex files). */
const API_SOURCES = ['NitronPlugin.java', 'NitronMethod.java', 'PluginCall.java']

// ─── helpers ───────────────────────────────────────────────────────────────

function download(url, dest) {
  return new Promise((res, rej) => {
    https.get(url, (r) => {
      if ([301, 302, 307, 308].includes(r.statusCode)) {
        if (!r.headers.location) return rej(new Error('Redirect without location'))
        return download(r.headers.location, dest).then(res, rej)
      }
      if (r.statusCode !== 200) return rej(new Error(`Failed to download ${url}: HTTP ${r.statusCode}`))
      const f = createWriteStream(dest)
      r.pipe(f)
      f.on('finish', () => f.close(res))
      f.on('error', rej)
    }).on('error', rej)
  })
}

function walk(dir, ext, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, ext, out)
    else if (e.name.endsWith(ext)) out.push(p)
  }
  return out
}

function arg(name) {
  const i = process.argv.indexOf(name)
  return i !== -1 ? process.argv[i + 1] : null
}

function tryRun(cmd, args) {
  try {
    execFileSync(cmd, args, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function androidHomeBuildTools() {
  const home = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
  if (!home) return []
  const dir = join(home, 'build-tools')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    .map(v => join(dir, v))
}

// ─── android.jar ──────────────────────────────────────────────────────────

async function findAndroidJar() {
  const fromArg = arg('--android-jar') || process.env.ANDROID_JAR
  if (fromArg) return fromArg

  const cached = join(CACHE_DIR, 'android.jar')
  if (existsSync(cached)) return cached

  const home = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
  if (home && existsSync(join(home, 'platforms'))) {
    const platforms = readdirSync(join(home, 'platforms'))
      .filter(d => d.startsWith('android-') && existsSync(join(home, 'platforms', d, 'android.jar')))
      .sort((a, b) => parseInt(b.split('-')[1]) - parseInt(a.split('-')[1]))
    if (platforms.length) return join(home, 'platforms', platforms[0], 'android.jar')
  }

  console.log('android.jar not found locally — downloading the Android platform from Google...')
  mkdirSync(CACHE_DIR, { recursive: true })
  const zipPath = join(CACHE_DIR, 'platform.zip')
  await download(PLATFORM_URL, zipPath)
  const AdmZip = (await import('adm-zip')).default
  const zip = new AdmZip(zipPath)
  const entry = zip.getEntries().find(e => e.entryName.endsWith('android.jar'))
  if (!entry) throw new Error('android.jar not found inside the downloaded platform zip')
  zip.extractEntryTo(entry, CACHE_DIR, false, true)
  rmSync(zipPath, { force: true })
  return cached
}

// ─── dexer ─────────────────────────────────────────────────────────────────

async function findDexer() {
  const d8Arg = arg('--d8')
  if (d8Arg) return { kind: 'd8', cmd: d8Arg }

  // 1. A d8 launcher on PATH or inside an Android SDK
  const names = process.platform === 'win32' ? ['d8.bat', 'd8.cmd', 'd8.exe'] : ['d8']
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    for (const n of names) if (dir && existsSync(join(dir, n))) return { kind: 'd8', cmd: join(dir, n) }
  }
  for (const bt of androidHomeBuildTools()) {
    for (const n of names) if (existsSync(join(bt, n))) return { kind: 'd8', cmd: join(bt, n) }
  }

  // 2. R8 jar (it contains the D8 entry point)
  const r8Arg = arg('--r8-jar') || process.env.NITRON_R8_JAR
  if (r8Arg) return { kind: 'jar', jar: r8Arg }
  for (const bt of androidHomeBuildTools()) {
    const j = join(bt, 'lib', 'd8.jar')
    if (existsSync(j)) return { kind: 'jar', jar: j }
  }
  const cached = join(CACHE_DIR, `r8-${R8_VERSION}.jar`)
  if (existsSync(cached)) return { kind: 'jar', jar: cached }

  console.log(`Downloading R8 ${R8_VERSION} (dexer)...`)
  mkdirSync(CACHE_DIR, { recursive: true })
  await download(R8_URL, cached)
  return { kind: 'jar', jar: cached }
}

function dex(dexer, androidJar, classFiles, outDir) {
  const common = ['--release', '--min-api', String(MIN_API), '--lib', androidJar, '--output', outDir]
  if (dexer.kind === 'd8') {
    execFileSync(dexer.cmd, [...common, ...classFiles], { stdio: 'inherit' })
  } else {
    execFileSync('java', ['-cp', dexer.jar, 'com.android.tools.r8.D8', ...common, ...classFiles], { stdio: 'inherit' })
  }
}

// ─── main ──────────────────────────────────────────────────────────────────

const androidJar = await findAndroidJar()
if (!existsSync(androidJar)) {
  console.error(`Error: android.jar not found at ${androidJar}`)
  process.exit(1)
}
console.log(`Using android.jar: ${androidJar}`)

if (!tryRun('javac', ['-version'])) {
  console.error('Error: javac not found. Install a full JDK (https://adoptium.net/).')
  process.exit(1)
}

const sources = walk(SRC_DIR, '.java')
if (sources.length === 0) {
  console.error(`Error: no .java files found in ${relative(ROOT, SRC_DIR)}`)
  process.exit(1)
}

if (existsSync(BUILD_DIR)) rmSync(BUILD_DIR, { recursive: true })
const classesDir = join(BUILD_DIR, 'classes')
const dexDir = join(BUILD_DIR, 'dex')
mkdirSync(classesDir, { recursive: true })
mkdirSync(dexDir, { recursive: true })
mkdirSync(TEMPLATE_DIR, { recursive: true })

// Compile
console.log(`Compiling ${sources.length} Java file(s)...`)
const javacBase = ['-Xlint:-options', '-classpath', androidJar, '-d', classesDir, ...sources]
try {
  execFileSync('javac', ['--release', '8', ...javacBase], { stdio: 'inherit' })
} catch {
  // JDK 8 has no --release
  execFileSync('javac', ['-source', '8', '-target', '8', ...javacBase], { stdio: 'inherit' })
}
console.log('✓ Compiled')

// Dex
const classFiles = walk(classesDir, '.class')
const dexer = await findDexer()
console.log(`Converting to DEX (${dexer.kind === 'd8' ? dexer.cmd : 'R8 jar ' + dexer.jar})...`)
dex(dexer, androidJar, classFiles, dexDir)
if (!existsSync(join(dexDir, 'classes.dex'))) {
  console.error('Error: the dexer did not produce classes.dex')
  process.exit(1)
}
console.log('✓ Generated classes.dex')

// Package base.apk
const JSZip = (await import('jszip')).default
const apk = new JSZip()
apk.file('classes.dex', readFileSync(join(dexDir, 'classes.dex')))
apk.folder('assets')
const apkBuf = await apk.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
writeFileSync(join(TEMPLATE_DIR, 'base.apk'), apkBuf)
console.log(`✓ Created template/base.apk (${(apkBuf.length / 1024).toFixed(1)}KB)`)

// Package the plugin API jar (only if the API sources exist)
const apiPresent = API_SOURCES.every(f => existsSync(join(SRC_DIR, f)))
if (apiPresent) {
  const apiClassNames = new Set(API_SOURCES.map(f => f.replace(/\.java$/, '')))
  const jar = new JSZip()
  for (const file of walk(classesDir, '.class')) {
    const rel = relative(classesDir, file).split('\\').join('/')
    const simple = rel.split('/').pop().replace(/\.class$/, '').split('$')[0]
    if (apiClassNames.has(simple)) jar.file(rel, readFileSync(file))
  }
  const jarBuf = await jar.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  writeFileSync(join(TEMPLATE_DIR, 'nitron-plugin-api.jar'), jarBuf)
  console.log(`✓ Created template/nitron-plugin-api.jar (${(jarBuf.length / 1024).toFixed(1)}KB)`)
}

rmSync(BUILD_DIR, { recursive: true })
console.log('✓ Done')
