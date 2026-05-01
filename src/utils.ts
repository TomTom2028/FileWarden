import { CommandLineArgs } from './types/commandTypes.ts'
const defaultArgs = Object.freeze({
	logFile: 'filewarden.log',
	dbFile: 'db.sqlite'
} as const)

export function extractArguments(args: string[]): CommandLineArgs {
	if (args.length === 0) {
		throw new Error('No file name provided. Usage: node index.js <fileName>')
	}

	const fileName = args[0]
	if (fileName === undefined || fileName.trim() === '') {
		throw new Error('Invalid file name provided. Usage: node index.js <fileName>')
	}
	const returnValue = { fileName, ...defaultArgs } as CommandLineArgs
	if (args.length > 1 && args[1] !== undefined && args[1].trim() !== '') {
		returnValue.logFile = args[1]
	}
	if (args.length > 2 && args[2] !== undefined && args[2].trim() !== '') {
		returnValue.dbFile = args[2]
	}
	return returnValue
}
