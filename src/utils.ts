import { CommandLineArgs } from './types/commandTypes.ts'
import "dotenv/config";
const defaultArgs = Object.freeze({
	logFile: 'filewarden.log',
	dbFile: 'db.sqlite'
} as const)

function extractArguments(args: string[]): CommandLineArgs {
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

export function getArguments(): CommandLineArgs {
	if (process.env["ENV_MODE"] === 'true') {
		if (!process.env["FILE_NAME"]) {
			throw new Error('No file name provided in environment variables. Please set FILE_NAME in your .env file')
		}
		const envArgs: CommandLineArgs = {
			fileName: process.env["FILE_NAME"],
			logFile: process.env["LOG_FILE"] || defaultArgs.logFile,
			dbFile: process.env["DB_FILE"] || defaultArgs.dbFile
		}
		return envArgs	
	}
	const args = process.argv.slice(2)
	return extractArguments(args)
}