import xhashAddon from 'xxhash-addon'
import syncFs from 'fs'
const { XXHash128 } = xhashAddon
import type { XXHash } from 'xxhash-addon'
import { Hasher } from '../types/hashTypes.ts'

export default class FullHasher implements Hasher {
	private bufferedXHash: XXHash

	constructor() {
		this.bufferedXHash = new XXHash128(Buffer.from([0, 0, 0, 0]))
	}

	public async hashFile(filePath: string) {
		const stream = syncFs.createReadStream(filePath, { highWaterMark: 1024 * 1024 }) // 1MB chunk size
		for await (const chunk of stream) {
			if (!Buffer.isBuffer(chunk)) {
				throw new TypeError(`Expected Buffer chunk from binary read stream, got ${typeof chunk}`)
			}
			this.bufferedXHash.update(chunk)
		}
		const hash = new Uint8Array(this.bufferedXHash.digest())
		this.bufferedXHash.reset()
		stream.close((err) => {
			if (err) {
				console.warn(`Error closing stream for file ${filePath}:`, err)
			}
		})
		return hash
	}
}
