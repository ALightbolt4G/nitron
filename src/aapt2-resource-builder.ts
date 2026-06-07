import { join, dirname, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { mkdir, writeFile, rm, chmod, access, readFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import https from 'node:https';
import AdmZip from 'adm-zip';
import sharp from 'sharp';
import type { NitronConfig } from './types.js';
import { generateManifestXml } from './manifest.js';

const execFileAsync = promisify(execFile);

// ─── Configuration ────────────────────────────────────────────────────────
const AAPT2_VERSION = '9.2.0-15009934';

function getPlatformId(): string {
  const platform = process.platform;
  const arch = process.arch;
  
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'osx'; // Universal binary
  if (platform === 'linux') return 'linux';
  
  throw new Error(`Unsupported platform for aapt2: ${platform}`);
}

// ─── Secure Downloader ──────────────────────────────────────────────────
async function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        if (!res.headers.location) return reject(new Error('Redirect missing location'));
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download ${url}: HTTP ${res.statusCode}`));
      }
      const file = createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
      file.on('error', (err) => {
        file.close();
        reject(err);
      });
    }).on('error', reject);
  });
}

// ─── Dependency Management ────────────────────────────────────────────────
async function ensureAapt2(): Promise<string> {
  const cacheDir = join(homedir(), '.nitron', 'android');
  await mkdir(cacheDir, { recursive: true });
  
  const platformId = getPlatformId();
  const binaryName = platformId === 'windows' ? 'aapt2.exe' : 'aapt2';
  const aapt2Path = join(cacheDir, binaryName);

  try {
    await access(aapt2Path);
  } catch {
    const aapt2Url = `https://dl.google.com/dl/android/maven2/com/android/tools/build/aapt2/${AAPT2_VERSION}/aapt2-${AAPT2_VERSION}-${platformId}.jar`;
    const jarPath = join(cacheDir, `aapt2-${AAPT2_VERSION}.jar`);
    
    console.log(`Downloading aapt2 (${platformId})...`);
    await downloadFile(aapt2Url, jarPath);
    
    const zip = new AdmZip(jarPath);
    // Extract aapt2 binary, ignoring directories
    const entry = zip.getEntries().find(e => e.entryName === binaryName || e.entryName.endsWith('/' + binaryName));
    if (!entry) throw new Error('aapt2 binary not found in downloaded jar');
    
    zip.extractEntryTo(entry, cacheDir, false, true);
    await rm(jarPath, { force: true });
    
    if (platformId !== 'windows') {
      await chmod(aapt2Path, 0o755);
    }
  }
  
  return aapt2Path;
}

async function ensureAndroidJar(): Promise<string> {
  const cacheDir = join(homedir(), '.nitron', 'android');
  await mkdir(cacheDir, { recursive: true });
  
  const jarPath = join(cacheDir, 'android.jar');
  try {
    await access(jarPath);
  } catch {
    // We must use a valid SDK jar. Downloading platform-34 from Google's repository.
    const platformUrl = 'https://dl.google.com/android/repository/platform-34-ext7_r01.zip';
    const tempZipPath = join(cacheDir, 'platform-34.zip');
    
    console.log('Downloading Android SDK framework (android.jar)...');
    await downloadFile(platformUrl, tempZipPath);
    
    // Use AdmZip to safely extract only android.jar
    const zip = new AdmZip(tempZipPath);
    const entry = zip.getEntries().find(e => e.entryName.endsWith('android.jar'));
    if (!entry) throw new Error('android.jar not found in platform zip');
    
    zip.extractEntryTo(entry, cacheDir, false, true);
    await rm(tempZipPath, { force: true });
  }
  
  return jarPath;
}

// ─── Resource Builder ──────────────────────────────────────────────────
export interface BuildResourcesResult {
  success: boolean;
}

