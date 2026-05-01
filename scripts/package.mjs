// Builds a portable folder under dist/<platform>/:
//   dist/<platform>/app/node[.exe]               — the Node runtime
//   dist/<platform>/app/build/                   — compiled JS
//   dist/<platform>/app/node_modules/            — fresh production deps (target-specific native bindings)
//   dist/<platform>/app/prisma/migrations/       — migration .sql files
//   dist/<platform>/app/package.json             — needed for "type":"module"
//   dist/<platform>/d.bat or dist/<platform>/d   — launcher
//
// The launcher invokes the bundled node on build/index.js and forwards args.
// Native modules and ESM dynamic imports work because nothing is virtualised.
//
// Defaults: target = host platform, embedded node = the running node.
// Cross-build (e.g. Linux host → Windows dist):
//   node scripts/package.mjs --target=win32 --node-bin=/path/to/node.exe

import { execSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')

const { values: args } = parseArgs({
	options: {
		target: { type: 'string' },
		'node-bin': { type: 'string' },
	},
})

const target = args.target ?? process.platform
const nodeBin = args['node-bin'] ?? process.execPath

if (target !== 'win32' && target !== 'linux') {
	throw new Error(`Unsupported target: ${target} (expected 'win32' or 'linux')`)
}

const isWindowsTarget = target === 'win32'
const platformDir = isWindowsTarget ? 'win' : 'linux'
const nodeBinaryName = isWindowsTarget ? 'node.exe' : 'node'
const launcherName = isWindowsTarget ? 'd.bat' : 'd'

const outDir = path.join(root, 'dist', platformDir)
const appDir = path.join(outDir, 'app')

console.log(`Cleaning ${outDir}...`)
// maxRetries handles Windows file locks / read-only attributes that occasionally
// linger on freshly-installed node_modules from a previous build.
fs.rmSync(outDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
fs.mkdirSync(appDir, { recursive: true })

console.log('Copying app files...')
for (const item of ['build', 'prisma', 'package.json', 'package-lock.json']) {
	fs.cpSync(path.join(root, item), path.join(appDir, item), { recursive: true })
}

console.log(`Installing production dependencies (target ${target})...`)
// Use the running (host) node's bundled npm. nodeBin may differ — that's just
// the binary we embed; we don't execute it here.
const hostNodeDir = path.dirname(process.execPath)
const env = { ...process.env, PATH: `${hostNodeDir}${path.delimiter}${process.env.PATH ?? ''}` }

if (target === process.platform) {
	execSync('npm ci --omit=dev', { cwd: appDir, stdio: 'inherit', env })
} else {
	// Cross-install: skip install scripts because some run the package against
	// the host node to verify the binary loads (e.g. xxhash-addon's install.js),
	// which fails for a foreign-platform binary. --os/--cpu filter optional deps;
	// npm_config_platform/arch get propagated to scripts and to node-gyp-build's
	// runtime resolver.
	env.npm_config_platform = target
	env.npm_config_arch = 'x64'
	execSync(`npm ci --omit=dev --ignore-scripts --os=${target} --cpu=x64`, { cwd: appDir, stdio: 'inherit', env })

	// For packages whose install script normally runs prebuild-install (e.g.
	// better-sqlite3 — no bundled prebuilds, fetched per-platform), invoke it
	// manually with target flags. node-gyp-build packages (e.g. xxhash-addon)
	// ship every prebuild in the tarball and pick at runtime, so they need
	// nothing here.
	const modulesDir = path.join(appDir, 'node_modules')
	const prebuildInstallBin = path.join(modulesDir, 'prebuild-install', 'bin.js')
	if (!fs.existsSync(prebuildInstallBin)) {
		throw new Error(`prebuild-install not found at ${prebuildInstallBin} — it should have been hoisted by npm`)
	}
	for (const pkgPath of findPrebuildInstallPackages(modulesDir)) {
		console.log(`  fetching native binary for ${path.relative(modulesDir, pkgPath)} (${target}-x64)...`)
		execSync(`"${process.execPath}" "${prebuildInstallBin}" --platform=${target} --arch=x64`, {
			cwd: pkgPath,
			stdio: 'inherit',
			env,
		})
	}
}

console.log('Tracing reachable files with @vercel/nft...')
// Walk the import graph from the entry scripts and keep only files that are
// actually reached. This drops everything pulled in by @prisma/client's
// optional peer on `prisma` (the CLI) — @prisma/engines, @prisma/studio-core,
// @prisma/dev, effect, mysql2, postgres, react-dom, etc. — without resorting
// to --legacy-peer-deps. Also picks just the sqlite Prisma WASM dialect.
const { nodeFileTrace } = await import(`${pathToFileURL(path.join(root, 'node_modules', '@vercel', 'nft', 'out', 'index.js')).href}`)
// nft resolves entry paths against process.cwd() (not against `base`), so we
// pass absolute paths inside appDir to make sure it traces the staged copy
// and its node_modules — not the project root's.
const entries = ['build/index.js', 'build/migrate.js', 'build/prisma.js'].map((e) => path.join(appDir, e))
const { fileList, warnings } = await nodeFileTrace(entries, { base: appDir })
for (const w of warnings) console.warn(`  nft: ${String(w.message ?? w).split('\n')[0]}`)

const keep = new Set([...fileList].map((f) => path.resolve(appDir, f)))

if (target !== process.platform) {
	// nft running on the host picks the host's native binary for node-gyp-build
	// packages (xxhash-addon ships every prebuild and selects at runtime via
	// process.platform). For cross-builds, keep every prebuilds/ file so the
	// target's binary survives. Cheap — total ~1MB.
	walkFiles(path.join(appDir, 'node_modules'), (full, name, dir) => {
		if (dir.split(path.sep).includes('prebuilds')) keep.add(full)
	})
}

let removed = 0
walkFiles(path.join(appDir, 'node_modules'), (full) => {
	if (!keep.has(full)) { fs.rmSync(full); removed++ }
})
removeEmptyDirs(path.join(appDir, 'node_modules'))
console.log(`  kept ${keep.size}, removed ${removed} files`)

console.log(`Copying Node runtime (${nodeBin})...`)
const embeddedNode = path.join(appDir, nodeBinaryName)
fs.copyFileSync(nodeBin, embeddedNode)

if (!isWindowsTarget && process.platform === 'linux') {
	// nodejs.org ships the Linux binary with debug_info; strip it (~17MB savings).
	try {
		execSync(`strip "${embeddedNode}"`, { stdio: 'inherit' })
	} catch {
		console.log('  (skipping strip — binutils `strip` not on PATH)')
	}
}

console.log('Writing launcher...')
const launcherPath = path.join(outDir, launcherName)
if (isWindowsTarget) {
	// %~dp0 = directory of the .bat (with trailing backslash)
	fs.writeFileSync(launcherPath, '@echo off\r\n"%~dp0app\\node.exe" "%~dp0app\\build\\index.js" %*\r\n')
} else {
	fs.writeFileSync(
		launcherPath,
		'#!/bin/sh\nDIR="$(cd "$(dirname "$0")" && pwd)"\nexec "$DIR/app/node" "$DIR/app/build/index.js" "$@"\n'
	)
	fs.chmodSync(launcherPath, 0o755)
}

console.log(`\nDone. Run: ${launcherPath} <args>`)

function walkFiles(dir, fn) {
	if (!fs.existsSync(dir)) return
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) walkFiles(full, fn)
		else if (entry.isFile()) fn(full, entry.name, dir)
	}
}

function removeEmptyDirs(dir) {
	if (!fs.existsSync(dir)) return
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) removeEmptyDirs(path.join(dir, entry.name))
	}
	if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir)
}

function findPrebuildInstallPackages(modulesDir) {
	const found = []
	walk(modulesDir)
	return found

	function walk(dir) {
		if (!fs.existsSync(dir)) return
		for (const name of fs.readdirSync(dir)) {
			if (name.startsWith('.')) continue
			if (name.startsWith('@')) {
				walk(path.join(dir, name))
				continue
			}
			const pkgDir = path.join(dir, name)
			const pkgJsonPath = path.join(pkgDir, 'package.json')
			if (fs.existsSync(pkgJsonPath)) {
				try {
					const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
					if (pkg.scripts?.install?.includes('prebuild-install')) found.push(pkgDir)
				} catch {}
			}
			walk(path.join(pkgDir, 'node_modules'))
		}
	}
}
