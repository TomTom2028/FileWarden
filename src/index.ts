import { applyFunctionToFilesRecursively, getArguments } from './utils.ts'
import { prisma } from './prisma.ts'
import Hasher from './hash.ts'
import { checkFile } from './check.ts'
import { FilecheckResultValue } from './generated/prisma/browser.ts'

const { fileOrFolderPath } = getArguments()
const hasher = new Hasher()

const mapOfResults: Record<string, FilecheckResultValue> = {}

await applyFunctionToFilesRecursively(fileOrFolderPath, async (filePath) => {
	const hash = await hasher.hashFile(filePath)
	const checkFileResult = await checkFile(filePath, hash)
	console.log(`Check result for file ${filePath}:`, checkFileResult)
	mapOfResults[filePath] = checkFileResult

	await prisma.filecheckResult.create({
		data: {
			filePath,
			hash
		}
	})
})

console.log('All files processed. Summary of results:')
console.log('Amount of files processed:', Object.keys(mapOfResults).length)

const allPASSResults = Object.entries(mapOfResults).filter(([, result]) => result === 'PASS')
const allNOKResults = Object.entries(mapOfResults).filter(([, result]) => result === 'FAIL')
const allUNKNOWNResults = Object.entries(mapOfResults).filter(([, result]) => result === 'UNKNOWN')

console.log('Amount of files that passed the check:', allPASSResults.length)
console.log('Amount of files that failed the check:', allNOKResults.length)
for (const [filePath, result] of allNOKResults) {
	console.log(`File ${filePath} failed the check with result: ${result}`)
}
console.log('Amount of files with unknown check result:', allUNKNOWNResults.length)
for (const [filePath, result] of allUNKNOWNResults) {
	console.log(`File ${filePath} has unknown check result: ${result}`)
}

console.log(
	'Percentage of files that passed the check:',
	((allPASSResults.length / Object.keys(mapOfResults).length) * 100).toFixed(2) + '%'
)
console.log('FileWarden finished processing all files.')
