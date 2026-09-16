#!/usr/bin/env bash
# scripts/build-shell-simulator.sh
#
# Compiles template-src/shell/src/*.m directly against the Mac's own
# installed iPhoneSimulator SDK — no .xcodeproj, no xcodegen, since a
# plain clang invocation works identically for either platform. This is
# the ONE piece of the pipeline that still needs to run on macOS: the
# iPhoneSimulator SDK isn't mirrored by the same Linux-friendly source
# (theos/sdks) as the device SDK, so there's no way to cross-compile this
# from Linux the way build-shell-device.sh does.
#
# No signing needed at all — the iOS Simulator does not check code
# signatures, which is exactly why this is the fast path for local
# testing without any Apple Developer account.
#
# Meant to run on a macOS runner (see
# .github/workflows/build-shell-simulator.yml) or a local Mac with Xcode
# command line tools installed. Produces template/shell/shell-simulator.zip
# — the exact artifact src/engines/initron/build.ts already expects.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHELL_SRC="$ROOT_DIR/template-src/shell"
MIN_IOS_VERSION="${NITRON_IOS_MIN_VERSION:-13.0}"
BUILD_DIR="$ROOT_DIR/.shell-build-sim"

if ! command -v xcrun &> /dev/null; then
  echo "xcrun not found — this script must run on macOS with Xcode command line tools installed."
  exit 1
fi

echo "==> Locating iPhoneSimulator SDK"
SDK="$(xcrun --sdk iphonesimulator --show-sdk-path)"
echo "    SDK: $SDK"

echo "==> Compiling shell Objective-C sources (arm64, iOS ${MIN_IOS_VERSION}+ Simulator)"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/NitronShell.app"

clang \
  -target "arm64-apple-ios${MIN_IOS_VERSION}-simulator" \
  -isysroot "$SDK" \
  -fobjc-arc \
  -fmodules \
  -framework UIKit \
  -framework Foundation \
  -framework WebKit \
  -framework CoreGraphics \
  -o "$BUILD_DIR/NitronShell.app/NitronShell" \
  "$SHELL_SRC/src/main.m" \
  "$SHELL_SRC/src/AppDelegate.m" \
  "$SHELL_SRC/src/ViewController.m"

echo "==> Verifying the produced binary"
file "$BUILD_DIR/NitronShell.app/NitronShell"

echo "==> Assembling .app bundle"
cp "$SHELL_SRC/Info.plist" "$BUILD_DIR/NitronShell.app/Info.plist"
mkdir -p "$BUILD_DIR/NitronShell.app/www"
cp "$SHELL_SRC/www/index.html" "$BUILD_DIR/NitronShell.app/www/index.html"

echo "==> Packaging shell-simulator.zip (unsigned — Simulator doesn't check signatures)"
mkdir -p "$ROOT_DIR/template/shell"
( cd "$BUILD_DIR" && zip -rq "$ROOT_DIR/template/shell/shell-simulator.zip" NitronShell.app )

rm -rf "$BUILD_DIR"

echo ""
echo "==> Done: template/shell/shell-simulator.zip"
echo "    Run: nitron build --target ios-simulator --project <your-test-project>"
