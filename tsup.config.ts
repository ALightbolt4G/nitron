import { defineConfig } from 'tsup'

export default defineConfig([
  // CLI entry — ESM only, with shebang
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    target: 'node18',
    platform: 'node',
    shims: true,
    clean: true,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
  // Library entry — ESM + CJS dual output with type declarations
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    target: 'node18',
    platform: 'node',
    dts: true,
    clean: false, // don't clean dist again, CLI output is already there
  },
])
