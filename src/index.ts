import xhashAddon from 'xxhash-addon'
const { XXHash3 } = xhashAddon
import fs from 'fs'
import { extractArguments } from './utils'

const main = async () => {
	const args = process.argv.slice(2)
	const { fileName } = extractArguments(args)
	console.log('Hello, FileWarden!')
	const bufferedXHash3 = new XXHash3(Buffer.from([0, 0, 0, 0]))
	// get input buffer
	const stream = fs.createReadStream(fileName)

	const startTime = Date.now()
	for await (const chunk of stream) {
		bufferedXHash3.update(chunk)
	}
	const endTime = Date.now()

	const hash = bufferedXHash3.digest()
	console.log('Hash:', hash.toString('hex'))
	console.log('Hashing took', endTime - startTime, 'ms')
}

main()
