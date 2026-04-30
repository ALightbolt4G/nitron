// init.ts — Scaffold a new Nitron project interactively
//
// Prompts the user for app details and generates the basic files:
// index.html, style.css, main.js, app.js, and package.json.

import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import prompts from 'prompts'
import { logger } from './logger.js'

export async function initProject(name?: string) {
  logger.blank()
  logger.info('Welcome to Nitron! Let\'s create a new Android app.')
  logger.blank()

  const response = await prompts([
    {
      type: 'text',
      name: 'projectName',
      message: 'Project name (folder name):',
      initial: name || 'my-nitron-app',
      validate: (value) => {
        if (!value.match(/^[a-zA-Z0-9-_]+$/)) {
          return 'Project name can only contain letters, numbers, dashes, and underscores.'
        }
        if (existsSync(join(process.cwd(), value))) {
          return 'Directory already exists.'
        }
        return true
      }
    },
    {
      type: 'text',
      name: 'appName',
      message: 'App display name:',
      initial: prev => prev.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    },
    {
      type: 'text',
      name: 'packageId',
      message: 'Android Package ID (e.g., com.yourname.app):',
      initial: 'com.example.app',
      validate: (value) => {
        if (!value.match(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/)) {
          return 'Invalid package format. Must be lowercase, dot-separated (e.g. com.myname.myapp)'
        }
        return true
      }
    }
  ], {
    onCancel: () => {
      logger.error('Setup cancelled.')
      process.exit(1)
    }
  })

  const { projectName, appName, packageId } = response
  const targetDir = join(process.cwd(), projectName)

  logger.step(1, 1, 'Scaffolding project...')

  await mkdir(targetDir, { recursive: true })

  // Write app.js (Nitron Config)
  await writeFile(join(targetDir, 'app.js'), `import { app } from 'nitron'

app.init({
  name: "${appName}",
  packageId: "${packageId}",
  version: "1.0.0",
  entry: "index.html",
  orientation: "portrait",
  statusBar: true,
  permissions: ["INTERNET"]
})
`)

  // Write index.html
  await writeFile(join(targetDir, 'index.html'), `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${appName}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="container">
    <h1>⚡ Nitron</h1>
    <p>Welcome to your new Android app!</p>
    <button id="helloBtn">Tap Me</button>
  </div>
  <script src="main.js"></script>
</body>
</html>
`)

  // Write style.css
  await writeFile(join(targetDir, 'style.css'), `* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  background-color: #f0f2f5;
  color: #1a1a1a;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  text-align: center;
}

.container {
  background: white;
  padding: 2rem;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

h1 {
  font-size: 2.5rem;
  color: #0070f3;
  margin-bottom: 1rem;
}

button {
  margin-top: 1.5rem;
  padding: 0.75rem 1.5rem;
  font-size: 1.1rem;
  font-weight: bold;
  background-color: #0070f3;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s;
}

button:active {
  background-color: #0051a8;
}
`)

  // Write main.js
  await writeFile(join(targetDir, 'main.js'), `document.getElementById('helloBtn').addEventListener('click', () => {
  alert('Hello from Nitron!')
})
`)

  // Write package.json
  await writeFile(join(targetDir, 'package.json'), `{
  "name": "${projectName}",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "nitron dev",
    "build": "nitron build"
  },
  "dependencies": {
    "nitron": "latest"
  }
}
`)

  logger.success('Project scaffolded successfully!')
  logger.blank()
  logger.info('Next steps:')
  logger.info(`  cd ${projectName}`)
  logger.info(`  npm install`)
  logger.info(`  npm run build`)
  logger.blank()
}
