// index.ts — Public API for the nitron package
//
// This is what the developer imports in their app.js:
//   import { app } from 'nitron'
//
// The app.init() call captures the config, which is then read
// by the CLI during the build process.

import type { NitronConfig } from './types.js'

/**
 * Global key for storing the captured config.
 *
 * We use globalThis instead of a module-level variable because Node.js ESM
 * caches modules by their resolved file URL. When nitron is installed via
 * npm link (symlinks), the CLI's import of ./index.js and the user's
 * import of 'nitron' can resolve to different URLs — creating two separate
 * module instances with separate state. globalThis is per-process and
 * always shared, regardless of how the module is resolved.
 */
const NITRON_CONFIG_KEY = '__nitron_captured_config__'

/**
 * The public `app` object that developers use in their app.js
 * to configure their Nitron project.
 */
export const app = {
  /**
   * Initialize the Nitron app with the given configuration.
   * This is called in the developer's app.js file.
   *
   * @example
   * ```js
   * import { app } from 'nitron'
   *
   * app.init({
   *   name: "My App",
   *   packageId: "com.myname.myapp",
   *   version: "1.0.0",
   *   entry: "index.html",
   * })
   * ```
   */
  init(config: Partial<NitronConfig>): void {
    ;(globalThis as any)[NITRON_CONFIG_KEY] = config
  },
}

/**
 * Retrieve the config that was captured by the last app.init() call.
 * Used internally by the config reader — not part of the public API.
 * @internal
 */
export function _getCapturedConfig(): Partial<NitronConfig> | null {
  return (globalThis as any)[NITRON_CONFIG_KEY] ?? null
}

/**
 * Reset the captured config. Called before loading a new app.js
 * to ensure a clean state.
 * @internal
 */
export function _resetCapturedConfig(): void {
  ;(globalThis as any)[NITRON_CONFIG_KEY] = null
}

// Re-export types for consumers
export type { NitronConfig, BuildOptions, BuildResult, ValidationResult } from './types.js'
