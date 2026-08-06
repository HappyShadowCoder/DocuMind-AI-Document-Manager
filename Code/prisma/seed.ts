// seed.ts
import dotenv from "dotenv";
dotenv.config();

import { Pool } from "../node_modules/@types/pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";
import bcrypt from "bcryptjs";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is missing.");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    const commonPassword = await bcrypt.hash("password123", 10);

    // 1. Seed Admin User
    const admin = await prisma.user.upsert({
        where: { email: "admin@example.com" },
        update: { role: "admin" },
        create: {
            email: "admin@example.com", // <-- Syntax error fixed here
            fullName: "Admin User",
            passwordHash: commonPassword,
            role: "admin",
            mustChangePassword: false,
        },
    });

    console.log("Seeded admin user:", admin.email);

    // 2. Seed Standard User
    const user = await prisma.user.upsert({
        where: { email: "test@example.com" },
        update: { role: "user" },
        create: {
            email: "test@example.com",
            fullName: "Test User",
            passwordHash: commonPassword,
            role: "user",
            mustChangePassword: false,
        },
    });

    console.log("Seeded standard user:", user.email);
}

main()
    .catch((e) => {
        console.error("Error seeding database:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });