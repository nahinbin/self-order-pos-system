import { PrismaClient } from "@prisma/client";

// Harden Neon pooler URLs (pgbouncer + timeouts) for dev stability.
const rawUrl = process.env.DATABASE_URL;
if (rawUrl && typeof rawUrl === "string") {
  const isPooler = rawUrl.includes("-pooler.");
  const hasParam = (k: string) => new RegExp(`(?:\\?|&)${k}=`, "i").test(rawUrl);
  const sep = rawUrl.includes("?") ? "&" : "?";

  let next = rawUrl;

  // Neon pooler expects pgbouncer mode; Prisma uses this to disable prepared statements.
  if (isPooler && !hasParam("pgbouncer")) {
    next += `${sep}pgbouncer=true`;
  }

  // Avoid P2024 timeouts / slow connection acquisition.
  if (!hasParam("connection_limit")) {
    next += `${next.includes("?") ? "&" : "?"}connection_limit=10`;
  }
  if (!hasParam("pool_timeout")) {
    // If DB is struggling, fail fast rather than stalling requests for minutes.
    next += `${next.includes("?") ? "&" : "?"}pool_timeout=10`;
  }
  if (!hasParam("connect_timeout")) {
    next += `${next.includes("?") ? "&" : "?"}connect_timeout=10`;
  }

  process.env.DATABASE_URL = next;
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
