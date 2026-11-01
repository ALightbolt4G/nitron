// plugins.ts — Compile Java plugins and add them to the app
//
// What happens for an app that lists plugins in nitron.config.json:
//   1. every entry (a .java file or a directory) is compiled with javac against
//      android.jar and the Nitron plugin API (compile-time only);
//   2. the compiled classes are inspected: each concrete subclass of NitronPlugin
//      becomes one plugin (checked: public, public no-argument constructor);
//   3. all classes are converted to DEX with D8 and added to the app as
//      classes2.dex, classes3.dex, ... (Android 5+ loads secondary dex files natively);
//   4. assets/nitron-plugins.json lists the plugins so the runtime can create them.
//
// Failure policy (config.onPluginError):
//   'error' (default) - stop the build with a clear message;
//   'warn'            - leave the failing plugin out and print a warning.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync,
  renameSync, rmSync, createWriteStream,
} from 'node:fs'
import { join, resolve, relative, delimiter, dirname } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import https from 'node:https'

import { ensureAndroidJar } from './aapt2-resource-builder.js'
import { parseClassFile, ClassFileError, type ClassInfo } from './classfile.js'
import { logger } from '../../logger.js'
import type { NitronConfig } from '../../types.js'

const execFileAsync = promisify(execFile)

export const PLUGIN_BASE_CLASS = 'com/nicron/webview/NitronPlugin'
export const PLUGIN_REGISTRY_FILE = 'nitron-plugins.json'
export const MAX_PLUGINS = 32

const R8_VERSION = '8.5.35'
const R8_URL = `https://dl.google.com/dl/android/maven2/com/android/tools/r8/${R8_VERSION}/r8-${R8_VERSION}.jar`
const CACHE_DIR = join(homedir(), '.nitron', 'android')

const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/
const RESERVED_NAMES = new Set(['__proto__', 'constructor', 'prototype', 'hasOwnProperty', 'toString', 'valueOf'])

export interface PluginEntry {
  /** Name used from JavaScript: Nitron.plugins.<name> */
  name: string
  /** Fully qualified Java class name, e.g. com.example.BatteryPlugin */
  className: string
  /** The config entry it came from */
  source: string
}

export interface PluginBuildResult {
  plugins: PluginEntry[]
  skipped: { source: string; reason: string }[]
  /** DEX file names added to the build directory, e.g. ["classes2.dex"] */
  dexFiles: string[]
}

/** A plugin problem that should be shown to the developer as-is (no stack trace). */
export class PluginBuildError extends Error {}

interface Unit {
  source: string
  sources: string[]
  classesDir: string
  classFiles: string[]
  plugins: PluginEntry[]
}

interface BuildPluginsOptions {
  config: NitronConfig
  projectDir: string
  buildDir: string
  /** Path to template/base.apk (the plugin API jar lives next to it) */
  templatePath: string
  minSdk: number
  debug: boolean
}

// ─── Public entry point ──────────────────────────────────────────────────────

/**
 * Build all plugins listed in the config and add them to buildDir.
 * Returns null when the app has no plugins.
 */