export async function buildResources(
  config: NitronConfig,
  projectDir: string,
  targetBuildDir: string
): Promise<BuildResourcesResult> {
  const buildId = `nitron-res-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const workDir = join(tmpdir(), buildId);
  const resDir = join(workDir, 'res');

  try {
    const [aapt2, androidJar] = await Promise.all([
      ensureAapt2().catch(e => { throw new Error(`[CRITICAL] aapt2 setup failed: ${e.message}`); }),
      ensureAndroidJar().catch(e => { throw new Error(`[CRITICAL] android.jar setup failed: ${e.message}`); })
    ]);

    // 1. Create Android-Compliant Resource Structure
    await mkdir(join(resDir, 'mipmap-anydpi-v26'), { recursive: true });
    await mkdir(join(resDir, 'values'), { recursive: true });
    
    const mipmaps = [
      { dpi: 'mdpi', size: 48 },
      { dpi: 'hdpi', size: 72 },
      { dpi: 'xhdpi', size: 96 },
      { dpi: 'xxhdpi', size: 144 },
      { dpi: 'xxxhdpi', size: 192 }
    ];

    for (const { dpi } of mipmaps) {
      await mkdir(join(resDir, `mipmap-${dpi}`), { recursive: true });
    }

    const customBackground = typeof config.icon === 'object' && config.icon?.background
      ? config.icon.background
      : '#FFFFFF';

    // 2. Generate Sharp-Resized Icons (Foreground & Legacy)
    if (config.icon && config.icon !== 'default') {
      const iconSrc = typeof config.icon === 'string' 
        ? (config.icon ? resolve(projectDir, config.icon) : null)
        : (config.icon?.src ? resolve(projectDir, config.icon.src) : null);
              
      try {
        await access(iconSrc!);
      } catch {
        throw new Error(`[ERROR] Source icon not found at: ${iconSrc}`);
      }

      for (const { dpi, size } of mipmaps) {
        const destDir = join(resDir, `mipmap-${dpi}`);
        
        // Legacy icon
        await sharp(iconSrc)
          .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
          .toFile(join(destDir, 'ic_launcher.png'));
          
        // Foreground icon (Adaptive) - usually with padding. Sharp handles containment.
        await sharp(iconSrc)
          .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
          .toFile(join(destDir, 'ic_launcher_foreground.png'));
      }
    } else {
      throw new Error('[ERROR] config.icon must be provided to build resources');
    }

    // 3. Generate Valid Resource XMLs
    // Adaptive Icon Wrapper
    const adaptiveIconXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>`;
    await writeFile(join(resDir, 'mipmap-anydpi-v26', 'ic_launcher.xml'), adaptiveIconXml);

    // Background Color values
    const colorsXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${customBackground}</color>
</resources>`;
    await writeFile(join(resDir, 'values', 'colors.xml'), colorsXml);

    // Real Manifest generated by our builder
    const manifestXml = generateManifestXml(config);
    const manifestPath = join(workDir, 'AndroidManifest.xml');
    await writeFile(manifestPath, manifestXml);

    // 4. Compile Resources (maxBuffer increased for safety)
    const compiledZip = join(workDir, 'compiled.zip');
    try {
      await execFileAsync(aapt2, ['compile', '--dir', resDir, '-o', compiledZip], { maxBuffer: 10 * 1024 * 1024 });
    } catch (err: any) {
      throw new Error(`[CRITICAL] aapt2 compile failed:\n${err.stderr || err.message}`);
    }

    // 5. Link Resources (Emit IDs to map to Nitron AXML)
    const resourcesApk = join(workDir, 'resources.apk');
    const emitIdsPath = join(workDir, 'R.txt');
    
    try {
      await execFileAsync(aapt2, [
        'link',
        compiledZip,
        '--manifest', manifestPath,
        '-I', androidJar,
        '-o', resourcesApk
      ], { maxBuffer: 10 * 1024 * 1024 });
    } catch (err: any) {
      throw new Error(`[CRITICAL] aapt2 link failed:\n${err.stderr || err.message}`);
    }

    // 7. Safe Resource Extraction
    // We MUST extract resources.arsc, AndroidManifest.xml, and the compiled res/ directory.
    const apkZip = new AdmZip(resourcesApk);
    
    for (const entry of apkZip.getEntries()) {
      if (!entry.isDirectory) {
        if (entry.entryName === 'resources.arsc' || entry.entryName === 'AndroidManifest.xml') {
          apkZip.extractEntryTo(entry, targetBuildDir, false, true);
        } else if (entry.entryName.startsWith('res/')) {
          // Extract into targetBuildDir/res/ keeping internal directory structure
          const targetPath = join(targetBuildDir, dirname(entry.entryName));
          await mkdir(targetPath, { recursive: true });
          apkZip.extractEntryTo(entry, targetPath, false, true);
        }
      }
    }
    
  } finally {
    // 8. Bulletproof Cleanup
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
  
  return { success: true };
}
