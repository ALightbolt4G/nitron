// engines/nitronoid/index.ts — Android engine, exposed via the shared BuildEngine contract
//
// This file does NOT contain build logic itself. It's a thin adapter around
// the existing build() pipeline in build.ts (unchanged since v2.1.0), so the
// rest of the codebase (cli.ts) can treat nitronoid and initron identically.

import type { NitronConfig, BuildOptions } from '../../types.js'
import type { BuildEngine, EngineBuildResult } from '../../core/engine.interface.js'
import { build } from './build.js'

export const nitronoidEngine: BuildEngine = {
  name: 'nitronoid',
  artifactExtension: 'apk',

  async build(config: NitronConfig, options: BuildOptions): Promise<EngineBuildResult> {
    const result = await build(config, options)
    return {
      ...result,
      artifactExtension: options.target === 'aab' ? 'aab' : 'apk',
    }
  },
}

// Re-exported for callers that still need direct access (keystore.ts flow, etc.)
export { build } from './build.js'
export { generateKeystore } from './keystore.js'
