import { execFile } from 'child_process'
import { CachedResult, FilecheckResultValue } from './generated/prisma/client.ts'
import { getArguments } from './utils.ts'
import { prisma } from './prisma.ts'
import { AugmentedFilePath } from './augmenter.ts'
import z from 'zod'
const { debug } = getArguments()
import { createHasher } from './hash/index.ts'
import { Hash } from './types/hashTypes.ts'
const fullHasher = createHasher('FULL')
const quickHasher = createHasher('QUICK')

function defaultValidator(_: string, __: string, exitCode: number, filePath: string): FilecheckResultValue {
	if (exitCode === 0) {
		return 'PASS'
	} else {
		if (debug) {
			console.error(`Check command failed for file ${filePath} with exit code ${exitCode}`)
		}
		return 'FAIL'
	}
}

function formatExitCode(exitCode: unknown): number {
	if (typeof exitCode === 'number') {
		return exitCode
	}
	if (typeof exitCode === 'string') {
		const parsed = parseInt(exitCode, 10)
		if (!isNaN(parsed)) {
			return parsed
		}
	}
	return -1 // default to -1 if exit code is not a number or string
}

const FfprobeLengthSchema = z.object({
	streams: z.array(
		z.object({
			nb_read_packets: z.string(),
			r_frame_rate: z.string()
		})
	),
	format: z.object({
		duration: z.string()
	})
})

function isArrayNonEmpty<T>(arr: T[]): arr is [T, ...T[]] {
	return arr.length > 0
}

type CheckCommandData = {
	command: string
	argsFn: (filePath: string) => string[]
	validator: (stdout: string, stderr: string, exitCode: number, filePath: string) => FilecheckResultValue
}

// sorted, earliest in array = executed first
const CHECK_COMMANDS: Record<string, CheckCommandData[]> = {
	mkv: [
		{
			command: 'ffmpeg',
			argsFn: (filePath) => ['-v', 'error', '-hide_banner', '-nostats', '-xerror', '-i', filePath, '-f', 'null', '-'],
			validator: defaultValidator
		},
		{
			command: 'ffprobe',
			argsFn: (filePath) => [
				'-v',
				'error',
				'-select_streams',
				'v:0',
				'-count_packets',
				'-show_entries',
				'stream=nb_read_packets,r_frame_rate:format=duration',
				'-of',
				'json',
				filePath
			],
			validator: (stdout) => {
				const data = FfprobeLengthSchema.parse(JSON.parse(stdout))
				const duration = parseFloat(data.format.duration)
				if (!isArrayNonEmpty(data.streams)) {
					return 'FAIL'
				}
				const packets = parseInt(data.streams[0].nb_read_packets, 10)
				const [num, den] = data.streams[0].r_frame_rate.split('/').map(Number)
				if (num === undefined || den === undefined || den === 0) {
					return 'FAIL'
				}
				const fps = num / den
				const videoDur = packets / fps
				const ratio = videoDur / duration
				if (debug) {
					console.log(
						`Duration from ffprobe: ${duration}s, video duration calculated from packets and frame rate: ${videoDur}s, ratio: ${ratio}`
					)
				}
				if (!Number.isFinite(ratio) || ratio < 0.8) {
					return 'FAIL'
				}
				return 'PASS'
			}
		}
	]
}

function getCheckCommandsForFile(filePath: string): CheckCommandData[] | null {
	const extension = filePath.split('.').pop()?.toLowerCase()
	if (extension && CHECK_COMMANDS[extension]) {
		return CHECK_COMMANDS[extension]
	}
	return null
}

async function checkFileRaw(filePath: string): Promise<FilecheckResultValue> {
	const checkCommandDataArray = getCheckCommandsForFile(filePath)
	if (!checkCommandDataArray) {
		return 'UNKNOWN'
	}

	for (const checkCommandData of checkCommandDataArray) {
		const result: FilecheckResultValue = await new Promise((resolve) => {
			execFile(checkCommandData.command, checkCommandData.argsFn(filePath), (error, stdout, stderr) => {
				if (error && debug) {
					console.error(`Error executing check command for file ${filePath}:`, error)
				}
				let code = 0
				if (error) {
					code = formatExitCode(error.code)
				}
				try {
					const checkResult = checkCommandData.validator(stdout, stderr, code, filePath)
					if (debug) {
						console.log(
							`Check command ${checkCommandData.command} for file ${filePath} exited with code ${code}, result: ${checkResult}`
						)
					}
					resolve(checkResult)
				} catch (validationError) {
					if (debug) {
						console.error(`Error validating check command output for file ${filePath}:`, validationError)
					}
					resolve('FAIL')
				}
			})
		})
		if (result !== 'PASS') {
			return result // if any check fails, we consider the file as failed, no need to run other checks
		}
	}
	return 'PASS'
}

