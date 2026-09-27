import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * BigInt-aware JSON replacer for Express (attached via app.set('json replacer', bigintJsonReplacer)).
 * Converts BigInt values to strings across all Express res.json() calls.
 */
export function bigintJsonReplacer(key, value) {
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}
