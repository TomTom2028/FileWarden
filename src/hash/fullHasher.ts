import syncFs from 'fs'
import { AbstractHasher } from './abstractHasher.ts'

export default class FullHasher extends AbstractHasher {
	protected async windUpHasher(filePath: string) {
		const stream = syncFs.createReadStream(filePath, { highWaterMark: 1024 * 1024 }) // 1MB chunk size
		for await (const chunk of stream) {
			if (!Buffer.isBuffer(chunk)) {
				throw new TypeError(`Expected Buffer chunk from binary read stream, got ${typeof chunk}`)
			}
			this.updateHasher(chunk)
		}
		stream.close((err) => {
			if (err) {
				console.warn(`Error closing stream for file ${filePath}:`, err)
			}
		})
	}
}
