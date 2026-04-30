// types.ts — Shared TypeScript interfaces for Nitron

/**
 * The unified configuration object that drives the entire build pipeline.
 * Merged from the developer's app.js config and package.json.
 */
export interface NitronConfig {
  /** App display name shown on the device home screen */
  name: string
  /** Unique Android package identifier (e.g. com.myname.myapp) */
  packageId: string
  /** App version string (e.g. "1.0.0") */
  version: string
  /** HTML entry point filename (e.g. "index.html") */
  entry: string
  /** Screen orientation lock: portrait, landscape, or auto */
  orientation: 'portrait' | 'landscape' | 'auto'
  /** Whether to show the Android status bar */
  statusBar: boolean
  /** Android permissions the app needs (e.g. ["CAMERA", "INTERNET"]) */
  permissions: string[]
  /** Path to the app icon image, or null for default */
  icon: string | null
}

/**
 * Options passed to the build pipeline.
 */
export interface BuildOptions {
  /** Absolute path to the developer's project directory */
  projectDir: string
  /** Absolute path to the output directory (e.g. dist/) */
  outputDir: string
  /** Enable verbose debug logging */
  debug: boolean
  /** Build in release mode using nitron-release.keystore */
  release?: boolean
}

/**
 * Result returned after a build completes.
 */
export interface BuildResult {
  /** Whether the build succeeded */
  success: boolean
  /** Path to the output APK file, or null if build failed */
  outputPath: string | null
  /** Build duration in milliseconds */
  duration: number
  /** List of errors encountered during build */
  errors: string[]
  /** List of non-fatal warnings */
  warnings: string[]
}

/**
 * Result of validating the project config and structure.
 */
export interface ValidationResult {
  /** Whether validation passed (no errors) */
  valid: boolean
  /** List of validation errors (fatal) */
  errors: string[]
  /** List of validation warnings (non-fatal) */
  warnings: string[]
}