export async function buildPlugins(opts: BuildPluginsOptions): Promise<PluginBuildResult | null> {
  const entries = (opts.config.plugins ?? []).filter(e => typeof e === 'string' && e.trim() !== '')
  if (entries.length === 0) return null

  const policy = opts.config.onPluginError === 'warn' ? 'warn' : 'error'
  const skipped: { source: string; reason: string }[] = []
  const workDir = join(opts.buildDir, '.plugins')
  mkdirSync(workDir, { recursive: true })

  /** Apply the failure policy to one problem. */
  const fail = (source: string, reason: string): void => {
    if (policy === 'error') throw new PluginBuildError(`Plugin "${source}": ${reason}`)
    skipped.push({ source, reason })
  }

  // Prerequisites shared by all plugins
  let tools: Tools
  try {
    tools = await prepareTools(opts)
  } catch (err) {
    const reason = (err as Error).message
    if (policy === 'error') throw new PluginBuildError(reason)
    for (const e of entries) skipped.push({ source: e, reason })
    return finish(opts, [], skipped, [], workDir)
  }

  // 1. Compile every entry
  const units: Unit[] = []
  const usedNames = new Map<string, string>()
  for (let i = 0; i < entries.length; i++) {
    const source = entries[i]
    try {
      const unit = await compileUnit(source, i, workDir, tools, opts)
      for (const p of unit.plugins) {
        const other = usedNames.get(p.name)
        if (other) {
          throw new PluginBuildError(
            `the JavaScript name "${p.name}" (class ${p.className}) is already used by "${other}". ` +
            `Rename one of the classes.`
          )
        }
      }
      for (const p of unit.plugins) usedNames.set(p.name, source)
      units.push(unit)
    } catch (err) {
      if (!(err instanceof PluginBuildError)) throw err
      fail(source, stripPrefix(err.message))
    }
  }

  const totalPlugins = units.reduce((n, u) => n + u.plugins.length, 0)
  if (totalPlugins > MAX_PLUGINS) {
    const msg = `too many plugins (${totalPlugins}); the maximum is ${MAX_PLUGINS}`
    if (policy === 'error') throw new PluginBuildError(msg)
    for (const u of units) skipped.push({ source: u.source, reason: msg })
    return finish(opts, [], skipped, [], workDir)
  }

  // 2. Convert to DEX
  const dexFiles: string[] = []
  let built: Unit[] = units
  if (units.length > 0) {
    try {
      dexFiles.push(...await dexUnits(units, tools, opts, workDir))
    } catch (err) {
      if (!(err instanceof PluginBuildError)) throw err
      if (policy === 'error') throw err
      // Find out which plugin(s) break the dex step and keep the rest
      built = []
      for (const u of units) {
        try {
          dexFiles.push(...await dexUnits([u], tools, opts, workDir, true))
          built.push(u)
        } catch (e2) {
          if (!(e2 instanceof PluginBuildError)) throw e2
          skipped.push({ source: u.source, reason: stripPrefix(e2.message) })
        }
      }
    }
  }

  return finish(opts, built, skipped, dexFiles, workDir)
}

// ─── Result handling ─────────────────────────────────────────────────────────

function finish(
  opts: BuildPluginsOptions,
  built: Unit[],
  skipped: { source: string; reason: string }[],
  dexFiles: string[],
  workDir: string,
): PluginBuildResult {
  const plugins = built.flatMap(u => u.plugins)

  if (plugins.length > 0) {
    const assetsDir = join(opts.buildDir, 'assets')
    mkdirSync(assetsDir, { recursive: true })
    const registry = {
      version: 1,
      plugins: plugins.map(p => ({ name: p.name, class: p.className })),
    }
    writeFileSync(join(assetsDir, PLUGIN_REGISTRY_FILE), JSON.stringify(registry, null, 2))
  }

  try { rmSync(workDir, { recursive: true, force: true }) } catch { /* ignore */ }

  for (const s of skipped) {
    logger.warn(`Plugin ${s.source} was skipped: ${s.reason}`)
  }
  if (skipped.length > 0) {
    logger.warn(
      `The app is being built WITHOUT ${skipped.length === 1 ? 'this plugin' : 'these plugins'}. ` +
      `JavaScript that calls ${skipped.length === 1 ? 'it' : 'them'} will fail. ` +
      `Set "onPluginError": "error" to stop the build instead.`
    )
  }
  return { plugins, skipped, dexFiles }
}

function stripPrefix(message: string): string {
  return message.replace(/^Plugin "[^"]*": /, '')
}

// ─── Tools ───────────────────────────────────────────────────────────────────

interface Tools {
  androidJar: string
  apiJar: string
  javacMajor: number
  dexer: Dexer
}

