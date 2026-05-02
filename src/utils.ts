import { CommandLineArgs } from './types/commandTypes.ts'
import "dotenv/config";
import path from 'path';

import fs from 'fs/promises'
const defaultArgs = Object.freeze({
	dbFile: 'db.sqlite',
	debug: false
} as const)


function extractArguments(args: string[]): CommandLineArgs {
	if (args.length === 0) {
		throw new Error('No folder path provided. Usage: node index.js <folderPath>')
	}

	const fileOrFolder = args[0]
	if (fileOrFolder === undefined || fileOrFolder.trim() === '') {
		throw new Error('Invalid file or folder path provided. Usage: node index.js <fileOrFolderPath>')
	}
	const returnValue = { fileOrFolderPath: fileOrFolder, ...defaultArgs } as CommandLineArgs
	if (args.length > 2 && args[1] !== undefined && args[1].trim() !== '') {
		returnValue.dbFile = args[1]
	}
	if (args.length > 3 && args[2] !== undefined && args[2].trim() !== '') {
		returnValue.debug = args[2] === '--debug'
	}

	return returnValue
}

export function getArguments(): CommandLineArgs {
	if (process.env["ENV_MODE"] === 'true') {
		if (!process.env["FILE_FOLDER_PATH"]) {
			throw new Error('No file or folder path provided in environment variables. Please set FILE_FOLDER_PATH in your .env file')
		}
		const envArgs: CommandLineArgs = {
			fileOrFolderPath: process.env["FILE_FOLDER_PATH"],
			dbFile: process.env["DB_FILE"] || defaultArgs.dbFile,
			debug: process.env["DEBUG_MODE"] === 'true'
		}
		return envArgs	
	}
	const args = process.argv.slice(2)
	return extractArguments(args)
}


export async function applyFunctionToFilesRecursively(fileOrFolderPath: string, func: (filePath: string) => void | Promise<void>): Promise<void> {
	const status = await fs.stat(fileOrFolderPath)
	if (status.isDirectory()) {
		const entries = await fs.readdir(fileOrFolderPath)
		for (const entry of entries) {
			const fullPath = path.join(fileOrFolderPath, entry)
			await applyFunctionToFilesRecursively(fullPath, func)
		}
	} else {
		 await func(fileOrFolderPath)
	}
}