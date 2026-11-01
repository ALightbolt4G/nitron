#!/usr/bin/env node
// test-plugin-runtime.js — Run the plugin runtime tests (no Android device needed)
//
//   1. compiles the plugin runtime Java classes and their tests on a normal JVM
//   2. runs the Java tests (registration, dispatch, errors, threading)
//   3. runs the generated JavaScript runtime in Node against a fake bridge
//
// Needs: a JDK, Node.js, android.jar (found like prepare-template.js does) and an
// org.json implementation (set ORG_JSON_JAR, or it is downloaded from Maven Central).
//
// Usage: node scripts/test-plugin-runtime.js [--android-jar <path>]

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync, readdirSync, createWriteStream } from 'node:fs'
import { join, resolve, dirname, delimiter } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir, tmpdir } from 'node:os'
import https from 'node:https'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(homedir(), '.nitron', 'android')
const OUT = join(tmpdir(), `nitron-plugin-test-${process.pid}`)
const JSON_URL = 'https://repo1.maven.org/maven2/org/json/json/20240303/json-20240303.jar'

function arg(name) { const i = process.argv.indexOf(name); return i !== -1 ? process.argv[i + 1] : null }

function download(url, dest) {
  return new Promise((res, rej) => {
    https.get(url, r => {
      if ([301, 302, 307, 308].includes(r.statusCode) && r.headers.location) return download(r.headers.location, dest).then(res, rej)
      if (r.statusCode !== 200) return rej(new Error(`HTTP ${r.statusCode} for ${url}`))
      const f = createWriteStream(dest); r.pipe(f); f.on('finish', () => f.close(res)); f.on('error', rej)
    }).on('error', rej)
  })
}

function walk(dir, ext, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, ext, out); else if (e.name.endsWith(ext)) out.push(p)
  }
  return out
}

function findAndroidJar() {
  const explicit = arg('--android-jar') || process.env.ANDROID_JAR
  if (explicit) return explicit
  if (existsSync(join(CACHE, 'android.jar'))) return join(CACHE, 'android.jar')
  const home = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
  if (home && existsSync(join(home, 'platforms'))) {
    const platforms = readdirSync(join(home, 'platforms'))
      .filter(d => d.startsWith('android-') && existsSync(join(home, 'platforms', d, 'android.jar')))
      .sort((a, b) => parseInt(b.split('-')[1]) - parseInt(a.split('-')[1]))
    if (platforms.length) return join(home, 'platforms', platforms[0], 'android.jar')
  }
  return join(CACHE, 'android.jar')
}
const androidJar = findAndroidJar()
if (!existsSync(androidJar)) {
  console.error(`android.jar not found at ${androidJar}.\nRun "node scripts/prepare-template.js" once (it downloads it), or pass --android-jar.`)
  process.exit(1)
}

let jsonJar = process.env.ORG_JSON_JAR
if (!jsonJar) {
  for (const c of ['/usr/share/java/json-android.jar', join(CACHE, 'org-json.jar')]) if (existsSync(c)) { jsonJar = c; break }
}
if (!jsonJar) {
  mkdirSync(CACHE, { recursive: true })
  jsonJar = join(CACHE, 'org-json.jar')
  console.log('Downloading org.json (test only)...')
  await download(JSON_URL, jsonJar)
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

// org.json first: android.jar only contains stubs that throw "Stub!"
const cp = [jsonJar, androidJar].join(delimiter)
const sources = [
  ...walk(join(ROOT, 'template-src', 'base'), '.java').filter(f => !f.endsWith('MainActivity.java')),
  ...walk(join(ROOT, 'test', 'plugin-runtime'), '.java'),
]
console.log('Compiling...')
execFileSync('javac', ['-Xlint:-options', '-encoding', 'UTF-8', '-cp', cp, '-d', OUT, ...sources], { stdio: 'inherit' })

let failed = false

console.log('\n== Java: plugin dispatcher ==')
if (spawnSync('java', ['-cp', [OUT, cp].join(delimiter), 'com.nicron.webview.PluginDispatcherTest'], { stdio: 'inherit' }).status !== 0) failed = true

console.log('\n== JavaScript: generated runtime ==')
const dump = spawnSync('java', ['-cp', [OUT, cp].join(delimiter), 'com.nicron.webview.RuntimeScriptDump'], { encoding: 'utf-8' })
if (dump.status !== 0) { console.error(dump.stderr); failed = true }
else {
  const scriptPath = join(OUT, 'runtime.js')
  writeFileSync(scriptPath, dump.stdout)
  if (spawnSync(process.execPath, [join(ROOT, 'test', 'plugin-runtime', 'runtime-script.test.mjs'), scriptPath], { stdio: 'inherit' }).status !== 0) failed = true
}

rmSync(OUT, { recursive: true, force: true })
console.log(failed ? '\nFAILED' : '\nAll plugin runtime tests passed')
process.exit(failed ? 1 : 0)
