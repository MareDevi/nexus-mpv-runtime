# Nexus mpv Runtime

This repository builds Nexus-owned mpv runtime artifacts for the Nexus desktop app.

It is intended to be split into its own GitHub repository. The workflow is manually triggered and takes an official mpv release tag, for example:

```text
v0.41.0
```

Artifacts are published with paths that can be unpacked from the Nexus app repository root:

```text
src-tauri/libs/mpv/<target-triple>/
src-tauri/libs/mpv-runtime.<target-triple>.json
```

## GitHub Workflow

Run:

```text
Actions -> Build mpv runtime -> Run workflow
```

Inputs:

- `mpv_tag`: required official mpv release tag, such as `v0.41.0`.
- `create_release`: whether to create a GitHub Release in this runtime repository.

The workflow builds:

- `x86_64-unknown-linux-gnu`
- `aarch64-apple-darwin`
- `x86_64-apple-darwin`
- `x86_64-pc-windows-msvc`

## Output Names

```text
nexus-mpv-runtime-x86_64-unknown-linux-gnu.tar.gz
nexus-mpv-runtime-aarch64-apple-darwin.tar.gz
nexus-mpv-runtime-x86_64-apple-darwin.tar.gz
nexus-mpv-runtime-x86_64-pc-windows-msvc.zip
checksums.sha256
```

## Consume From Nexus

Download and unpack the artifact from the Nexus app repository root. Then run:

```bash
bun run mpv:sync-runtime -- --target x86_64-unknown-linux-gnu
cd src-tauri
cargo check
```

The Nexus app repository should commit manifests and scripts, not large runtime binaries.
