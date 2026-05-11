/*
  Warnings:

  - Added the required column `runId` to the `filecheck_result` table without a default value.
    Existing rows are back-filled by linking them to a synthetic "pre-migration" run (id = 1,
    started_at = epoch 0) that is only created when filecheck_result already contains rows.

*/
-- CreateTable
CREATE TABLE "run" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "run_status" TEXT NOT NULL DEFAULT 'PARTIAL',
    "finished_at" DATETIME
);

-- Back-fill: create a single "pre-migration" run only if there is existing data to attach to it.
-- started_at is set to the Unix epoch (1970-01-01) to make it visually obvious this is synthetic.
INSERT INTO "run" ("id", "started_at")
SELECT 1, '1970-01-01 00:00:00'
WHERE EXISTS (SELECT 1 FROM "filecheck_result");

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_filecheck_result" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "file_id" INTEGER NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hash_id" INTEGER NOT NULL,
    "runId" INTEGER NOT NULL,
    CONSTRAINT "filecheck_result_hash_id_fkey" FOREIGN KEY ("hash_id") REFERENCES "cached_result" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "filecheck_result_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "filecheck_result_runId_fkey" FOREIGN KEY ("runId") REFERENCES "run" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_filecheck_result" ("file_id", "hash_id", "id", "timestamp", "runId")
SELECT "file_id", "hash_id", "id", "timestamp", 1 FROM "filecheck_result";
DROP TABLE "filecheck_result";
ALTER TABLE "new_filecheck_result" RENAME TO "filecheck_result";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;