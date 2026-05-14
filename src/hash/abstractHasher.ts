import type { XXHash } from 'xxhash-addon'
import xhashAddon from 'xxhash-addon'
import { Hash, Hasher } from '../types/hashTypes.ts'
const { XXHash128 } = xhashAddon

export abstract class AbstractHasher implements Hasher {
	private bufferedXHash: XXHash
	constructor() {
		this.bufferedXHash = new XXHash128(Buffer.from([0, 0, 0, 0]))
	}

	public async hashFile(filePath: string): Promise<Hash> {
		await this.windUpHasher(filePath)
		const result = new Uint8Array(this.bufferedXHash.digest())
		this.bufferedXHash.reset()
		return result
	}

	protected updateHasher(content: Buffer) {
		this.bufferedXHash.update(content)
	}

	protected abstract windUpHasher(filePath: string): Promise<void>
}
