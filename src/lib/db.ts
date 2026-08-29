import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton.
 * All financial data (wallets, points, orders, recharges, reviews) lives in
 * PostgreSQL and is ONLY accessible through server-side API routes.
 * The browser has no direct database access — eliminating client-side
 * balance manipulation entirely.
 */
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