function getNewValidTime(): Date {
	// base = 30 days
	const baseTime = 30 * 24 * 60 * 60 * 1000
	// add some random time between - 10 and + 10 days to avoid all cached results expiring at the same time
	const randomAdditionalTime = (Math.random() - 0.5) * 20 * 24 * 60 * 60 * 1000
	return new Date(Date.now() + baseTime + randomAdditionalTime)
}

async function updateQuickHash(cachedResultId: number, quickHash: Hash): Promise<void> {
	// update quick hash and its valid until to speed up future checks
	await prisma.cachedResult.update({
		where: {
			id: cachedResultId
		},
		data: {
			quickHash, // this update is really not needed (full hash for file consistency but if they ever get out of sync this fixes it)
			quickHashValidUntil: getNewValidTime()
		}
	})
}

export async function checkFile(augmentedFilePath: AugmentedFilePath): Promise<CachedResult> {
	const quickHash = await quickHasher.hashFile(augmentedFilePath.path)

	// four tiers of caching:
	// 1. quick hash from augmented filepath
	// 2. quick hash serach from db
	// 3. full hash from augmented filepath
	// 4. full hash search from db

	// 1.
	if (
		augmentedFilePath.cachedResult?.quickHash === quickHash &&
		augmentedFilePath.cachedResult.quickHashValidUntil > new Date()
	) {
		if (debug) {
			console.log(
				`Quick hash hit from augmented file path for file ${augmentedFilePath.path}, quick hash: ${quickHash.toString()}, result: ${augmentedFilePath.cachedResult.result}`
			)
		}
		return augmentedFilePath.cachedResult
	}

	// 2.
	const quickHashResult = await prisma.cachedResult.findFirst({
		where: {
			quickHash,
			quickHashValidUntil: {
				gt: new Date()
			}
		}
	})
	if (quickHashResult) {
		if (debug) {
			console.log(
				`Quick hash hit for file ${augmentedFilePath.path}, quick hash: ${quickHash.toString()}, result: ${quickHashResult.result}`
			)
		}
		return quickHashResult
	}

	const fullHash = await fullHasher.hashFile(augmentedFilePath.path)

	// NOTE: when we update the quick hash we don't return the updated version.
	// this is because we don't care about the hashes or the valid untill in index.ts
	// TODO: remove the not updated info from the return value of this function!

	// 3.
	if (augmentedFilePath.cachedResult?.hash === fullHash) {
		if (debug) {
			console.log(
				`Full hash hit from augmented file path for file ${augmentedFilePath.path}, full hash: ${fullHash.toString()}, result: ${augmentedFilePath.cachedResult.result}`
			)
		}
		await updateQuickHash(augmentedFilePath.cachedResult.id, quickHash) // update quick hash for future faster checks
		return augmentedFilePath.cachedResult
	}

	// 4.
	const cachedResult = await prisma.cachedResult.findFirst({
		where: {
			hash: fullHash
		}
	})
	if (cachedResult) {
		if (debug) {
			console.log(
				`Full hash hit for file ${augmentedFilePath.path}, full hash: ${fullHash.toString()}, result: ${cachedResult.result}`
			)
		}
		// update quick hash and its valid until to speed up future checks
		await updateQuickHash(cachedResult.id, quickHash)
		return cachedResult
	}

	// fallback to actually checking the file and creating a new cached result
	const checkResult = await checkFileRaw(augmentedFilePath.path)
	const newCachedResult = await prisma.cachedResult.create({
		data: {
			hash: fullHash,
			quickHash,
			quickHashValidUntil: getNewValidTime(),
			result: checkResult
		}
	})
	return newCachedResult
}
