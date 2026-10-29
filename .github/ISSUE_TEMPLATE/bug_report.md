---
name: 'Bug report'
about: 'Report a bug, build error, or runtime issue'
title: '[Bug]: '
labels: ['bug']
assignees: ''
---

> **Security Notice:** Never paste private keys, keystore passwords, `.p12` certificates, or secrets.

### Describe the Bug
A clear and concise description of what went wrong.

### Target Platform
- [ ] Android APK (`nitron build`)
- [ ] Android AAB (`nitron build --target aab`)
- [ ] iOS Device IPA (`nitron build --target ios`)
- [ ] iOS Simulator App (`nitron build --target ios-simulator`)
- [ ] PWA (`nitron build --target pwa`)
- [ ] Local Dev Server (`nitron dev`)

### Environment & Versions
- **OS & Architecture:** (e.g., Windows 11, WSL2 Ubuntu 24.04, macOS 15)
- **Node.js:** (run `node -v`)
- **Java / JDK:** (run `javac -version` and `java -version`)
- **Nitron version:** (run `npx nitron --version`)
- **Frontend Framework & Version:** (e.g., Vite 5.4, Next.js 14.2, Vanilla HTML)

### Project Configuration (`nitron.config.json`)
```json
// Paste your nitron.config.json here (omit sensitive values)
```

### Steps to Reproduce
1. Setup project with `...`
2. Run build command `...`
3. Observe error or unexpected behavior: `...`

### Expected Behavior
A clear description of what you expected to happen instead.

### Terminal & Error Logs
<details>
<summary>Click to expand terminal logs</summary>

```text
// Paste the complete terminal output or stack trace here
```

</details>

### Device / Runtime Details (If runtime failure in WebView)
- **Device / Simulator:** (e.g., Google Pixel 8, Samsung A54, iPhone 15)
- **OS Version:** (e.g., Android 14, Android 16 API 36, iOS 17.5)
- **Runtime symptom:** (e.g., white screen, bridge call failed, navigation blocked)