type Dexer = { kind: 'launcher'; cmd: string } | { kind: 'jar'; jar: string }

async function prepareTools(opts: BuildPluginsOptions): Promise<Tools> {
  if (opts.minSdk < 21) {
    throw new PluginBuildError(
      `plugins need minSdk 21 or higher (Android 5.0 loads the extra dex file natively); your minSdk is ${opts.minSdk}`
    )
  }

  const apiJar = join(dirname(opts.templatePath), 'nitron-plugin-api.jar')
  if (!existsSync(apiJar)) {
    throw new PluginBuildError(
      `template/nitron-plugin-api.jar is missing. Rebuild the template with "node scripts/prepare-template.js" ` +
      `(or reinstall nitron).`
    )
  }

  // A template built before plugins existed would silently ignore them at runtime
  try {
    const dex = readFileSync(join(opts.buildDir, 'classes.dex'))
    if (!dex.includes('Lcom/nicron/webview/PluginDispatcher;')) {
      throw new PluginBuildError(
        'this Nitron template was built without plugin support. Rebuild it with "node scripts/prepare-template.js" (or update nitron).'
      )
    }
  } catch (err) {
    if (err instanceof PluginBuildError) throw err
  }

  const javacMajor = await getJavacMajor()
  const androidJar = await ensureAndroidJar()
  const dexer = await findDexer(javacMajor)
  return { androidJar, apiJar, javacMajor, dexer }
}

async function getJavacMajor(): Promise<number> {
  try {
    const { stdout, stderr } = await execFileAsync('javac', ['-version'])
    const text = `${stdout}${stderr}`
    const m = text.match(/javac\s+(?:1\.)?(\d+)/)
    return m ? parseInt(m[1], 10) : 8
  } catch {
    throw new PluginBuildError(
      'plugins need a full JDK, but "javac" was not found. Install a JDK (https://adoptium.net/) and make sure ' +
      '"javac -version" works in your terminal.'
    )
  }
}

async function findDexer(javacMajor: number): Promise<Dexer> {
  const env = process.env
  if (env.NITRON_D8) {
    if (!existsSync(env.NITRON_D8)) throw new PluginBuildError(`NITRON_D8 points to a missing file: ${env.NITRON_D8}`)
    return { kind: 'launcher', cmd: env.NITRON_D8 }
  }

  const jarDexer = (jar: string): Dexer => {
    if (javacMajor < 11) {
      throw new PluginBuildError(
        `converting plugins to DEX uses R8, which needs Java 11 or newer (you have Java ${javacMajor}). ` +
        `Install JDK 11+, or install the Android SDK build-tools and set NITRON_D8 to its d8 launcher.`
      )
    }
    return { kind: 'jar', jar }
  }

  if (env.NITRON_R8_JAR) {
    if (!existsSync(env.NITRON_R8_JAR)) throw new PluginBuildError(`NITRON_R8_JAR points to a missing file: ${env.NITRON_R8_JAR}`)
    return jarDexer(env.NITRON_R8_JAR)
  }

  // A d8 launcher script on PATH or inside an installed Android SDK (not on Windows: .bat needs a shell)
  if (process.platform !== 'win32') {
    for (const dir of (env.PATH ?? '').split(delimiter)) {
      if (dir && existsSync(join(dir, 'd8'))) return { kind: 'launcher', cmd: join(dir, 'd8') }
    }
  }
  for (const bt of androidSdkBuildTools()) {
    if (process.platform !== 'win32' && existsSync(join(bt, 'd8'))) return { kind: 'launcher', cmd: join(bt, 'd8') }
    const jar = join(bt, 'lib', 'd8.jar')
    if (existsSync(jar)) return jarDexer(jar)
  }

  // R8 downloaded once from Google Maven and cached
  const cached = join(CACHE_DIR, `r8-${R8_VERSION}.jar`)
  if (!existsSync(cached)) await downloadR8(cached)
  return jarDexer(cached)
}

