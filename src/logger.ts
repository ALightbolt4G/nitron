// logger.ts — Unified CLI output with colors, progress, and clear messages
//
// Rule: The developer should NEVER see an Android error.
// All output goes through this logger.

import pc from 'picocolors'

export const logger = {
  /**
   * Print an informational message.
   */
  info(msg: string): void {
    console.log(`${pc.cyan('ℹ')} ${msg}`)
  },

  /**
   * Print a success message.
   */
  success(msg: string): void {
    console.log(`${pc.green('✓')} ${msg}`)
  },

  /**
   * Print a warning (non-fatal).
   */
  warn(msg: string): void {
    console.log(`${pc.yellow('⚠')} ${msg}`)
  },

  /**
   * Print an error (fatal).
   */
  error(msg: string): void {
    console.error(`${pc.red('✗')} ${msg}`)
  },

  /**
   * Print a build step indicator.
   * Example: [1/8] Reading configuration...
   */
  step(step: number, total: number, msg: string): void {
    const badge = pc.dim(`[${step}/${total}]`)
    console.log(`${badge} ${msg}`)
  },

  /**
   * Print a blank line for visual spacing.
   */
  blank(): void {
    console.log()
  },

  /**
   * Print a section header with underline.
   */
  header(msg: string): void {
    console.log()
    console.log(pc.bold(pc.cyan(`  ${msg}`)))
    console.log(pc.dim(`  ${'─'.repeat(40)}`))
  },

  /**
   * Print a config key-value pair with aligned formatting.
   */
  config(key: string, value: string): void {
    const paddedKey = key.padEnd(14)
    console.log(`  ${pc.dim(paddedKey)} ${value}`)
  },

  /**
   * Print the Nitron banner / logo.
   */
  banner(): void {
    console.log()
    console.log(pc.bold(pc.cyan('  ⚡ Nitron')))
    console.log(pc.dim('  HTML/CSS/JS → Android APK'))
    console.log()
  },

  /**
   * Print a final build summary line.
   */
  summary(outputPath: string, size: string, duration: string): void {
    console.log()
    console.log(
      `${pc.green('✓')} ${pc.bold('Built successfully')} → ${pc.cyan(outputPath)} ${pc.dim(`(${size}) in ${duration}`)}`
    )
    console.log()
  },
}
