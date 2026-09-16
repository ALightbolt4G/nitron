import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { mkdir, access, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import https from 'node:https';

const BUNDLETOOL_VERSION = '1.17.0';
const BUNDLETOOL_URL = `https://github.com/google/bundletool/releases/download/${BUNDLETOOL_VERSION}/bundletool-all-${BUNDLETOOL_VERSION}.jar`;

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

/**
 * Download and return the path to bundletool.jar
 */
export async function ensureBundletool(): Promise<string> {
  const cacheDir = join(homedir(), '.nitron', 'android');
  await mkdir(cacheDir, { recursive: true });
  
  const jarPath = join(cacheDir, `bundletool-all-${BUNDLETOOL_VERSION}.jar`);
  
  try {
    await access(jarPath);
  } catch {
    console.log(`Downloading bundletool v${BUNDLETOOL_VERSION}...`);
    try {
      await downloadFile(BUNDLETOOL_URL, jarPath);
    } catch (err: any) {
      await rm(jarPath, { force: true });
      throw new Error(`Failed to download bundletool: ${err.message}`);
    }
  }
  
  return jarPath;
}
