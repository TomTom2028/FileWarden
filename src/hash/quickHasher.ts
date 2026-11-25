import fs from 'fs/promises'
import { AbstractHasher } from './abstractHasher.ts'

const CHUNK_SIZE = 1024 * 1024 // 2mb
const OFFSET_STEP = 20 * CHUNK_SIZE // every 40mb

export default class QuickHasher extends AbstractHasher {
	protected async windUpHasher(filePath: string) {
		// take size as preamble
		const stats = await fs.stat(filePath)
		const size = stats.size
		const combined = `${size}`

		this.updateHasher(Buffer.from(combined))

		// get a ponter to start of file
		const fileHandle = await fs.open(filePath, 'r')
		const buffer = Buffer.alloc(CHUNK_SIZE) // read first x of the file

		// every 10 mb, read chunk until end of file
		let offset = 0
		while (offset < size) {
			await fileHandle.read(buffer, 0, CHUNK_SIZE, offset)
			this.updateHasher(buffer)
			offset += OFFSET_STEP
		}
		// also read last 1mb of the file to capture changes at the end of the file
		if (size > CHUNK_SIZE) {
			const lastChunkOffset = Math.max(0, size - CHUNK_SIZE)
			await fileHandle.read(buffer, 0, CHUNK_SIZE, lastChunkOffset)
			this.updateHasher(buffer)
		}

		await fileHandle.close()
	}
}
