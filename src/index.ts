import { applyFunctionToFilesRecursively, getArguments } from './utils.ts'
import { prisma } from './prisma.ts'
import Hasher from './hash.ts'
import { checkFile } from './check.ts'

const { fileOrFolderPath } = getArguments()
console.log('Hello, FileWarden!')
const hasher = new Hasher()

await applyFunctionToFilesRecursively(fileOrFolderPath, async (filePath) => {
	const hash = await hasher.hashFile(filePath)
	const checkFileResult = await checkFile(filePath, hash)
	console.log(`Check result for file ${filePath}:`, checkFileResult)

	await prisma.filecheckResult.create({
		data: {
			filePath,
			hash,
		},
	})
})
