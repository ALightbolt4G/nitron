// cli.ts — CLI entry point for Nitron
//
// Commands:
//   nitron build   — Build APK from current project
//   nitron init    — Scaffold a new project (Phase 3)
//   nitron dev     — Start local preview server (Phase 3)

import { Command } from 'commander'
import { resolve } from 'node:path'
import { readConfig } from './config.js'
import { validateConfig, validateProject } from './validator.js'
import { build } from './builder.js'
import { logger } from './logger.js'

const program = new Command()

program
  .name('nitron')
  .description('Convert HTML/CSS/JS into Android APK — zero Android knowledge required')
  .version('0.1.0')

// ─── BUILD COMMAND ───────────────────────────────────────────────
program
  .command('build')
  .description('Build APK or PWA from the current project')
  .option('--debug', 'Enable verbose debug output', false)
  .option('-t, --target <target>', 'Target output: android, pwa, or all', 'android')
  .action(async (options: { debug: boolean, target: string }) => {
    const projectDir = process.cwd()

    logger.banner()

    // Step 1: Read config
    logger.step(1, 2, 'Reading configuration...')

    let config
    try {
      config = await readConfig(projectDir)
    } catch (err: any) {
      logger.error(err.message)
      process.exit(1)
    }

    logger.success('Configuration loaded')

    // Step 2: Validate config
    logger.step(2, 2, 'Validating project...')

    const configResult = validateConfig(config)
    const projectResult = await validateProject(projectDir, config)

    // Print all warnings
    for (const w of [...configResult.warnings, ...projectResult.warnings]) {
      logger.warn(w)
    }

    // Check for errors
    const allErrors = [...configResult.errors, ...projectResult.errors]
    if (allErrors.length > 0) {
      for (const e of allErrors) {
        logger.error(e)
      }
      logger.blank()
      logger.error('Build aborted — fix the errors above and try again.')
      process.exit(1)
    }

    logger.success('Project valid')
    logger.blank()

    // Display resolved config
    logger.config('App Name', config.name)
    logger.config('Package ID', config.packageId)
    logger.config('Version', config.version)
    logger.config('Entry', config.entry)
    logger.config('Orientation', config.orientation)
    logger.config('Status Bar', config.statusBar ? 'visible' : 'hidden')
    logger.config('Permissions', config.permissions.length > 0 ? config.permissions.join(', ') : 'none')
    logger.config('Icon', config.icon ?? 'default')
    logger.blank()

    if (options.debug) {
      logger.info('Debug: Full config object:')
      console.log(JSON.stringify(config, null, 2))
      logger.blank()
    }

    const target = options.target.toLowerCase()
    
    if (target === 'pwa' || target === 'all') {
      logger.info('Building PWA target...')
      const { buildPwa } = await import('./pwa.js')
      try {
        const { outDir, filesCount } = await buildPwa(process.cwd(), config)
        logger.success(`PWA built successfully → ${outDir} (${filesCount} files)`)
      } catch (err: any) {
        logger.error(`PWA build failed: ${err.message}`)
        process.exit(1)
      }
      logger.blank()
    }

    if (target === 'android' || target === 'all') {
      logger.info('Building Android target...')
      const result = await build(config, {
        projectDir,
        outputDir: resolve(projectDir, 'dist'),
        debug: options.debug,
      })

      if (!result.success) {
        for (const e of result.errors) {
          logger.error(e)
        }
        logger.blank()
        logger.error('Android build failed.')
        process.exit(1)
      }
    }
  })

// ─── INIT COMMAND (Phase 3) ──────────────────────────────────────
program
  .command('init [name]')
  .description('Create a new Nitron project')
  .action(async (name?: string) => {
    logger.banner()
    const { initProject } = await import('./init.js')
    await initProject(name)
  })

// ─── DEV COMMAND (Phase 3) ───────────────────────────────────────
program
  .command('dev')
  .description('Start local preview server with hot reload')
  .action(async () => {
    logger.banner()
    const { startDevServer } = await import('./dev.js')
    await startDevServer(process.cwd())
  })

// ─── Parse and run ──────────────────────────────────────────────
program.parse()
