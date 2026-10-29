---
name: 'Framework integration / compatibility'
about: 'Report compatibility, recipes, or routing issues with a specific web framework'
title: '[Framework]: <Framework Name> integration'
labels: ['framework', 'documentation']
assignees: ''
---

### Web Framework Information
- **Framework Name:** (e.g. Next.js, Nuxt, SvelteKit, Astro, Remix, Vite React)
- **Framework Version:** (e.g. Next.js 14.2.5, Astro 4.10)
- **Build tool / Bundler:** (e.g. Vite, Webpack, Turbopack)

### Static Build Setup
- **Static Export Command:** (e.g., `npm run build`, `next build && next export`)
- **Output Directory:** (e.g., `out/`, `dist/`, `build/`)
- **Config file snippet:**
```javascript
// next.config.js / astro.config.mjs / vite.config.ts snippet
```

### Nitron Configuration (`nitron.config.json`)
```json
{
  "entry": "out/index.html"
}
```

### Compatibility Status
- [ ] Static pages render correctly
- [ ] Client navigation / routing works
- [ ] Assets (images, fonts, stylesheets) load correctly
- [ ] API `fetch()` requests work
- [ ] `window.Nitron` bridge calls work

### Problem or Discrepancy
Describe any routing issues (e.g., dynamic routes 404 on refresh, missing asset base URL, CORS issues with local origin).

### Proposed Fix or Preset Request
Should Nitron add a built-in preset (`nitron init --preset ...`) or documentation recipe for this framework?
