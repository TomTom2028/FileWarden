import { getAllPathsRecursively, getArguments } from './utils.ts'
import { prisma } from './prisma.ts'
import Hasher from './hash.ts'
import { checkFile } from './check.ts'
import { FilecheckResultValue } from './generated/prisma/browser.ts'
import { AugmentedFilePath, getAugmentedFilePaths } from './augmenter.ts'

const { fileOrFolderPath } = getArguments()
const hasher = new Hasher()

const mapOfResults: Record<string, FilecheckResultValue> = {}

const allFilePaths = await getAllPathsRecursively(fileOrFolderPath).then((paths) => getAugmentedFilePaths(paths))
allFilePaths.sort((a, b) => {
	const pritorityDiff = b.priority - a.priority
	if (pritorityDiff !== 0) {
		return pritorityDiff
	}
	// fallback to alphabetical sorting to ensure a determinstic order (for nicencess)
	return a.path.localeCompare(b.path)
})

const currentRun = await prisma.run.create({})

async function toApplyFunctiontoFile(filePath: AugmentedFilePath) {
	const currentHash = await hasher.hashFile(filePath.path)
	const checkFileResult = await checkFile(filePath, currentHash)
	console.log(`Check result for file ${filePath.path}:`, checkFileResult.result)
	mapOfResults[filePath.path] = checkFileResult.result

	await prisma.filecheckResult.create({
		data: {
			file: {
				connectOrCreate: {
					where: {
						path: filePath.path
					},
					create: {
						path: filePath.path
					}
				}
			},
			cached: {
				connect: {
					id: checkFileResult.id
				}
			},
			run: {
				connect: {
					id: currentRun.id
				}
			}
		}
	})
}

for (const filePath of allFilePaths) {
	await toApplyFunctiontoFile(filePath)
}

// we don't 'set' the og run because is useless
await prisma.run.update({
	where: {
		id: currentRun.id
	},
	data: {
		runStatus: 'COMPLETE',
		finishedAt: new Date()
	}
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
