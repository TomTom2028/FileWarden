import xhashAddon from 'xxhash-addon'
const { XXHash3 } = xhashAddon
import syncFs from 'fs'
import { applyFunctionToFilesRecursively, getArguments } from './utils.ts'
import { prisma } from './prisma.ts'

const { fileOrFolderPath } = getArguments()
console.log('Hello, FileWarden!')
const bufferedXHash3 = new XXHash3(Buffer.from([0, 0, 0, 0]))

await applyFunctionToFilesRecursively(fileOrFolderPath, async (filePath) => {
	const stream = syncFs.createReadStream(filePath)
	for await (const chunk of stream) {
		bufferedXHash3.update(chunk)
	}
	const hash = new Uint8Array(bufferedXHash3.digest())
	bufferedXHash3.reset()


	const result = await prisma.cachedResult.findFirst({
		where: {
			hash
		}
	})
	if (result) {
		console.log(`File: ${filePath}, Hash: ${Buffer.from(hash).toString('hex')}, Cached Result: ${result.result}`)
	} else {
		console.log(`File: ${filePath}, Hash: ${Buffer.from(hash).toString('hex')}, No cached result found.`)
	}
})


