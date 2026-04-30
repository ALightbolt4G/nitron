// dev.ts — Local preview server for Nitron projects
//
// Starts a lightweight HTTP server with live reload for the current project.
// Excludes internal files from triggering reloads.

import { join } from 'node:path'
import liveServer from 'live-server'
import { logger } from './logger.js'

export async function startDevServer(projectDir: string) {
  logger.blank()
  logger.info('Starting Nitron preview server...')
  logger.blank()

  const params = {
    port: 8080, // Set the server port. Defaults to 8080.
    host: '127.0.0.1', // Set the address to bind to. Defaults to 0.0.0.0 or process.env.IP.
    root: projectDir, // Set root directory that's being served. Defaults to cwd.
    open: true, // When false, it won't load your browser by default.
    ignore: 'node_modules,dist,.git,app.js,package.json', // comma-separated string for paths to ignore
    file: 'index.html', // When set, serve this file (server root relative) for every 404 (useful for single-page applications)
    wait: 100, // Waits for all changes, before reloading. Defaults to 0 sec.
    logLevel: 0, // 0 = errors only, 1 = some, 2 = lots
    middleware: [function(req: any, res: any, next: any) { next() }] // Takes an array of Connect-compatible middleware that are injected into the server middleware stack
  }

  liveServer.start(params)

  logger.success(`Dev server running at http://${params.host}:${params.port}`)
  logger.info('Watching for file changes...')
  logger.blank()
  logger.warn('Note: Configuration changes (app.js) require restarting the server.')
}
