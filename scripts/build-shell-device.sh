#!/usr/bin/env bash
# scripts/build-shell-device.sh
#
# Cross-compiles template-src/shell/src/*.m into a real arm64 Mach-O
# executable using the toolchain produced by build-ios-toolchain.sh, then
# assembles it into a bare (unsigned) NitronShell.app and zips it to
# template/shell/shell-device.zip — the exact artifact
# src/engines/initron/build.ts already expects. No changes needed
# anywhere else in the pipeline.
#
# Run build-ios-toolchain.sh once first. This script can be re-run any
# time the shell's Objective-C source changes.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLCHAIN="$ROOT_DIR/toolchain"
SHELL_SRC="$ROOT_DIR/template-src/shell"
SDK_VERSION="${NITRON_IOS_SDK_VERSION:-16.5}"
MIN_IOS_VERSION="${NITRON_IOS_MIN_VERSION:-13.0}"
BUILD_DIR="$ROOT_DIR/.shell-build"

CLANG="$TOOLCHAIN/bin/arm-apple-darwin11-clang"
SDK="$TOOLCHAIN/SDK/iPhoneOS${SDK_VERSION}.sdk"

if [ ! -x "$CLANG" ]; then
  echo "Toolchain not found at $CLANG"
  echo "Run scripts/build-ios-toolchain.sh first."
  exit 1
fi

echo "==> Compiling shell Objective-C sources (arm64, iOS ${MIN_IOS_VERSION}+)"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/NitronShell.app"

# -fobjc-arc: modern ARC memory management (matches how the source is written)
# -miphoneos-version-min: sets the deployment target baked into the binary
# -fuse-ld=<absolute path>: REQUIRED. clang's Darwin driver only auto-finds
#   a linker literally named "ld" via -B search paths; cctools-port names
#   its linker "arm-apple-darwin11-ld", so without this, clang silently
#   falls back to the host's own /usr/bin/ld (GNU ld) — which does not
#   understand Apple-style linker flags at all and fails with a cryptic
#   "unrecognised emulation mode: llvm" error.
"$CLANG" \
  -fuse-ld="$TOOLCHAIN/bin/arm-apple-darwin11-ld" \
  -isysroot "$SDK" \
  -miphoneos-version-min="$MIN_IOS_VERSION" \
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

echo "==> Ad-hoc signing with ldid (placeholder — real signing happens per-app via zsign at build time)"
"$TOOLCHAIN/bin/ldid" -S "$BUILD_DIR/NitronShell.app/NitronShell"

echo "==> Packaging shell-device.zip"
mkdir -p "$ROOT_DIR/template/shell"
( cd "$BUILD_DIR" && zip -rq "$ROOT_DIR/template/shell/shell-device.zip" NitronShell.app )

rm -rf "$BUILD_DIR"

echo ""
echo "==> Done: template/shell/shell-device.zip"
echo "    Run: nitron build --target ios --project <your-test-project>"
