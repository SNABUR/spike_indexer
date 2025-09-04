// src/scheduler-worker.ts
import { createLogger } from './indexer/utils';
import { startScheduledTasks, stopScheduledTasks } from '../lib/TaskProcessor';
import dotenv from 'dotenv';

dotenv.config();

const logger = createLogger('scheduler-worker');

logger.info('Scheduler worker starting...');

const testnetConfig = {
  rpcUrl: process.env.APTOS_TESTNET_RPC_URL || '',
  chainId: process.env.APTOS_TESTNET_CHAIN_ID || '',
  networkName: 'supra-testnet',
};

const mainnetConfig = {
  rpcUrl: process.env.APTOS_MAINNET_RPC_URL || '',
  chainId: process.env.APTOS_MAINNET_CHAIN_ID || '',
  networkName: 'supra-mainnet',
};

// Inicia las tareas programadas con la configuración de la red
startScheduledTasks({
  testnet: testnetConfig,
  mainnet: mainnetConfig,
});

logger.info('Scheduler worker started and tasks scheduled.');

// Manejo de cierre ordenado
process.on('SIGINT', () => {
  logger.info('SIGINT signal received. Shutting down scheduler worker gracefully.');
  stopScheduledTasks();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received. Shutting down scheduler worker gracefully.');
  stopScheduledTasks();
  process.exit(0);
});
