#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = parseArgs(process.argv.slice(2));
const target = required(args.target, "--target");
const mpvTag = required(args.mpv_tag, "--mpv-tag");
const archive = required(args.archive, "--archive");
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stageDir = join(repoRoot, "stage", target);
const outputRoot = join(repoRoot, "runtime", target);
const nexusRuntimeDir = join(outputRoot, "src-tauri", "libs", "mpv", target);
const manifestPath = join(
	outputRoot,
	"src-tauri",
	"libs",
	`mpv-runtime.${target}.json`,
);
const distDir = join(repoRoot, "dist");

rmSync(outputRoot, { force: true, recursive: true });
mkdirSync(nexusRuntimeDir, { recursive: true });
mkdirSync(dirname(manifestPath), { recursive: true });
mkdirSync(distDir, { recursive: true });

const copied = collectRuntimeFiles(target, stageDir, nexusRuntimeDir);

if (target.includes("linux")) {
	fixLinuxRpath(nexusRuntimeDir);
}

if (copied.length === 0) {
	throw new Error(`No runtime files collected for ${target} from ${stageDir}`);
}

const manifest = {
	target,
	mpvTag,
	runtimeDir: `src-tauri/libs/mpv/${target}`,
	files: copied
		.sort((left, right) => left.path.localeCompare(right.path))
		.map((file) => ({
			path: file.path,
			role: file.role,
			size: statSync(join(nexusRuntimeDir, file.path)).size,
			sha256: sha256(join(nexusRuntimeDir, file.path)),
		})),
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`);

const archiveName = `nexus-mpv-runtime-${target}.${archive}`;
const archivePath = join(distDir, archiveName);
rmSync(archivePath, { force: true });

if (archive === "zip") {
	const sevenZip = [
		"C:\\Program Files\\7-Zip\\7z.exe",
		"C:\\Program Files (x86)\\7-Zip\\7z.exe",
	].find((p) => existsSync(p));

	if (sevenZip) {
		run(sevenZip, ["a", "-tzip", archivePath, "src-tauri"], outputRoot);
	} else {
		run("powershell.exe", [
			"-NoProfile",
			"-Command",
			`Compress-Archive -Path '${join(outputRoot, "src-tauri")}' -DestinationPath '${archivePath}'`,
		]);
	}
} else if (archive === "tar.gz") {
	run("tar", ["-czf", archivePath, "src-tauri"], outputRoot);
} else {
	throw new Error(`Unsupported archive type: ${archive}`);
}

console.log(`Wrote ${archivePath}`);

function collectRuntimeFiles(targetTriple, sourceRoot, destinationRoot) {
	if (targetTriple.includes("linux")) {
		return collectLinux(sourceRoot, destinationRoot);
	}

	if (targetTriple.includes("apple-darwin")) {
		return collectMacos(sourceRoot, destinationRoot);
	}

	if (targetTriple.includes("windows")) {
		return collectWindows(sourceRoot, destinationRoot);
	}

	throw new Error(`Unsupported target: ${targetTriple}`);
}

function collectLinux(sourceRoot, destinationRoot) {
	const libDir = join(sourceRoot, "lib");
	const files = [];
	const mpvLib = findFirst(libDir, /^libmpv\.so(\.|$)/);

	if (!mpvLib) {
		throw new Error(`Missing libmpv.so* under ${libDir}`);
	}

	copyAs(mpvLib, destinationRoot, "libmpv.so", "link-runtime", files);

	for (const dependency of lddDependencies(mpvLib)) {
		if (shouldSkipLinuxDependency(dependency)) {
			continue;
		}

		copyAs(
			dependency,
			destinationRoot,
			basename(dependency),
			"runtime-dependency",
			files,
		);
	}

	return files;
}

function collectMacos(sourceRoot, destinationRoot) {
	const libDir = join(sourceRoot, "lib");
	const files = [];
	const mpvLib = findFirst(libDir, /^libmpv.*\.dylib$/);

	if (!mpvLib) {
		throw new Error(`Missing libmpv*.dylib under ${libDir}`);
	}

	copyAs(mpvLib, destinationRoot, "libmpv.dylib", "link-runtime", files);

	for (const dependency of otoolDependencies(mpvLib)) {
		if (
			!dependency.startsWith("/opt/homebrew/") &&
			!dependency.startsWith("/usr/local/")
		) {
			continue;
		}

		copyAs(
			dependency,
			destinationRoot,
			basename(dependency),
			"runtime-dependency",
			files,
		);
	}

	return files;
}

function collectWindows(sourceRoot, destinationRoot) {
	const files = [];
	const binDir = join(sourceRoot, "bin");
	const libDir = join(sourceRoot, "lib");
	const mpvDll = findFirst(binDir, /^(lib)?mpv-2\.dll$/i);
	const importLib = findFirst(libDir, /^mpv\.lib$/i);

	if (!mpvDll) {
		throw new Error(`Missing mpv DLL under ${binDir}`);
	}

	copyAs(mpvDll, destinationRoot, basename(mpvDll), "runtime", files);

	if (importLib) {
		copyAs(importLib, destinationRoot, "mpv.lib", "link", files);
	} else {
		throw new Error(`Missing MSVC mpv.lib under ${libDir}`);
	}

	for (const dependency of dllDependencies(mpvDll)) {
		if (!existsSync(dependency)) {
			console.warn(`Warning: skipping missing dependency ${dependency}`);
			continue;
		}

		copyAs(
			dependency,
			destinationRoot,
			basename(dependency),
			"runtime-dependency",
			files,
		);
	}

	return files;
}

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

function copyAs(source, destinationRoot, fileName, role, files) {
	const destination = join(destinationRoot, fileName);
	mkdirSync(dirname(destination), { recursive: true });
	copyFileSync(source, destination);
	files.push({ path: fileName, role });
}

function findFirst(root, pattern) {
	if (!existsSync(root)) {
		return null;
	}

	for (const file of walk(root)) {
		if (pattern.test(basename(file))) {
			return file;
		}
	}

	return null;
}

function* walk(root) {
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		const fullPath = join(root, entry.name);
		if (entry.isDirectory()) {
			yield* walk(fullPath);
		} else if (entry.isFile()) {
			yield fullPath;
		}
	}
}

function lddDependencies(file) {
	const output = run("ldd", [file]).stdout;
	const dependencies = [];

	for (const line of output.split("\n")) {
		const match = line.match(/=>\s+(\/\S+)/) ?? line.match(/^\s*(\/\S+)/);
		if (match?.[1]) {
			dependencies.push(match[1]);
		}
	}

	return [...new Set(dependencies)];
}

function otoolDependencies(file) {
	const output = run("otool", ["-L", file]).stdout;
	return output
		.split("\n")
		.slice(1)
		.map((line) => line.trim().split(/\s+/)[0])
		.filter(Boolean);
}

function dllDependencies(file) {
	const output = run("ldd", [file]).stdout;
	const dependencies = [];

	for (const line of output.split("\n")) {
		const match = line.match(/=>\s+(\/\S+)/);
		if (match?.[1]?.toLowerCase().includes("/mingw64/bin/")) {
			const msysPath = match[1];
			let winPath = msysPath;
			try {
				winPath = run("cygpath", ["-w", msysPath]).stdout.trim();
			} catch {
				// cygpath not available, keep original path
			}
			dependencies.push(winPath);
		}
	}

	return [...new Set(dependencies)];
}

function fixLinuxRpath(destinationRoot) {
	for (const file of walk(destinationRoot)) {
		if (basename(file).includes(".so")) {
			console.log(`Setting RPATH for ${file}`);
			run("patchelf", ["--set-rpath", "$ORIGIN", file]);
		}
	}
}

function shouldSkipLinuxDependency(file) {
	const name = basename(file);
	return (
		file.startsWith("/lib64/") ||
		name === "linux-vdso.so.1" ||
		name.startsWith("ld-linux") ||
		name.startsWith("libc.so") ||
		name.startsWith("libm.so") ||
		name.startsWith("libdl.so") ||
		name.startsWith("libpthread.so") ||
		name.startsWith("librt.so") ||
		name.startsWith("libgcc_s.so") ||
		name.startsWith("libstdc++.so")
	);
}

function basename(file) {
	return file.split(/[\\/]/).at(-1);
}

function sha256(file) {
	return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function run(command, args, cwd = repoRoot) {
	const result = spawnSync(command, args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});

	if (result.error) {
		throw new Error(
			`${command} ${args.join(" ")} failed: ${result.error.message}`,
		);
	}

	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr}`);
	}

	return result;
}
