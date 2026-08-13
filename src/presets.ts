// presets.ts — Framework presets for Nitron v2.0
//
// Defines default entry points and output directories for popular web frameworks.

export interface FrameworkPreset {
  name: string
  entry: string
  outputDir: string
  buildScript: string
  tips: string[]
}

export const PRESETS: Record<string, FrameworkPreset> = {
  vanilla: {
    name: 'Vanilla HTML/JS',
    entry: 'index.html',
    outputDir: '.',
    buildScript: 'nitron build',
    tips: [
      'Just drop your index.html, CSS, and JS in this folder.',
    ]
  },
  nextjs: {
    name: 'Next.js (Static Export)',
    entry: 'out/index.html',
    outputDir: 'out',
    buildScript: 'next build && nitron build',
    tips: [
      'Make sure you have `output: "export"` in your next.config.js/ts',
      'Image Optimization (next/image) is not supported in static exports unless using a custom loader.',
      'API Routes and Server Actions are not supported in static exports.',
    ]
  },
  vite: {
    name: 'Vite (React, Vue, Svelte)',
    entry: 'dist/index.html',
    outputDir: 'dist',
    buildScript: 'vite build && nitron build',
    tips: [
      'Ensure your base URL in vite.config.ts is set correctly if needed, though Nitron v2.0 handles absolute paths naturally.',
    ]
  },
  react: {
    name: 'Create React App',
    entry: 'build/index.html',
    outputDir: 'build',
    buildScript: 'react-scripts build && nitron build',
    tips: [
      'CRA is deprecated by React. Consider migrating to Vite or Next.js for better performance.',
    ]
  }
}