function androidSdkBuildTools(): string[] {
  const home = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
  if (!home) return []
  const dir = join(home, 'build-tools')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    .map(v => join(dir, v))
}

// ─── R8 download (with checksum) ─────────────────────────────────────────────

function httpGet(url: string, redirects = 5): Promise<import('node:http').IncomingMessage> {
  return new Promise((res, rej) => {
    https.get(url, r => {
      if ([301, 302, 307, 308].includes(r.statusCode ?? 0) && r.headers.location && redirects > 0) {
        r.resume()
        httpGet(new URL(r.headers.location, url).toString(), redirects - 1).then(res, rej)
      } else {
        res(r)
      }
    }).on('error', rej)
  })
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await httpGet(url)
    if (r.statusCode !== 200) { r.resume(); return null }
    const chunks: Buffer[] = []
    for await (const c of r) chunks.push(c as Buffer)
    return Buffer.concat(chunks).toString('utf-8').trim()
  } catch {
    return null
  }
}

async function downloadR8(dest: string): Promise<void> {
  logger.info(`Downloading R8 ${R8_VERSION} (converts plugin classes to DEX, one-time download)...`)
  mkdirSync(dirname(dest), { recursive: true })
  const tmp = `${dest}.download`
  try {
    const r = await httpGet(R8_URL)
    if (r.statusCode !== 200) {
      r.resume()
      throw new PluginBuildError(
        `could not download R8 (HTTP ${r.statusCode}). Check your internet connection, or set NITRON_R8_JAR to a local r8.jar.`
      )
    }
    const hash = createHash('sha1')
    await new Promise<void>((ok, bad) => {
      const out = createWriteStream(tmp)
      r.on('data', (c: Buffer) => hash.update(c))
      r.pipe(out)
      out.on('finish', () => ok())
      out.on('error', bad)
      r.on('error', bad)
    })

    // Google Maven publishes a .sha1 next to every artifact
    const expected = (await fetchText(`${R8_URL}.sha1`))?.split(/\s+/)[0]?.toLowerCase()
    const actual = hash.digest('hex')
    if (expected && /^[0-9a-f]{40}$/.test(expected)) {
      if (expected !== actual) {
        throw new PluginBuildError('the downloaded R8 file failed its checksum (SHA-1) and was deleted. Try again.')
      }
    } else {
      logger.warn('Could not fetch the checksum for R8; continuing without verifying the download.')
    }
    renameSync(tmp, dest)
  } catch (err) {
    try { rmSync(tmp, { force: true }) } catch { /* ignore */ }
    if (err instanceof PluginBuildError) throw err
    throw new PluginBuildError(
      `could not download R8: ${(err as Error).message}. Check your internet connection, or set NITRON_R8_JAR to a local r8.jar.`
    )
  }
}

// ─── Compile ─────────────────────────────────────────────────────────────────

async function compileUnit(
  source: string,
  index: number,
  workDir: string,
  tools: Tools,
  opts: BuildPluginsOptions,
): Promise<Unit> {
  const sourcePath = resolve(opts.projectDir, source)
  const sources = collectJavaSources(sourcePath, source)

  const classesDir = join(workDir, String(index), 'classes')
  mkdirSync(classesDir, { recursive: true })

  // javac: Java 8 language level, API on the classpath only (it is already inside the app)
  const release = tools.javacMajor >= 9 ? ['--release', '8'] : ['-source', '8', '-target', '8']
  const args = [
    ...release,
    '-encoding', 'UTF-8',
    '-proc:none',
    '-Xlint:-options',
    '-classpath', [tools.androidJar, tools.apiJar].join(delimiter),
    '-d', classesDir,
    ...sources,
  ]
  try {
    await execFileAsync('javac', args, { maxBuffer: 16 * 1024 * 1024 })
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message: string }
    const output = `${e.stderr ?? ''}${e.stdout ?? ''}`.trim() || e.message
    throw new PluginBuildError(`compilation failed.\n${indent(cleanJavacOutput(output, opts.projectDir))}`)
  }

  const classFiles = walk(classesDir, '.class')
  const infos = new Map<string, ClassInfo>()
  for (const file of classFiles) {
    try {
      const info = parseClassFile(readFileSync(file))
      infos.set(info.name, info)
    } catch (err) {
      if (err instanceof ClassFileError) {
        throw new PluginBuildError(`javac produced a class file Nitron could not read (${relative(classesDir, file)}): ${err.message}`)
      }
      throw err
    }
  }

  const plugins = findPlugins(infos, source)
  lintPermissions(sources, plugins, opts)

  return { source, sources, classesDir, classFiles, plugins }
}

