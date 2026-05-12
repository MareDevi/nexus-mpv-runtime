#!/usr/bin/env bash
set -euo pipefail

target="${1:?target is required}"
mpv_dir="${2:?mpv checkout path is required}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
prefix="${repo_root}/stage/${target}"

brew update
brew install \
  ffmpeg \
  jpeg-turbo \
  libass \
  libarchive \
  libplacebo \
  luajit \
  meson \
  ninja \
  pkg-config

cd "${mpv_dir}"
meson setup build \
  --prefix="${prefix}" \
  --libdir=lib \
  --buildtype=release \
  -Dlibmpv=true \
  -Ddefault_library=shared \
  -Dtests=false
meson compile -C build
meson install -C build
