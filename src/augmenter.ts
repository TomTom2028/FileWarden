import { prisma } from "./prisma.ts"
import { CachedResult } from "./generated/prisma/client.ts"


export type AugmentedFilePath = {
    path: string
    priority: number
    cachedResult: CachedResult | null
}


export async function getAugmentedFilePaths(filePaths: string[]): Promise<AugmentedFilePath[]> {
    const prioritizedPaths: AugmentedFilePath[] = filePaths.map(filePath => {
        return {
            path: filePath,
            priority: 0,
            cachedResult: null
        }
    })



    const allPaths = new Set(filePaths)


    const doExistPaths = await prisma.file.findMany({
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
    const doNotExistPaths = allPaths.difference(doExistPaths)

    const latestExistingCachedFileChecks = await prisma.filecheckResult.findMany({
        where: {
            file: {
                path: {
                    in: filePaths
                }
            }
        },
        orderBy: [{
            runId: 'desc'
        }, {
            timestamp: 'desc'
        }],
        include: {
            file: {
                select: {
                    path: true
                }
            },
            cached: true
        },
        distinct: ['fileId'],
    }).then(results => {
        return new Map(results.map(result => [result.file.path, result.cached]))
    })

    prioritizedPaths.forEach(prioritizedPath => {
        if (doNotExistPaths.has(prioritizedPath.path)) {
            prioritizedPath.priority += 100
        }
        const lastResult = latestExistingCachedFileChecks.get(prioritizedPath.path)
        if (lastResult) {
            prioritizedPath.cachedResult = lastResult
            if (lastResult.result === 'FAIL') {
            prioritizedPath.priority += 10
        } else if (lastResult.result === 'UNKNOWN') {
            prioritizedPath.priority += 5
        }
        }
        
    })
    
    return prioritizedPaths
}