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
		await fileHandle.read(buffer, 0, CHUNK_SIZE, 0)
		this.updateHasher(buffer)

		// every 10 mb, read another chunk until end of file
		let offset = 10 * CHUNK_SIZE
		while (offset < size) {
			await fileHandle.read(buffer, 0, CHUNK_SIZE, offset)
			this.updateHasher(buffer)
			offset += 10 * CHUNK_SIZE
		}

		await fileHandle.close()
	}
}