function collectJavaSources(path: string, label: string): string[] {
  if (!existsSync(path)) throw new PluginBuildError(`"${label}" does not exist`)
  const st = statSync(path)
  if (st.isFile()) {
    if (!path.endsWith('.java')) throw new PluginBuildError(`"${label}" is not a .java file or a directory`)
    return [path]
  }
  const files = walk(path, '.java').filter(f => !f.split(/[\\/]/).some(part => part === 'node_modules'))
  if (files.length === 0) throw new PluginBuildError(`no .java files found in "${label}"`)
  return files.sort()
}

function walk(dir: string, ext: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, ext, out)
    else if (e.name.endsWith(ext)) out.push(p)
  }
  return out
}

function indent(text: string): string {
  return text.split('\n').map(l => `    ${l}`).join('\n')
}

/** Shorten absolute paths in javac messages and cap the length. */
function cleanJavacOutput(output: string, projectDir: string): string {
  const root = projectDir.endsWith('/') || projectDir.endsWith('\\') ? projectDir : projectDir + (projectDir.includes('\\') ? '\\' : '/')
  const lines = output.split('\n').map(l => l.split(root).join('')).filter(l => l.trim() !== '')
  if (lines.length > 30) return [...lines.slice(0, 30), `... (${lines.length - 30} more lines)`].join('\n')
  return lines.join('\n')
}

// ─── Plugin detection ────────────────────────────────────────────────────────

