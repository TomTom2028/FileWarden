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

// --legacy-peer-deps avoids auto-installing optional peer deps. @prisma/client
// lists `prisma` (the CLI) as an optional peer, which by default drags in
// @prisma/engines, @prisma/studio-core, @prisma/dev, effect, mysql2, postgres,
// react-dom, etc. — none of which the runtime app uses (we use the driver
// adapter and run migrations via better-sqlite3 directly). Saves ~250MB.
if (target === process.platform) {
	execSync('npm ci --omit=dev --legacy-peer-deps', { cwd: appDir, stdio: 'inherit', env })
} else {
	// Cross-install: skip install scripts because some run the package against
	// the host node to verify the binary loads (e.g. xxhash-addon's install.js),
	// which fails for a foreign-platform binary. --os/--cpu filter optional deps;
	// npm_config_platform/arch get propagated to scripts and to node-gyp-build's
	// runtime resolver.
	env.npm_config_platform = target
	env.npm_config_arch = 'x64'
	execSync(`npm ci --omit=dev --ignore-scripts --legacy-peer-deps --os=${target} --cpu=x64`, { cwd: appDir, stdio: 'inherit', env })

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

console.log('Pruning unused files...')
// Source maps aren't loaded at runtime (Node only consults them on errors with
// --enable-source-maps); safe to drop.
pruneFiles(appDir, /\.map$/)
// @prisma/client ships query compilers for every database it supports —
// cockroachdb, mysql, postgresql, sqlserver, sqlite — in fast/small × js/mjs
// variants. We only ever use sqlite. ~60MB savings per platform.
const prismaRuntime = path.join(appDir, 'node_modules', '@prisma', 'client', 'runtime')
if (fs.existsSync(prismaRuntime)) {
	for (const file of fs.readdirSync(prismaRuntime)) {
		const m = /^query_compiler_(?:fast|small)_bg\.([^.]+)\./.exec(file)
		if (m && m[1] !== 'sqlite') fs.rmSync(path.join(prismaRuntime, file), { force: true })
	}
}

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

function pruneFiles(dir, pattern) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) pruneFiles(full, pattern)
		else if (pattern.test(entry.name)) fs.rmSync(full, { force: true })
	}
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
