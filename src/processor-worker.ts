import { createLogger } from './indexer/utils';
import cron from 'node-cron';
import queuePrismadb from '../lib/queue-prismadb';
import prismadb from '../lib/queue-prismadb';
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

  try {
    await prismadb.$transaction(async (tx) => {
      await processEvents(events, events[0].network, tx);
    });

    await queuePrismadb.job.updateMany({
      where: {
        id: {
          in: jobs.map(job => job.id),
        },
      },
      data: {
        processed: true,
      },
    });

    logger.info(`Successfully processed ${jobs.length} jobs.`);
  } catch (error) {
    logger.error('Error processing jobs:', error);
    // Optionally, you could add more sophisticated error handling here,
    // like marking jobs as failed instead of just leaving them as unprocessed.
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