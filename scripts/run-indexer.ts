import { startIndexer } from '../src/indexer'
import { createLogger } from '../src/indexer/utils'
require('dotenv').config({ path: 'D:/indexer_and_bot_telegram/spike_indexer/.env' });

const logger = createLogger('local-indexer')

process.on('uncaughtException', (error: any) => {
  logger.error('Uncaught Exception:', error)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
  process.exit(1)
})

logger.info('Starting local indexer...')

startIndexer()
  .catch(error => {
    logger.error('Indexer failed:', error)
    process.exit(1)
  }) 