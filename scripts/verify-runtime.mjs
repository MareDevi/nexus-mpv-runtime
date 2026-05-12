#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = parseArgs(process.argv.slice(2));
const target = required(args.target, "--target");
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(repoRoot, "runtime", target);
const runtimeDir = join(outputRoot, "src-tauri", "libs", "mpv", target);
const manifestPath = join(
	outputRoot,
	"src-tauri",
	"libs",
	`mpv-runtime.${target}.json`,
);

if (!existsSync(manifestPath)) {
	throw new Error(`Missing manifest: ${manifestPath}`);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const paths = new Set(manifest.files.map((file) => file.path));

if (target.includes("linux") && !paths.has("libmpv.so")) {
	throw new Error("Linux runtime is missing libmpv.so");
}

if (target.includes("apple-darwin") && !paths.has("libmpv.dylib")) {
	throw new Error("macOS runtime is missing libmpv.dylib");
}

if (target.includes("windows")) {
	if (!paths.has("mpv.lib")) {
		throw new Error("Windows runtime is missing mpv.lib import artifact");
	}

	if (![...paths].some((file) => /^(lib)?mpv-2\.dll$/i.test(file))) {
		throw new Error("Windows runtime is missing mpv DLL");
	}
}

for (const file of manifest.files) {
	const path = join(runtimeDir, file.path);
	if (!existsSync(path)) {
		throw new Error(`Manifest references missing file: ${path}`);
	}
}

console.log(
	`Verified ${target} runtime manifest with ${manifest.files.length} file(s)`,
);

function parseArgs(argv) {
	const result = {};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (!arg.startsWith("--")) {
			throw new Error(`Unexpected argument: ${arg}`);
		}

		const key = arg.slice(2).replaceAll("-", "_");
		const value = argv[index + 1];
		if (!value || value.startsWith("--")) {
			throw new Error(`Missing value for ${arg}`);
		}

		result[key] = value;
		index += 1;
	}

	return result;
}

function required(value, name) {
	if (!value) {
		throw new Error(`Missing ${name}`);
	}

	return value;
}
