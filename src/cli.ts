// cli.ts — CLI entry point for Nitron
//
// Commands:
//   nitron build   — Build APK from current project (Phase 1: config + validate only)
//   nitron init    — Scaffold a new project (Phase 3)
//   nitron dev     — Start local preview server (Phase 3)

import { Command } from 'commander'
import { readConfig } from './config.js'
import { validateConfig, validateProject } from './validator.js'
import { logger } from './logger.js'

const PHASE_1_STEPS = 4

const program = new Command()

program
  .name('nitron')
  .description('Convert HTML/CSS/JS into Android APK — zero Android knowledge required')
  .version('0.1.0')

// ─── BUILD COMMAND ───────────────────────────────────────────────
program
  .command('build')
  .description('Build APK from the current project')
  .option('--debug', 'Enable verbose debug output', false)
  .action(async (options: { debug: boolean }) => {
    const projectDir = process.cwd()

    logger.banner()

    // Step 1: Read config
    logger.step(1, PHASE_1_STEPS, 'Reading configuration...')

    let config
    try {
      config = await readConfig(projectDir)
    } catch (err: any) {
      logger.error(err.message)
      process.exit(1)
    }

    logger.success('Configuration loaded')

    // Step 2: Validate config
    logger.step(2, PHASE_1_STEPS, 'Validating project...')

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

    // Step 3: Display parsed config
    logger.step(3, PHASE_1_STEPS, 'Resolved configuration:')
    logger.blank()
    logger.config('App Name', config.name)
    logger.config('Package ID', config.packageId)
    logger.config('Version', config.version)
    logger.config('Entry', config.entry)
    logger.config('Orientation', config.orientation)
    logger.config('Status Bar', config.statusBar ? 'visible' : 'hidden')
    logger.config('Permissions', config.permissions.length > 0 ? config.permissions.join(', ') : 'none')
    logger.config('Icon', config.icon ?? 'default')
    logger.blank()

    // Step 4: Build pipeline placeholder (Phase 2 will implement this)
    logger.step(4, PHASE_1_STEPS, 'Building APK...')
    logger.warn('Build pipeline not yet implemented — coming in Phase 2')

    if (options.debug) {
      logger.blank()
      logger.info('Debug: Full config object:')
      console.log(JSON.stringify(config, null, 2))
    }
  })

// ─── INIT COMMAND (Phase 3) ──────────────────────────────────────
program
  .command('init [name]')
  .description('Create a new Nitron project')
  .action(async (name?: string) => {
    logger.banner()
    logger.warn('Init command not yet implemented — coming in Phase 3')
  })

// ─── DEV COMMAND (Phase 3) ───────────────────────────────────────
program
  .command('dev')
  .description('Start local preview server with hot reload')
  .action(async () => {
    logger.banner()
    logger.warn('Dev server not yet implemented — coming in Phase 3')
  })

// ─── Parse and run ──────────────────────────────────────────────
program.parse()
