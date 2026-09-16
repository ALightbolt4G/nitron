// engine.interface.ts — Shared contract between platform build engines
//
// Every platform engine (nitronoid for Android, initron for iOS) implements
// this interface. cli.ts and builder orchestration code depend ONLY on this
// interface — never on engine-internal details. This keeps the two engines
// fully isolated: a change inside one can never silently break the other.

import type { NitronConfig, BuildOptions, BuildResult } from '../types.js'

/**
 * Result of a platform build, independent of the specific engine.
 */
export interface EngineBuildResult extends BuildResult {
  /** File extension of the produced artifact, without the dot (e.g. "apk", "ipa") */
  artifactExtension: string
}

/**
 * A platform build engine. Each engine owns its entire pipeline
 * (unpack template → inject assets → patch metadata → pack → sign)
 * and exposes a single entry point.
 */
export interface BuildEngine {
  /** Human-readable engine name, used in logs (e.g. "nitronoid", "initron") */
  readonly name: string

  /** File extension the engine produces, without the dot (e.g. "apk", "ipa") */
  readonly artifactExtension: string

  /**
   * Run the full build pipeline for this platform.
   * Implementations are responsible for all cleanup of temp directories,
   * even on failure.
   */
  build(config: NitronConfig, options: BuildOptions): Promise<EngineBuildResult>
}
