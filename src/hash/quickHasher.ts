import xhashAddon from 'xxhash-addon'
import type { XXHash } from 'xxhash-addon'
const { XXHash128 } = xhashAddon
import { Hasher } from '../types/hashTypes.ts'
import fs from 'fs/promises'

const CHUNK_SIZE = 1024 * 1024 // 1MB

export default class QuickHasher implements Hasher {
	private bufferedXHash: XXHash

	constructor() {
		this.bufferedXHash = new XXHash128(Buffer.from([0, 0, 0, 0]))
	}
	public async hashFile(filePath: string) {
		// take mtimeMS and size as preamble
		const stats = await fs.stat(filePath)
		const mtimeMS = stats.mtimeMs
		const size = stats.size
		const combined = `${mtimeMS}-${size}`

		this.bufferedXHash.update(Buffer.from(combined))

		// get a ponter to start of file
		const fileHandle = await fs.open(filePath, 'r')
		const buffer = Buffer.alloc(CHUNK_SIZE) // read first 1mb of the file
		await fileHandle.read(buffer, 0, CHUNK_SIZE, 0)
		this.bufferedXHash.update(buffer)

		// every 10 mb, read another chunk until end of file
		let offset = 10 * CHUNK_SIZE
		while (offset < size) {
			await fileHandle.read(buffer, 0, CHUNK_SIZE, offset)
			this.bufferedXHash.update(buffer)
			offset += 10 * CHUNK_SIZE
		}

		const hash = this.bufferedXHash.digest()
		this.bufferedXHash.reset()
		await fileHandle.close()
		return new Uint8Array(hash)
	}
}
