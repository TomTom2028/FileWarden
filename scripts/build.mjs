// Orchestrates the full build:
//   1. Cleans dist/ contents
//   2. Compiles TypeScript to build/
//   3. Packages the host platform's dist
//   4. Cross-packages the other platform:
//        Windows host → Linux dist via WSL using a portable Linux node
//        Linux host   → Windows dist via npm cross-install with a portable node.exe
//
// To build only the host platform, run `node scripts/package.mjs` directly.

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const distDir = path.join(root, 'dist')
const cacheDir = path.join(root, '.cache')
const isWindows = process.platform === 'win32'
const nodeVersion = process.versions.node

function hasCommand(cmd) {
	try {
		execSync(isWindows ? `where ${cmd}` : `command -v ${cmd}`, { stdio: 'ignore', shell: !isWindows })
		return true
	} catch {
		return false
	}
}

// Don't delete dist itself — Windows refuses if any process has it as cwd
// (e.g. running `npm run build` from inside dist/). Clean its contents instead.
console.log('=== Cleaning dist/ contents ===')
if (fs.existsSync(distDir)) {
	for (const entry of fs.readdirSync(distDir)) {
		fs.rmSync(path.join(distDir, entry), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
	}
}

console.log('\n=== TypeScript compile ===')
// Invoke tsc via its JS entry point so it works whether or not node_modules/.bin
// is on PATH (npm run sets it; bare `node scripts/build.mjs` doesn't).
const tscJs = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc')
execSync(`node "${tscJs}"`, { cwd: root, stdio: 'inherit' })

console.log('\n=== Packaging native platform ===')
execSync('node scripts/package.mjs', { cwd: root, stdio: 'inherit' })

if (isWindows) {
	// Cross-build Linux via WSL using a portable Linux node — no node install needed in WSL.
	const linuxNodeName = `node-v${nodeVersion}-linux-x64`
	const linuxNodeBin = path.join(cacheDir, linuxNodeName, 'bin', 'node')

	if (!fs.existsSync(linuxNodeBin)) {
		console.log(`\n=== Downloading portable Linux node v${nodeVersion} ===`)
		fs.mkdirSync(cacheDir, { recursive: true })
		const tarball = `${linuxNodeName}.tar.xz`
		const tarballPath = path.join(cacheDir, tarball)
		const url = `https://nodejs.org/dist/v${nodeVersion}/${tarball}`
		execSync(`curl -fL -o "${tarballPath}" "${url}"`, { stdio: 'inherit' })
		// Node has no native .tar.xz reader; WSL's tar handles xz out of the box.
		execSync(`wsl --cd "${cacheDir}" -- tar -xJf "${tarball}"`, { stdio: 'inherit' })
		fs.rmSync(tarballPath, { force: true })
	}

	console.log('\n=== Packaging Linux via WSL ===')
	// Run package.mjs inside WSL with the portable Linux node. process.execPath
	// inside that script then resolves to the portable node, which gets copied
	// into dist/linux/app/node.
	const wslNodePath = `.cache/${linuxNodeName}/bin/node`
	execSync(`wsl --cd "${root}" -- "${wslNodePath}" scripts/package.mjs`, { stdio: 'inherit' })
} else {
	// Cross-build Windows: download a portable node.exe and ask npm to install
	// for win32-x64 (relies on prebuild-install honouring npm_config_target_*
	// for the native deps — better-sqlite3 and xxhash-addon both ship win-x64
	// prebuilds, so no Wine / cross-compiler needed).
	const winNodeName = `node-v${nodeVersion}-win-x64`
	const winNodeBin = path.join(cacheDir, winNodeName, 'node.exe')

	if (!fs.existsSync(winNodeBin)) {
		console.log(`\n=== Downloading portable Windows node v${nodeVersion} ===`)
		fs.mkdirSync(cacheDir, { recursive: true })
		const archive = `${winNodeName}.zip`
		const archivePath = path.join(cacheDir, archive)
		const url = `https://nodejs.org/dist/v${nodeVersion}/${archive}`
		execSync(`curl -fL -o "${archivePath}" "${url}"`, { stdio: 'inherit' })
		if (hasCommand('unzip')) {
			execSync(`unzip -q -o "${archivePath}" -d "${cacheDir}"`, { stdio: 'inherit' })
		} else if (hasCommand('python3')) {
			execSync(`python3 -m zipfile -e "${archivePath}" "${cacheDir}"`, { stdio: 'inherit' })
		} else {
			throw new Error('Need `unzip` or `python3` to extract the Windows node archive. Install one (e.g. `sudo apt-get install unzip`).')
		}
		fs.rmSync(archivePath, { force: true })
	}

	console.log('\n=== Cross-packaging Windows ===')
	execSync(`node scripts/package.mjs --target=win32 --node-bin="${winNodeBin}"`, { cwd: root, stdio: 'inherit' })
}

console.log('\nAll builds complete.')
