import xhashAddon from 'xxhash-addon'
const { XXHash3 } = xhashAddon
import fs from 'fs'
import { getArguments } from './utils.ts'

const { fileName } = getArguments()
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