function findPlugins(infos: Map<string, ClassInfo>, source: string): PluginEntry[] {
  const extendsPlugin = (info: ClassInfo): boolean => {
    const seen = new Set<string>()
    let current: ClassInfo | undefined = info
    while (current && !seen.has(current.name)) {
      seen.add(current.name)
      if (current.superName === PLUGIN_BASE_CLASS) return true
      current = infos.get(current.superName)
    }
    return false
  }

  const found: PluginEntry[] = []
  for (const info of infos.values()) {
    if (info.isInterface || info.isAbstract || !extendsPlugin(info)) continue
    const javaName = info.name.replace(/\//g, '.')

    if (info.name.includes('$')) {
      throw new PluginBuildError(`${javaName} is a nested class. Plugin classes must be top-level classes.`)
    }
    if (!info.isPublic) {
      throw new PluginBuildError(`${javaName} must be declared "public".`)
    }
    if (!info.hasPublicNoArgConstructor) {
      throw new PluginBuildError(
        `${javaName} needs a public constructor with no parameters. ` +
        `Remove your constructor (use onLoad() for setup) or make it "public ${javaName.split('.').pop()}()".`
      )
    }

    const simple = javaName.split('.').pop() as string
    const name = simple.length > 'Plugin'.length && simple.endsWith('Plugin') ? simple.slice(0, -'Plugin'.length) : simple
    if (!NAME_PATTERN.test(name) || RESERVED_NAMES.has(name)) {
      throw new PluginBuildError(`${javaName}: "${name}" cannot be used as a JavaScript name. Rename the class.`)
    }
    if (!info.usesNitronMethod) {
      logger.warn(`${javaName} has no @NitronMethod methods, so JavaScript cannot call anything on it.`)
    }
    found.push({ name, className: javaName, source })
  }

  if (found.length === 0) {
    throw new PluginBuildError(
      `no plugin class found. Add "public class MyPlugin extends NitronPlugin" ` +
      `(import com.nicron.webview.NitronPlugin) with at least one @NitronMethod method.`
    )
  }
  found.sort((a, b) => a.name.localeCompare(b.name))
  return found
}

/** Warn when plugin code mentions an Android permission that the app does not declare. */
function lintPermissions(sources: string[], plugins: PluginEntry[], opts: BuildPluginsOptions): void {
  const declared = new Set((opts.config.permissions ?? []).map(p => p.replace(/^android\.permission\./, '').toUpperCase()))
  declared.add('INTERNET')
  const missing = new Set<string>()
  for (const file of sources) {
    const text = readFileSync(file, 'utf-8')
    for (const m of text.matchAll(/Manifest\.permission\.([A-Z_]+)/g)) missing.add(m[1])
    for (const m of text.matchAll(/"android\.permission\.([A-Z_]+)"/g)) missing.add(m[1])
  }
  const names = plugins.map(p => p.name).join(', ')
  for (const perm of [...missing].sort()) {
    if (!declared.has(perm)) {
      logger.warn(`Plugin ${names} uses ${perm}, which is not in "permissions" in nitron.config.json. Add it, or the call will be denied.`)
    }
  }
}

// ─── Dex ─────────────────────────────────────────────────────────────────────

/**
 * Convert the compiled classes of the given units to DEX and move the result into the
 * build directory as classes2.dex, classes3.dex, ... Returns the new file names.
 */
async function dexUnits(
  units: Unit[],
  tools: Tools,
  opts: BuildPluginsOptions,
  workDir: string,
  isolated = false,
): Promise<string[]> {
  const outDir = join(workDir, isolated ? `dex-${Math.random().toString(36).slice(2)}` : 'dex')
  mkdirSync(outDir, { recursive: true })

  const classFiles = units.flatMap(u => u.classFiles)
  const common = [
    '--release',
    '--min-api', String(opts.minSdk),
    '--lib', tools.androidJar,
    '--classpath', tools.apiJar,
    '--output', outDir,
    ...classFiles,
  ]

  try {
    if (tools.dexer.kind === 'launcher') {
      await execFileAsync(tools.dexer.cmd, common, { maxBuffer: 16 * 1024 * 1024 })
    } else {
      await execFileAsync('java', ['-cp', tools.dexer.jar, 'com.android.tools.r8.D8', ...common], { maxBuffer: 16 * 1024 * 1024 })
    }
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message: string }
    const output = `${e.stderr ?? ''}${e.stdout ?? ''}`.trim() || e.message
    const which = units.map(u => u.source).join(', ')
    throw new PluginBuildError(`could not convert ${which} to DEX.\n${indent(cleanJavacOutput(output, opts.projectDir))}`)
  }

  const produced = readdirSync(outDir).filter(f => /^classes\d*\.dex$/.test(f))
    .sort((a, b) => dexIndex(a) - dexIndex(b))
  if (produced.length === 0) {
    throw new PluginBuildError('the dex converter produced no output')
  }

  // Number the new files after the dex files already in the app
  let next = 1
  for (const f of readdirSync(opts.buildDir)) {
    if (/^classes\d*\.dex$/.test(f)) next = Math.max(next, dexIndex(f) + 1)
  }
  const added: string[] = []
  for (const f of produced) {
    const name = `classes${next === 1 ? '' : next}.dex`
    renameSync(join(outDir, f), join(opts.buildDir, name))
    added.push(name)
    next++
  }
  return added
}

function dexIndex(file: string): number {
  const m = file.match(/^classes(\d*)\.dex$/)
  return m && m[1] ? parseInt(m[1], 10) : 1
}
