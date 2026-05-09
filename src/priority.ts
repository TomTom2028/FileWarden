import { prisma } from "./prisma.ts"

export async function getPrioritizedFilePathArray(filePaths: string[]) {
    const allPaths = new Set(filePaths)


    const slowPaths = await prisma.file.findMany({
        where: {
            path: {
                in: filePaths
            }
        },
        select: {
            path: true,
        }
    }).then(files => new Set(files.map(file => file.path)))
    // fill the cache / probable not checked files are first, bcs this has a positive effect for future runs
    // (if we stop the program early, usefull work was done, and the next run will be faster)
    const fastPaths = allPaths.difference(slowPaths)
    return {
        fastPaths,
        slowPaths
    }
}