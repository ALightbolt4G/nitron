import { join, dirname } from 'node:path';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import JSZip from 'jszip';
import { ensureBundletool } from './bundletool.js';
import { findJava } from './signer.js';

const execFileAsync = promisify(execFile);

/**
 * Creates the base.zip layout required by bundletool and builds the AAB.
 * @param buildDir Directory containing the unpacked template (assets/, classes.dex) and the resources extracted from proto APK (AndroidManifest.xml, res/, resources.pb).
 * @param outputPath Path to write the final .aab file.
 */
export async function packAab(buildDir: string, outputPath: string): Promise<void> {
  const baseZipPath = join(buildDir, 'base.zip');
  const zip = new JSZip();

  // AAB Structure:
  // /manifest/AndroidManifest.xml
  // /dex/classes.dex
  // /res/...
  // /resources.pb
  // /assets/...
  // /root/... (optional)

  // 1. Add manifest
  try {
    const manifestData = await readFile(join(buildDir, 'AndroidManifest.xml'));
    zip.file('manifest/AndroidManifest.xml', manifestData);
  } catch (err) {
    throw new Error('AndroidManifest.xml not found in build directory. Make sure aapt2 proto link succeeded.');
  }

  // 2. Add dex
  try {
    const dexData = await readFile(join(buildDir, 'classes.dex'));
    zip.file('dex/classes.dex', dexData);
  } catch (err) {
    throw new Error('classes.dex not found in build directory.');
  }

  // 3. Add resources.pb
  try {
    const pbData = await readFile(join(buildDir, 'resources.pb'));
    zip.file('resources.pb', pbData);
  } catch (err) {
    throw new Error('resources.pb not found. Make sure you used --proto-format in aapt2 link.');
  }

  // Helper to recursively add directories
  async function addDirToZip(basePath: string, zipFolder: string) {
    try {
      const entries = await readdir(basePath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'META-INF') continue;
        const fullPath = join(basePath, entry.name);
        const zipPath = zipFolder ? `${zipFolder}/${entry.name}` : entry.name;
        
        if (entry.isDirectory()) {
          await addDirToZip(fullPath, zipPath);
        } else {
          const data = await readFile(fullPath);
          // Standard deflate, bundletool will optimize compression later
          zip.file(zipPath, data, { compression: 'DEFLATE' });
        }
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  // 4. Add res/
  await addDirToZip(join(buildDir, 'res'), 'res');

  // 5. Add assets/
  await addDirToZip(join(buildDir, 'assets'), 'assets');

  // Generate base.zip
  const content = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  await writeFile(baseZipPath, content);

  // 6. Build bundle using bundletool
  const bundletoolJar = await ensureBundletool();
  const java = await findJava();

  await mkdir(dirname(outputPath), { recursive: true });
  
  const { rm } = await import('node:fs/promises');
  await rm(outputPath, { force: true });

  try {
    await execFileAsync(java, [
      '-jar', bundletoolJar,
      'build-bundle',
      '--modules', baseZipPath,
      '--output', outputPath
    ], { maxBuffer: 50 * 1024 * 1024 }); // 50MB max buffer
  } catch (err: any) {
    throw new Error(`bundletool failed: ${err.stderr || err.message}`);
  }
}
