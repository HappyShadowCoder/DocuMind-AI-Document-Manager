import { PrismaClient } from "@/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

type GlobalPrisma = typeof globalThis & { prisma?: PrismaClient };

const globalForPrisma = globalThis as GlobalPrisma;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

const createPrismaClient = () => new PrismaClient({ adapter });

const existingPrisma = globalForPrisma.prisma;
const hasRequiredModels =
  !!existingPrisma &&
  typeof (existingPrisma as PrismaClient & { chatSession?: unknown }).chatSession !== "undefined" &&
  typeof (existingPrisma as PrismaClient & { chatMessage?: unknown }).chatMessage !== "undefined" &&
  typeof (existingPrisma as PrismaClient & { documentMetadata?: unknown }).documentMetadata !== "undefined";

export const prisma = hasRequiredModels ? existingPrisma : createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}