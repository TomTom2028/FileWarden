// Builds a portable folder under dist/app:
//   dist/app/node.exe               — the Node runtime
//   dist/app/build/                  — compiled JS
//   dist/app/node_modules/           — production deps
//   dist/app/prisma/migrations/      — migration .sql files
//   dist/app/package.json            — needed for "type":"module"
//   dist/d.bat / dist/d              — launcher
//
// The launcher invokes the bundled node on build/index.js and forwards args.
// Native modules and ESM dynamic imports work because nothing is virtualised.

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const root = path.resolve(import.meta.dirname, '..')
const distDir = path.join(root, 'dist')
const appDir = path.join(distDir, 'app')

const isWindows = os.platform() === 'win32'
const nodeBinaryName = isWindows ? 'node.exe' : 'node'
const launcherName = isWindows ? 'd.bat' : 'd'

console.log('Cleaning dist/...')
fs.rmSync(distDir, { recursive: true, force: true })
fs.mkdirSync(appDir, { recursive: true })

console.log('Copying app files (this may take a minute for node_modules)...')
for (const item of ['build', 'prisma', 'node_modules', 'package.json', 'package-lock.json']) {
	const src = path.join(root, item)
	const dst = path.join(appDir, item)
	fs.cpSync(src, dst, { recursive: true })
}

console.log('Pruning dev dependencies...')
// Production-only prune; native bindings are preserved because their owner
// packages remain in `dependencies`.
execSync('npm prune --omit=dev --ignore-scripts', { cwd: appDir, stdio: 'inherit' })

console.log(`Copying Node runtime (${process.execPath})...`)
fs.copyFileSync(process.execPath, path.join(appDir, nodeBinaryName))

console.log('Writing launcher...')
const launcherPath = path.join(distDir, launcherName)
if (isWindows) {
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
