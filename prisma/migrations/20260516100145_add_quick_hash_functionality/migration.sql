-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_cached_result" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "hash" BLOB NOT NULL,
    "result" TEXT NOT NULL,
    "first_seen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quick_hash" BLOB NOT NULL,
    "quick_hash_valid_until" DATETIME NOT NULL
);
INSERT INTO "new_cached_result" ("first_seen", "hash", "id", "result", "quick_hash", "quick_hash_valid_until")
SELECT "first_seen", "hash", "id", "result", X'00', '1970-01-01 00:00:00' FROM "cached_result";
DROP TABLE "cached_result";
ALTER TABLE "new_cached_result" RENAME TO "cached_result";
CREATE UNIQUE INDEX "cached_result_hash_key" ON "cached_result"("hash");
CREATE INDEX "cached_result_hash_idx" ON "cached_result"("hash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;