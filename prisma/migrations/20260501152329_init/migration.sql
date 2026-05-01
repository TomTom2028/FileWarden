-- CreateTable
CREATE TABLE "cached_result" (
    "hash" BLOB NOT NULL PRIMARY KEY,
    "result" TEXT NOT NULL,
    "first_seen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "filecheck_result" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "file_name" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hash" BLOB NOT NULL,
    CONSTRAINT "filecheck_result_hash_fkey" FOREIGN KEY ("hash") REFERENCES "cached_result" ("hash") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "filecheck_result_file_name_idx" ON "filecheck_result"("file_name");

-- CreateIndex
CREATE INDEX "filecheck_result_hash_idx" ON "filecheck_result"("hash");

-- CreateIndex
CREATE INDEX "filecheck_result_timestamp_idx" ON "filecheck_result"("timestamp");
