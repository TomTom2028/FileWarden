import { runMigrations } from "./migrate.ts";
import { getArguments } from "./utils.ts";
import { PrismaBetterSqlite3  } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "./generated/prisma/client.ts";


const {  dbFile } = getArguments()

runMigrations(dbFile)
const adapter = new PrismaBetterSqlite3 ({url: `file:${dbFile}` });
const prisma = new PrismaClient({ adapter });
export { prisma };