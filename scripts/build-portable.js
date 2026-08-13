import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, createWriteStream } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import https from 'node:https'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')
const SRC_DIR = join(ROOT, 'template-src')
const TEMPLATE_DIR = join(ROOT, 'template')
const BUILD_DIR = join(ROOT, '.template-build')
const JAVA_FILE = join(SRC_DIR, 'MainActivity.java')

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        if (!res.headers.location) return reject(new Error('Redirect missing location'));
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`Failed: HTTP ${res.statusCode}`));
      const file = createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', (err) => { file.close(); reject(err); });
    }).on('error', reject);
  });
}

(async function main() {
    const cacheDir = join(homedir(), '.nitron', 'android')
    mkdirSync(cacheDir, { recursive: true })
    
    // 1. Download android.jar
    let androidJarPath = join(cacheDir, 'android.jar')
    if (!existsSync(androidJarPath)) {
        console.log('Downloading android.jar...')
        const platformUrl = 'https://dl.google.com/android/repository/platform-34-ext7_r01.zip'
        const tempZipPath = join(cacheDir, 'platform-34.zip')
        await downloadFile(platformUrl, tempZipPath)
        const JSZip = (await import('jszip')).default
        const zipData = readFileSync(tempZipPath)
        const zip = await JSZip.loadAsync(zipData)
        const jarEntry = Object.keys(zip.files).find(name => name.endsWith('android.jar'))
        const jarBuffer = await zip.file(jarEntry).async('nodebuffer')
        writeFileSync(androidJarPath, jarBuffer)
        rmSync(tempZipPath, { force: true })
    }

    // 2. Download ECJ (Eclipse Compiler for Java)
    let ecjPath = join(cacheDir, 'ecj.jar')
    if (!existsSync(ecjPath)) {
        console.log('Downloading ECJ (Java Compiler)...')
        await downloadFile('https://repo1.maven.org/maven2/org/eclipse/jdt/ecj/3.33.0/ecj-3.33.0.jar', ecjPath)
    }

    // 3. Download R8 (Android D8 Compiler)
    let r8Path = join(cacheDir, 'r8.jar')
    if (!existsSync(r8Path)) {
        console.log('Downloading R8/D8 (DEX Compiler)...')
        await downloadFile('https://dl.google.com/dl/android/maven2/com/android/tools/r8/8.2.33/r8-8.2.33.jar', r8Path)
    }

    if (existsSync(BUILD_DIR)) rmSync(BUILD_DIR, { recursive: true })
    mkdirSync(BUILD_DIR, { recursive: true })
    mkdirSync(TEMPLATE_DIR, { recursive: true })

    console.log('Compiling MainActivity.java with ECJ...')
    execSync(`java -jar "${ecjPath}" -source 1.8 -target 1.8 -cp "${androidJarPath}" -d "${BUILD_DIR}" "${JAVA_FILE}"`, { stdio: 'inherit' })
    
    console.log('Converting to DEX with D8...')
    const classDir = join(BUILD_DIR, 'com', 'nicron', 'webview')
    const { readdirSync } = await import('node:fs')
    const classFiles = readdirSync(classDir)
      .filter(f => f.endsWith('.class'))
      .map(f => `"${join(classDir, f)}"`)
      .join(' ')
    execSync(`java -cp "${r8Path}" com.android.tools.r8.D8 --lib "${androidJarPath}" --output "${BUILD_DIR}" ${classFiles}`, { stdio: 'inherit' })

    console.log('Packaging base.apk...')
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    const dexPath = join(BUILD_DIR, 'classes.dex')
    zip.file('classes.dex', readFileSync(dexPath))
    zip.folder('assets')
    const content = await zip.generateAsync({ type: 'nodebuffer' })
    writeFileSync(join(TEMPLATE_DIR, 'base.apk'), content)
    
    rmSync(BUILD_DIR, { recursive: true })
    console.log('Done! Template updated.')
})().catch(console.error)
