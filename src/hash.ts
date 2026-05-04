import xhashAddon from 'xxhash-addon'
import syncFs from 'fs'
const { XXHash3 } = xhashAddon

export type Hash = Uint8Array<ArrayBuffer>
export default class Hasher {
	private bufferedXHash3: xhashAddon.XXHash3

	constructor() {
		this.bufferedXHash3 = new XXHash3(Buffer.from([0, 0, 0, 0]))
	}

	public async hashFile(filePath: string): Promise<Hash> {
		const stream = syncFs.createReadStream(filePath)
		for await (const chunk of stream) {
			if (!Buffer.isBuffer(chunk)) {
				throw new TypeError(`Expected Buffer chunk from binary read stream, got ${typeof chunk}`)
			}
			this.bufferedXHash3.update(chunk)
		}
		const hash = new Uint8Array(this.bufferedXHash3.digest())
		this.bufferedXHash3.reset()
		return hash
	}
}
