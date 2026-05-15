import fs from 'fs/promises'
import { AbstractHasher } from './abstractHasher.ts'

const CHUNK_SIZE = 1024 * 1024 // 1MB

export default class QuickHasher extends AbstractHasher {

	protected async windUpHasher(filePath: string) {
		// take mtimeMS and size as preamble
		const stats = await fs.stat(filePath)
		const mtimeMS = stats.mtimeMs
		const size = stats.size
		const combined = `${mtimeMS}-${size}`

		this.updateHasher(Buffer.from(combined))

		// get a ponter to start of file
		const fileHandle = await fs.open(filePath, 'r')
		const buffer = Buffer.alloc(CHUNK_SIZE) // read first 1mb of the file

		// every 10 mb, read chunk until end of file
		let offset = 0
		while (offset < size) {
			await fileHandle.read(buffer, 0, CHUNK_SIZE, offset)
			this.updateHasher(buffer)
			offset += 10 * CHUNK_SIZE
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
