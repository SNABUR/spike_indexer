import { EventPoller } from './indexer/poller'
import { createLogger } from './indexer/utils'
import {
  SUPRA_RPC_URL_TESTNET,
  SUPRA_RPC_URL_MAINNET,
  CHAIN_ID_SUPRA_TESTNET,
  CHAIN_ID_SUPRA_MAINNET
} from './indexer/rpcClient'

const logger = createLogger('poller-worker')

let indexerActive = false;

interface PollerInstances {
  testnet?: EventPoller;
  mainnet?: EventPoller;
}
let pollers: PollerInstances = {};

const POLLER_IDS = {
  TESTNET: 'supra-testnet',
  MAINNET: 'supra-mainnet'
};

export async function startPoller() {
  if (indexerActive && (pollers.testnet || pollers.mainnet)) {
    logger.info('Pollers are already running or starting.');
    if (pollers.testnet) logger.info(`Poller ${POLLER_IDS.TESTNET} status: running (assumed)`);
    if (pollers.mainnet) logger.info(`Poller ${POLLER_IDS.MAINNET} status: running (assumed)`);
    return;
  }

  logger.info('Starting Supra Chain Pollers for Testnet and Mainnet...');
  indexerActive = true;

  const pollerConfigBase = {
    maxRequestsPerSecond: parseInt(process.env.MAX_REQUESTS_PER_SECOND || '10', 10),
  };

  if (SUPRA_RPC_URL_TESTNET && CHAIN_ID_SUPRA_TESTNET) {
    logger.info(`Setting up poller for Testnet (ID: ${POLLER_IDS.TESTNET})`);
    pollers.testnet = new EventPoller(
      POLLER_IDS.TESTNET,
      CHAIN_ID_SUPRA_TESTNET,
      SUPRA_RPC_URL_TESTNET,
      pollerConfigBase
    );
  } else {
    logger.warn('Testnet RPC URL or Chain ID not configured. Testnet poller will not start.');
  }

  if (SUPRA_RPC_URL_MAINNET && CHAIN_ID_SUPRA_MAINNET) {
    logger.info(`Setting up poller for Mainnet (ID: ${POLLER_IDS.MAINNET})`);
    pollers.mainnet = new EventPoller(
      POLLER_IDS.MAINNET,
      CHAIN_ID_SUPRA_MAINNET,
      SUPRA_RPC_URL_MAINNET,
      pollerConfigBase
    );
  } else {
    logger.warn('Mainnet RPC URL or Chain ID not configured. Mainnet poller will not start.');
  }

  const startingPollers: Promise<void>[] = [];
  if (pollers.testnet) {
    startingPollers.push(
      pollers.testnet.initialize().then(() => pollers.testnet!.start())
      .catch(err => {
        logger.error(`Error starting Testnet poller:`, err);
        pollers.testnet = undefined;
      })
    );
  }
  if (pollers.mainnet) {
    startingPollers.push(
      pollers.mainnet.initialize().then(() => pollers.mainnet!.start())
      .catch(err => {
        logger.error(`Error starting Mainnet poller:`, err);
        pollers.mainnet = undefined;
      })
    );
  }

  if (startingPollers.length === 0) {
    logger.warn('No pollers were configured or started. Indexer effectively idle.');
    indexerActive = false;
    return;
  }

  if (startingPollers.length > 0) {
    try {
      await Promise.all(startingPollers);
      logger.info('All configured indexer pollers started (or attempted to start).');
    } catch (error) {
      logger.error('An error occurred during the startup of one or more pollers:', error);
    }
  }
}

export async function stopPoller() {
  logger.info('Stopping Supra Chain Pollers...');
  indexerActive = false;

  const stoppingPollers: Promise<void>[] = [];
  if (pollers.testnet) {
    logger.info(`Stopping Testnet poller (ID: ${POLLER_IDS.TESTNET})...`);
    stoppingPollers.push(pollers.testnet.stop().catch(err => logger.error(`Error stopping Testnet poller:`, err)));
  }
  if (pollers.mainnet) {
    logger.info(`Stopping Mainnet poller (ID: ${POLLER_IDS.MAINNET})...`);
    stoppingPollers.push(pollers.mainnet.stop().catch(err => logger.error(`Error stopping Mainnet poller:`, err)));
  }

  if (stoppingPollers.length > 0) {
    await Promise.all(stoppingPollers);
  }

  pollers = {};
  logger.info('Indexer pollers stopped (or attempted to stop).');
}

startPoller();
