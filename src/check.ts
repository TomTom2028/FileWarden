import { execFile } from 'child_process';
import { FilecheckResultValue } from './generated/prisma/client.ts';
import { getArguments } from './utils.ts';
import  { Hash } from './hash.ts';
import { prisma } from './prisma.ts';
type CheckCommandData = {
    command: string,
    argsFn: (filePath: string) => string[]
}
const { debug } = getArguments()


const CHECK_COMMANDS: Record<string, CheckCommandData> = {
    "mkv": {
        command: "ffmpeg",
        argsFn: (filePath) => ["-v", "error", "-hide_banner", "-nostats", "-xerror", "-i", filePath, "-f", "null", "-"]
    }
}


function getCheckCommandForFile(filePath: string): CheckCommandData | null {
    const extension = filePath.split('.').pop()?.toLowerCase()
    if (extension && CHECK_COMMANDS[extension]) {
        return CHECK_COMMANDS[extension]
    }
    return null
}

 async function checkFileRaw(filePath: string): Promise<FilecheckResultValue> {
    const checkCommandData = getCheckCommandForFile(filePath)
    if (!checkCommandData) {
        return "UNKNOWN"
    }
    return new Promise((resolve) => {
        const child = execFile(checkCommandData.command, checkCommandData.argsFn(filePath), (error, stdout, stderr) => {
            if (debug) {
                console.log(`Check command output for file ${filePath}:`, { stdout, stderr })
                if (error) {
                    console.error(`Check command error for file ${filePath}:`, error)
                }
            }
        })

        function onCloseHandler(code: number | null) {
            child.off('close', onCloseHandler)
            if (code === 0) {
                resolve("PASS")
            } else {               
                resolve("FAIL")
            }
        }

        child.on('close', (code) => {
            onCloseHandler(code)
        })
        // sync check for the statuscode, if the event emitted before the callback is called (will not happen normally)
        if (child.exitCode !== null) {
            onCloseHandler(child.exitCode)
        }
    })
}

export async function checkFile(filePath: string, hash: Hash): Promise<FilecheckResultValue> {
    if (debug) {
        console.log(`Hash for file ${filePath}:`, Buffer.from(hash).toString('hex'))
    }
    const cachedResult = await prisma.cachedResult.findFirst({
        where: {
            hash
        }
    })
    if (debug) {
        console.log(`Cached result for file ${filePath}:`, cachedResult)
    }
    if (cachedResult) {
        return cachedResult.result
    }
    const checkResult = await checkFileRaw(filePath)
    await prisma.cachedResult.create({
        data: {
            hash,
            result: checkResult
        }
    })
    return checkResult

}