export type Hash = Uint8Array<ArrayBuffer>
export type HasherType = 'FULL' | 'QUICK'
export type Hasher = {
	hashFile(filePath: string): Promise<Hash>
}
