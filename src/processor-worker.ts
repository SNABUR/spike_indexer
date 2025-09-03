import { createLogger } from './indexer/utils';
import cron from 'node-cron';
import queuePrismadb from '../lib/queue-prismadb';
import prismadb from '../lib/main_prismadb'; 
import { processEvents } from './indexer/eventProcessor';
import { RpcEvent } from './indexer/types';

const logger = createLogger('processor-worker');

const BATCH_SIZE = 100; // Process 100 jobs at a time
const CLEANUP_RETENTION_DAYS = 7; // Keep processed jobs for 7 days

async function processQueue() {
  const jobs = await queuePrismadb.job.findMany({
    where: { processed: false },
    take: BATCH_SIZE,
  });

  if (jobs.length === 0) {
    return;
  }

  logger.info(`Processing ${jobs.length} jobs from the queue.`);

  const events = jobs.map(job => job.payload as any as RpcEvent);
  const jobIds = jobs.map(job => job.id);

  try {
    // --- FASE 1: Lógica de Negocio Principal ---
    // Ejecutamos el trabajo pesado en la base de datos principal, dentro de su propia transacción.
    await prismadb.$transaction(async (tx) => {
      await processEvents(events, events[0].network, tx);
    });

    // --- FASE 2: Actualización de la Cola ---
    // Solo si la Fase 1 tuvo éxito, procedemos a marcar los trabajos como completados.
    try {
      await queuePrismadb.job.updateMany({
        where: { id: { in: jobIds } },
        data: { processed: true },
      });
      logger.info(`Successfully processed and marked ${jobs.length} jobs as complete.`);
      
    } catch (queueError) {
      // Este es un caso raro pero importante: el trabajo se hizo, pero no pudimos
      // marcarlo en la cola. Se registrará un error crítico y los trabajos se
      // volverán a procesar en el futuro (por eso `processEvents` debe ser idempotente).
      logger.error('CRITICAL: Business logic succeeded, but failed to mark jobs as processed. Jobs will be re-run.', queueError);
    }

  } catch (processingError) {
    // Si la Fase 1 falla, el error se captura aquí. Los trabajos NO se marcan
    // como procesados y se reintentarán automáticamente en la siguiente ejecución.
    logger.error('Error during the main processing transaction. Jobs will be retried.', processingError);
  }
}
async function cleanupProcessedJobs() {
  logger.info('Starting cleanup of processed jobs...');
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - CLEANUP_RETENTION_DAYS);

  try {
    const { count } = await queuePrismadb.job.deleteMany({
      where: {
        processed: true,
        createdAt: {
          lt: cutoffDate, // Less than the cutoff date
        },
      },
    });
    logger.info(`Cleaned up ${count} processed jobs older than ${CLEANUP_RETENTION_DAYS} days.`);
  } catch (error) {
    logger.error('Error during job cleanup:', error);
  }
}

// Run the job processor every second
cron.schedule('* * * * * *', processQueue);

// Schedule cleanup to run once a day at 00:00 UTC
cron.schedule('0 0 * * *', cleanupProcessedJobs, {
  timezone: 'UTC'
});

logger.info('Processor worker started.');