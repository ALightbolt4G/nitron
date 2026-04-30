// dev.ts — Local preview server for Nitron projects
//
// Starts a lightweight HTTP server with live reload for the current project.
// Excludes internal files from triggering reloads.

import { join } from 'node:path'
import bs from 'browser-sync'
import { logger } from './logger.js'

export async function startDevServer(projectDir: string) {
  logger.blank()
  logger.info('Starting Nitron preview server...')
  logger.blank()

  const bsInstance = bs.create()

  bsInstance.init({
    server: projectDir,
    port: 8080,
    open: true,
    ignore: ['node_modules', 'dist', '.git', 'app.js', 'package.json'],
    files: [projectDir],
    logLevel: 'silent',
    notify: false,
    single: true, // serves index.html for 404s
    ui: false
  })

  logger.success('Dev server running at http://localhost:8080')
  logger.info('Watching for file changes...')
  logger.blank()
  logger.warn('Note: Configuration changes (app.js) require restarting the server.')
}
