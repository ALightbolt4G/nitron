# Contributing to Nitron

Thanks for helping make Nitron better! Nitron is open source, and every kind of help is welcome: testing, bug reports, documentation, and code.

All contributions are reviewed and merged by the maintainer ([@ALightbolt4G](https://github.com/ALightbolt4G)).

---

## 1. Most needed right now: testing

Nitron builds real apps from many different setups, and we can only test on a few machines. **Testing reports are one of the most valuable contributions you can make**, even if you never write a line of code.

We especially need tests for:

- **Linux and macOS** (Android builds)
- **iOS builds on a real device** (`--target ios`), and on the Simulator (`--target ios-simulator`)
- **Different web frameworks** (React, Vue, Svelte, Next.js static export, Vite, vanilla JS)
- **Different Android versions and devices** (API 21 and up)
- **AAB builds** (`--target aab`) uploaded to Google Play
- **PWA output** (`--target pwa`)

### How to send your test result

Please **open a GitHub Issue** with the title `Test report: <OS> / <target> / <framework>`, using the **Test report** issue template. Send the result whether it **worked or failed**. Successful reports are just as useful, because they tell us what is confirmed to work.

Include:

1. **Your system:** operating system and version (for example Windows 11 + WSL2, Ubuntu 24.04, macOS 15).
2. **Versions:** Node.js version, Java version (`java -version`), and the Nitron version (`npm ls nitron`).
3. **What you built:** the target (`android`, `aab`, `ios`, `ios-simulator`, `pwa`) and the framework.
4. **Where you ran it:** a physical device or emulator, with the Android or iOS version.
5. **The result:** it worked, it partly worked, or it failed. Describe what you saw (for example a white screen, a missing icon, a crash on launch).
6. **Logs:** the full terminal output of the failing command, as text (not a screenshot, if possible).
7. **Screenshots or a screen recording** of the running app, if they help.

> **Never post secrets.** Do not paste keystore files or passwords, `.p12` certificates, provisioning profiles, or the values of `NITRON_IOS_P12_PASSWORD` and similar variables. Remove them from logs before posting.

---

## 2. Reporting bugs

Open an Issue and include:

- Your OS and version
- Node.js version
- The full error message
- Steps to reproduce (a minimal project is ideal)
- What you expected to happen

Please search existing issues first, to avoid duplicates.

**Security problems:** do not open a public issue. Use the repository's **Security** tab and report it privately through a security advisory.

---

## 3. Contributing code

### Workflow

1. Fork the repository.
2. Create a branch: `git checkout -b feat/your-feature` (or `fix/your-fix`).
3. Make your changes. Keep each pull request small and focused on one thing.
4. Build: `npm run build`
5. Test locally: `node dist/cli.js build` against a real project, and describe how you tested in the pull request.
6. Commit with a sign-off (see section 4): `git commit -s -m "feat: your feature"`
7. Push and open a Pull Request.

If you change the Android Java template (`template-src/`), you need a full **JDK 17 or later**, then run `node scripts/prepare-template.js` to rebuild `template/base.apk`. Regular changes to the CLI do not need this.

### Pull request checklist

- [ ] The change builds with `npm run build` and works in a real build
- [ ] The pull request describes what changed and how you tested it (OS, target, framework)
- [ ] Documentation is updated if behavior or options changed (`README.md`, and `ARCHITECTURE.md` for engine changes)
- [ ] No secrets, keystores, certificates, or personal paths are committed
- [ ] No Apple SDKs or other proprietary binaries are committed
- [ ] Any third-party code you add has a license compatible with the GPL, and the license is stated in the pull request

### Review

The maintainer reviews every pull request. Changes may be requested before merging, and some pull requests may be declined if they do not fit the direction of the project. This is never personal, and we will explain the reason.

---

## 4. License of contributions

Nitron is licensed under the **GNU General Public License**, together with the **Nitron Output Exception** (see the [`LICENSE`](LICENSE) file). The exception means that apps you build with Nitron remain yours, and you may distribute them under any terms, including proprietary ones.

By submitting a contribution (a pull request, a patch, or any code), you agree that:

1. Your contribution is licensed under the same terms as the project: the GPL together with the Nitron Output Exception.
2. You wrote the code yourself, or you otherwise have the right to submit it under these terms.
3. You keep the copyright on your contribution, and you grant the project the right to distribute it under these terms.

### Sign your commits (DCO)

To confirm the points above, add a `Signed-off-by` line to every commit by using the `-s` flag:

```bash
git commit -s -m "fix: describe your change"
```

This adds a line like `Signed-off-by: Your Name <you@example.com>`, and it means you agree to the [Developer Certificate of Origin](https://developercertificate.org/). Pull requests with unsigned commits will be asked to fix this before merging.

---

## 5. Be kind

Everyone here is volunteering their time. Please be respectful and patient, give constructive feedback, and assume good intentions. Harassment or abuse of any kind is not tolerated.

Thank you for contributing! ⚡
