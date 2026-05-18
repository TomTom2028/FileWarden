import FullHasher from "../hash/fullHasher.ts";
import QuickHasher from "../hash/quickHasher.ts";
import { Hasher } from "../types/hashTypes.ts";
import { getAllPathsRecursively } from "../utils.ts";
const fileOrFolderPath = 'D:\\test hashing\\input'

 async function testHasher(hasher: Hasher) {
    const allPaths = (await getAllPathsRecursively(fileOrFolderPath)).filter((path) => {
        // filter out directories, we only want files
        return !(path.split('.gitignore').length > 1)
    })
    const timestamps: number[] = []
    const startTime = Date.now()
    for (const path of allPaths) {
        await hasher.hashFile(path)
        timestamps.push(Date.now())
    }
    const totalTime = Date.now() - startTime
    console.log(`Total time taken: ${totalTime} ms`)
    console.log(`Average time per file: ${totalTime / allPaths.length} ms`)
    console.log(`Timestamps: ${timestamps}`)
}


const hasher = new QuickHasher()
await testHasher(hasher)

