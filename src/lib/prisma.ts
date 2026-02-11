import { PrismaClient } from "@prisma/client";

// Some environments (or global env vars) can force Prisma "client" engine,
// which requires driver adapters/Accelerate. For this app (SQLite + Node),
// we force the Node-compatible engine to avoid build/runtime failures.
if (process.env.PRISMA_CLIENT_ENGINE_TYPE === "client") {
  process.env.PRISMA_CLIENT_ENGINE_TYPE = "library";
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
