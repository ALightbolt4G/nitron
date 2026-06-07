// icon/cache.ts — Deterministic icon build caching
//
// Implements hash-based cache checking so the icon pipeline can skip
// regeneration when the input hasn't changed:
//
//   same input PNG + same config → same hash → skip rebuild
//
// Cache is stored as a small JSON file alongside the build output.

import { createHash } from 'node:crypto'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { ResolvedIconConfig } from './types.js'

const CACHE_FILENAME = '.nitron-icon-cache.json'

/**
 * Pipeline version — bump this when resize logic, padding ratios,
 * safe zone constants, or output format changes. This ensures
 * the cache is invalidated when the pipeline behavior changes,
 * even if the input icon and config are identical.
 */
const PIPELINE_VERSION = '2'

interface IconCacheEntry {
  /** SHA-256 of the source icon file content */
  srcHash: string
  /** SHA-256 of the resolved config + pipeline version */
  configHash: string
  /** Timestamp of last generation */
  generatedAt: number
  /** Pipeline version used */
  pipelineVersion: string
}

/**
 * Compute a deterministic hash of the icon source file.
 */
async function hashFile(filePath: string): Promise<string> {
  const content = await readFile(filePath)
  return createHash('sha256').update(content).digest('hex')
}

/**
 * Compute a deterministic hash of the icon config + pipeline version.
 * Including PIPELINE_VERSION ensures that changes to resize logic,
 * padding ratios, or output format invalidate the cache.
 */
function hashConfig(config: ResolvedIconConfig): string {
  const normalized = JSON.stringify({
    background: config.background,
    adaptive: config.adaptive,
    _pipelineVersion: PIPELINE_VERSION,
  })
  return createHash('sha256').update(normalized).digest('hex')
}

/**
 * Check if the icon pipeline can be skipped because inputs haven't changed.
 *
 * @returns true if the cache is valid and we can skip icon generation
 */
export async function checkIconCache(
  config: ResolvedIconConfig,
  projectDir: string
): Promise<boolean> {
  const cachePath = join(projectDir, CACHE_FILENAME)

  try {
    const cacheRaw = await readFile(cachePath, 'utf-8')
    const cache: IconCacheEntry = JSON.parse(cacheRaw)

    const [currentSrcHash, currentConfigHash] = await Promise.all([
      hashFile(config.srcPath),
      Promise.resolve(hashConfig(config)),
    ])

    return cache.srcHash === currentSrcHash && cache.configHash === currentConfigHash
  } catch {
    // No cache file or invalid — needs rebuild
    return false
  }
}

/**
 * Write the icon cache file after a successful generation.
 */
export async function writeIconCache(
  config: ResolvedIconConfig,
  projectDir: string
): Promise<void> {
  const cachePath = join(projectDir, CACHE_FILENAME)

  const entry: IconCacheEntry = {
    srcHash: await hashFile(config.srcPath),
    configHash: hashConfig(config),
    generatedAt: Date.now(),
    pipelineVersion: PIPELINE_VERSION,
  }

  await writeFile(cachePath, JSON.stringify(entry, null, 2))
}
