#!/usr/bin/env bash
set -euo pipefail

target="${1:?target is required}"
mpv_dir="${2:?mpv checkout path is required}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
prefix="${repo_root}/stage/${target}"

sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  build-essential \
  git \
  libarchive-tools \
  libasound2-dev \
  libass-dev \
  libavcodec-dev \
  libavdevice-dev \
  libavfilter-dev \
  libavformat-dev \
  libavutil-dev \
  libbluray-dev \
  libdrm-dev \
  libegl1-mesa-dev \
  libjpeg-dev \
  liblua5.2-dev \
  libplacebo-dev \
  libswresample-dev \
  libswscale-dev \
  libuchardet-dev \
  libva-dev \
  libvdpau-dev \
  libwayland-dev \
  libx11-dev \
  libxcb1-dev \
  libxext-dev \
  libxinerama-dev \
  libxpresent-dev \
  libxrandr-dev \
  libxss-dev \
  libxv-dev \
  meson \
  ninja-build \
  pkg-config \
  python3 \
  wayland-protocols

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
