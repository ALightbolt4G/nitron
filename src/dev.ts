// dev.ts — Local preview server for Nitron projects
//
// Starts a lightweight HTTP server with live reload for the current project.
// Excludes internal files from triggering reloads.

import { createServer } from 'node:http'
import { join, extname } from 'node:path'
import { readFile } from 'node:fs/promises'
import chokidar from 'chokidar'
import { WebSocketServer } from 'ws'
import open from 'open'
import serveHandler from 'serve-handler'
import { logger } from './logger.js'

const INJECT_SCRIPT = (port: number) => `\n<!-- Nitron Live Reload -->
<script>
  const ws = new WebSocket('ws://localhost:${port}')
  ws.onmessage = (e) => { if (e.data === 'reload') window.location.reload() }
</script>\n`

export async function startDevServer(projectDir: string, port = 3000) {
  logger.blank()
  logger.info('Starting Nitron preview server...')
  logger.blank()

  const server = createServer(async (req, res) => {
    // Inject live-reload script into HTML files
    if (req.url && (req.url.endsWith('/') || req.url.endsWith('.html'))) {
      try {
        let filePath = join(projectDir, req.url.endsWith('/') ? 'index.html' : req.url)
        // serve-handler logic fallback for clean URLs might be needed, but let's just do a simple check
        let content = await readFile(filePath, 'utf-8')
        content = content.replace('</body>', INJECT_SCRIPT(port) + '</body>')
        res.setHeader('Content-Type', 'text/html')
        res.end(content)
        return
      } catch (e) {
        // If file not found, let serveHandler handle the 404 or directory listing
      }
    }
    
    // Serve static files
    await serveHandler(req, res, {
      public: projectDir,
      cleanUrls: true
    })
  })

  server.on('error', (e: any) => {
    if (e.code === 'EADDRINUSE') {
      logger.error(`Port ${port} is already in use.`)
      logger.warn(`Try specifying a different port: npx nitron dev --port ${port + 1}`)
      process.exit(1)
    }
    logger.error(e)
    process.exit(1)
  })

  const wss = new WebSocketServer({ server })

  server.listen(port, () => {
    logger.success(`Dev server running at http://localhost:${port}`)
    logger.info('Watching for file changes...')
    logger.blank()
    logger.warn('Note: Configuration changes (app.js) require restarting the server.')
    
    open(`http://localhost:${port}`)
  })

  const watcher = chokidar.watch(projectDir, {
    ignored: [/node_modules/, /dist/, /\.git/, /app\.js/, /package\.json/],
    ignoreInitial: true
  })

  watcher.on('all', () => {
    wss.clients.forEach(client => {
      if (client.readyState === 1) client.send('reload')
    })
  })
}
