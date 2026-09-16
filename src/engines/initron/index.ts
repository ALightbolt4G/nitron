// engines/initron/index.ts — iOS engine, exposed via the shared BuildEngine contract

import type { NitronConfig, BuildOptions } from '../../types.js'
import type { BuildEngine, EngineBuildResult } from '../../core/engine.interface.js'
import { build } from './build.js'

export const initronEngine: BuildEngine = {
  name: 'initron',
  artifactExtension: 'ipa',

  async build(config: NitronConfig, options: BuildOptions): Promise<EngineBuildResult> {
    return build(config, options)
  },
}

export { build } from './build.js'
export { signApp, adHocSignApp, findZsign } from './signer.js'
