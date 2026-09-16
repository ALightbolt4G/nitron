#!/usr/bin/env bash
# scripts/build-ios-toolchain.sh
#
# Builds the complete Linux → iOS cross-compilation toolchain, with zero
# macOS/Xcode involved at any point:
#
#   1. apple-libtapi   — reads the .tbd stub files present in any SDK from
#                         Xcode 7 onward. Needs a slice of LLVM/Clang, which
#                         is why this step is the slow one.
#   2. cctools-port     — Apple's own cctools + ld64, ported to Linux.
#                         Apple's original source is APSL-2.0 (open source);
#                         this port just makes it build outside Darwin.
#   3. ldid             — ad-hoc / real Mach-O code signing without
#                         Apple's codesign. Built automatically as part of
#                         cctools-port's usage_examples/ios_toolchain script.
#   4. iOS SDK          — headers + .tbd stub libraries for UIKit, WebKit,
#                         Foundation, etc. Pulled from theos/sdks, a
#                         community mirror — no Apple ID, no Xcode download
#                         needed.
#
# Output: ./toolchain/  — self-contained, reusable across every future
# `nitron build --target ios`. You only re-run this script if you want to
# bump the iOS SDK version.
#
# Hardware note: step 1 (TAPI) compiles a subset of LLVM. On a single CPU
# core this can take HOURS. On a normal multi-core machine (4+ cores) it
# typically finishes in 10-20 minutes. Set JOBS below to your core count.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="$ROOT_DIR/.toolchain-build"
OUT_DIR="$ROOT_DIR/toolchain"
SDK_VERSION="${NITRON_IOS_SDK_VERSION:-16.5}"
JOBS="${JOBS:-$(nproc 2>/dev/null || echo 2)}"

echo "==> Building Nitron iOS toolchain (SDK ${SDK_VERSION}, ${JOBS} parallel jobs)"
mkdir -p "$WORK_DIR" "$OUT_DIR"
cd "$WORK_DIR"

# ─── 0. System dependencies ─────────────────────────────────────────
echo "==> Installing build dependencies (requires sudo)"
sudo apt-get update -y
sudo apt-get install -y \
  clang llvm lld cmake automake autogen libtool \
  libssl-dev libxml2-dev uuid-dev git xz-utils zip unzip python3 pkg-config

export LLVM_DSYMUTIL="$(command -v llvm-dsymutil || command -v dsymutil)"

# ─── 1. apple-libtapi (needed for .tbd stub files) ──────────────────
if [ ! -d apple-libtapi ]; then
  git clone https://github.com/tpoechtrager/apple-libtapi.git
fi
if [ ! -f "$OUT_DIR/lib/libtapi.so" ] && [ ! -f "$OUT_DIR/lib/libtapi.a" ]; then
  echo "==> Building apple-libtapi (this is the slow step)"
  cd apple-libtapi
  INSTALLPREFIX="$OUT_DIR" ./build.sh
  ./install.sh
  cd ..
else
  echo "==> apple-libtapi already built, skipping"
fi

# ─── 2. iOS SDK (community-maintained, no Xcode/Apple ID needed) ───
SDK_DIR="$WORK_DIR/iPhoneOS${SDK_VERSION}.sdk"
if [ ! -d "$SDK_DIR" ]; then
  echo "==> Fetching iOS ${SDK_VERSION} SDK from theos/sdks"
  if [ ! -d theos-sdks ]; then
    git clone --depth 1 --filter=blob:none --sparse https://github.com/theos/sdks.git theos-sdks
  fi
  (cd theos-sdks && git sparse-checkout set "iPhoneOS${SDK_VERSION}.sdk")
  cp -r "theos-sdks/iPhoneOS${SDK_VERSION}.sdk" "$SDK_DIR"
fi

echo "==> Packaging SDK for cctools-port"
tar -cf - -C "$WORK_DIR" "iPhoneOS${SDK_VERSION}.sdk" | xz -T0 -6 -c - > "$WORK_DIR/iPhoneOS${SDK_VERSION}.sdk.tar.xz"

# ─── 3. cctools-port (ld64, lipo, ar, ldid) ─────────────────────────
if [ ! -d cctools-port ]; then
  git clone https://github.com/tpoechtrager/cctools-port.git
fi

echo "==> Building cctools-port + ld64 + ldid"
cd cctools-port/usage_examples/ios_toolchain
rm -rf target build
JOBS="$JOBS" LLVM_DSYMUTIL="$LLVM_DSYMUTIL" \
  ./build.sh "$WORK_DIR/iPhoneOS${SDK_VERSION}.sdk.tar.xz" arm64

cp -r target/* "$OUT_DIR/"
cd "$WORK_DIR"

# ─── 4. zsign (already vendored, but rebuild here if missing) ───────
if [ ! -f "$OUT_DIR/bin/zsign" ]; then
  if [ ! -d zsign ]; then
    git clone --recursive https://github.com/zhlynn/zsign.git
  fi
  cd zsign/build/linux && make -j"$JOBS"
  mkdir -p "$OUT_DIR/bin"
  cp ../../bin/zsign "$OUT_DIR/bin/zsign"
  cd "$WORK_DIR"
fi

echo ""
echo "==> Toolchain ready at: $OUT_DIR"
echo "    - $OUT_DIR/bin/arm-apple-darwin11-clang   (compiler)"
echo "    - $OUT_DIR/bin/lipo, ar, ...              (cctools)"
echo "    - $OUT_DIR/bin/ldid                       (ad-hoc signing)"
echo "    - $OUT_DIR/bin/zsign                      (real cert signing)"
echo "    - $OUT_DIR/SDK/iPhoneOS${SDK_VERSION}.sdk  (headers + .tbd stubs)"
echo ""
echo "Next: run scripts/build-shell-device.sh to compile the WKWebView shell."
