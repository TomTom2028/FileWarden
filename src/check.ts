import { execFile } from 'child_process'
import { CachedResult, FilecheckResultValue } from './generated/prisma/client.ts'
import { getArguments } from './utils.ts'
import { Hash } from './hash.ts'
import { prisma } from './prisma.ts'
import { AugmentedFilePath } from './augmenter.ts'
import z from 'zod'
const { debug } = getArguments()

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
				if (num === undefined || den === undefined) {
					return 'FAIL'
				}
				const fps = num / den
				const videoDur = packets / fps
				const pct = (videoDur / duration) * 100
				if (!Number.isFinite(pct) || pct < 99) {
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

export async function checkFile(augmentedFilePath: AugmentedFilePath, hash: Hash): Promise<CachedResult> {
	if (debug) {
		console.log(`Hash for file ${augmentedFilePath.path}:`, Buffer.from(hash).toString('hex'))
	}
	let cachedResult = augmentedFilePath.cachedResult
	if (hash !== cachedResult?.hash) {
		// the hash of the latest run is differnt, but maybe we already have a cached duplicate of this file
		cachedResult = await prisma.cachedResult.findFirst({
			where: {
				hash
			}
		})
	}

	if (debug) {
		console.log(`Cached result for file ${augmentedFilePath.path}:`, cachedResult)
	}
	if (cachedResult) {
		return cachedResult
	}
	const checkResult = await checkFileRaw(augmentedFilePath.path)
	const newCachedResult = await prisma.cachedResult.create({
		data: {
			hash,
			result: checkResult
		}
	})
	return newCachedResult
}
