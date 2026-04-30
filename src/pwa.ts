// pwa.ts — PWA target generator
//
// Generates a Progressive Web App (PWA) from the exact same Nitron configuration.
// It copies all assets, generates manifest.json, a service-worker.js, and injects
// them into the index.html.

import { join, relative } from 'node:path'
import { mkdir, readdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises'
import { NitronConfig } from './config.js'
import { logger } from './logger.js'

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
 * Build the PWA target.
 */
export async function buildPwa(projectDir: string, config: NitronConfig): Promise<{ outDir: string, filesCount: number }> {
  const pwaDir = join(projectDir, 'dist', 'pwa')

  // Clean and recreate pwa directory
  await rm(pwaDir, { recursive: true, force: true })
  await mkdir(pwaDir, { recursive: true })

  logger.step(1, 4, 'Copying web assets...')
  const copiedFiles: string[] = [] // Relative paths of copied files

  async function copyRecursive(srcDir: string, destDir: string): Promise<void> {
    const entries = await readdir(srcDir, { withFileTypes: true })
    for (const entry of entries) {
      if (EXCLUDED.has(entry.name)) continue
      const srcPath = join(srcDir, entry.name)
      const destPath = join(destDir, entry.name)
      if (entry.isDirectory()) {
        await mkdir(destPath, { recursive: true })
        await copyRecursive(srcPath, destPath)
      } else if (entry.isFile()) {
        await copyFile(srcPath, destPath)
        // Store path with forward slashes for service worker cache list
        const relPath = relative(pwaDir, destPath).replace(/\\/g, '/')
        copiedFiles.push(relPath)
      }
    }
  }

  await copyRecursive(projectDir, pwaDir)
  logger.success(`Copied ${copiedFiles.length} files`)

  logger.step(2, 4, 'Generating manifest.json...')
  const manifest = {
    name: config.name,
    short_name: config.name,
    start_url: `./${config.entry}`,
    display: 'standalone',
    orientation: config.orientation === 'portrait' ? 'portrait' : config.orientation === 'landscape' ? 'landscape' : 'any',
    background_color: '#ffffff',
    theme_color: '#0070f3',
    icons: [
      {
        src: config.icon === 'default' || !config.icon ? 'icon.png' : config.icon,
        sizes: '192x192 512x512',
        type: 'image/png',
        purpose: 'any maskable'
      }
    ]
  }

  await writeFile(join(pwaDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

  // If no icon is provided and default is requested, we should create a fallback transparent icon or warn
  if (config.icon === 'default' && !copiedFiles.includes('icon.png')) {
    logger.warn('Default icon requested but icon.png not found. Add an icon.png for better PWA experience.')
  }

  logger.step(3, 4, 'Generating service-worker.js...')
  // The service worker pre-caches all the copied files + manifest.json
  const cacheName = `${config.packageId}-v${config.version}`
  const cacheList = [...copiedFiles.map(f => `./${f}`), './manifest.json']

  const swContent = `
const CACHE_NAME = '${cacheName}';
const ASSETS = ${JSON.stringify(cacheList, null, 2)};

// Install Event: Cache all assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching all assets');
        return cache.addAll(ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Event: Cleanup old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Cache First Strategy
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response; // Return from cache
        }
        return fetch(event.request); // Network fallback
      })
  );
});
`
  await writeFile(join(pwaDir, 'service-worker.js'), swContent)

  logger.step(4, 4, 'Injecting PWA tags into HTML...')
  const indexPath = join(pwaDir, config.entry)
  try {
    let html = await readFile(indexPath, 'utf-8')

    // Inject manifest link
    if (!html.includes('manifest.json')) {
      const manifestTag = '\n  <link rel="manifest" href="manifest.json">'
      html = html.replace('</head>', `${manifestTag}\n</head>`)
    }

    // Inject service worker registration
    if (!html.includes('serviceWorker')) {
      const swTag = `
  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
          .then(reg => console.log('SW registered:', reg.scope))
          .catch(err => console.error('SW failed:', err));
      });
    }
  </script>
`
      html = html.replace('</body>', `${swTag}\n</body>`)
    }

    await writeFile(indexPath, html)
  } catch (err: any) {
    logger.warn(`Could not update ${config.entry}: ${err.message}`)
  }

  return { outDir: pwaDir, filesCount: copiedFiles.length + 2 } // + manifest & sw
}
