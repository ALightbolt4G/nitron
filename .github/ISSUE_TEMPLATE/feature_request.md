---
name: 'Feature request'
about: 'Suggest an idea, native bridge API, or enhancement for Nitron'
title: '[Feature]: '
labels: ['enhancement']
assignees: ''
---

### Is your feature request related to a problem? Please describe.
A clear and concise description of the problem or limitation you are facing.
Ex: *"I'm always frustrated when I cannot trigger device vibration or haptics from window.Nitron..."*

### Proposed Solution / Feature Description
Describe the solution or feature you'd like to see added to Nitron.

### Proposed API / Config Design
If applicable, show how the JavaScript API or `nitron.config.json` should look:

```javascript
// Proposed window.Nitron API:
await window.Nitron.haptics.impact('medium');
```

```json
// Proposed nitron.config.json additions:
{
  "haptics": true
}
```

### Target Platforms
- [ ] Android (engine `nitronoid`)
- [ ] iOS (engine `initron`)
- [ ] PWA
- [ ] CLI / Dev server tooling

### Alternatives Considered
Describe any alternative solutions or workarounds you've considered.

### Additional Context
Add any other context, mockups, or links to platform documentation (Android Developers or Apple Developer documentation).
