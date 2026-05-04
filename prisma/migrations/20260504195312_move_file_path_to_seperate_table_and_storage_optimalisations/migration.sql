/*
  Warnings:

  - The primary key for the `cached_result` table will be changed.
  - The `file_path` column on `filecheck_result` is replaced by `file_id` (FK to new `file` table).
  - The `hash` column on `filecheck_result` is replaced by `hash_id` (FK to `cached_result.id`).
*/

-- CreateTable
CREATE TABLE "file" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "path" TEXT NOT NULL
);

-- Populate `file` from existing distinct paths
INSERT INTO "file" ("path") SELECT DISTINCT "file_path" FROM "filecheck_result";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- Rebuild cached_result with autoincrement `id` PK; `hash` keeps its values and becomes UNIQUE
CREATE TABLE "new_cached_result" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "hash" BLOB NOT NULL,
    "result" TEXT NOT NULL,
    "first_seen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_cached_result" ("first_seen", "hash", "result")
SELECT "first_seen", "hash", "result" FROM "cached_result";
DROP TABLE "cached_result";
ALTER TABLE "new_cached_result" RENAME TO "cached_result";
CREATE UNIQUE INDEX "cached_result_hash_key" ON "cached_result"("hash");
CREATE INDEX "cached_result_hash_idx" ON "cached_result"("hash");

-- Rebuild filecheck_result, resolving file_path -> file.id and hash -> cached_result.id
CREATE TABLE "new_filecheck_result" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "file_id" INTEGER NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hash_id" INTEGER NOT NULL,
    CONSTRAINT "filecheck_result_hash_id_fkey" FOREIGN KEY ("hash_id") REFERENCES "cached_result" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "filecheck_result_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_filecheck_result" ("id", "timestamp", "file_id", "hash_id")
SELECT
    fr."id",
    fr."timestamp",
    f."id",
    cr."id"
FROM "filecheck_result" fr
JOIN "file" f ON f."path" = fr."file_path"
JOIN "cached_result" cr ON cr."hash" = fr."hash";
DROP TABLE "filecheck_result";
ALTER TABLE "new_filecheck_result" RENAME TO "filecheck_result";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "file_path_key" ON "file"("path");