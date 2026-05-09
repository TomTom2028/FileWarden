-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_run" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "run_status" TEXT NOT NULL DEFAULT 'PARTIAL',
    "finished_at" DATETIME
);
INSERT INTO "new_run" ("id", "started_at") SELECT "id", "started_at" FROM "run";
DROP TABLE "run";
ALTER TABLE "new_run" RENAME TO "run";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
