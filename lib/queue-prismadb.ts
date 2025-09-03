import { PrismaClient } from '../prisma/generated/queue_db';

declare global {
  var queuePrisma: PrismaClient | undefined;
}

const queuePrismadb = globalThis.queuePrisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.queuePrisma = queuePrismadb;
}

export default queuePrismadb;
