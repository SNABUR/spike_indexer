
const { PrismaClient } = require('../prisma/generated/main_db');
require('dotenv').config({ path: 'D:/indexer_and_bot_telegram/spike_indexer/.env' });
const { executeUpdateAmmData } = require('../lib/tasks/executeUpdateAmmData');
const { NetworkConfig } = require('../lib/TaskProcessor');
type NetworkConfigType = typeof NetworkConfig;
const { createLogger } = require('../src/indexer/utils');

const logger = createLogger('run-update-amm-data');

async function main() {
  const spikeDB = new PrismaClient();
  const config: NetworkConfigType = {
    rpcUrl: process.env.NEXT_PUBLIC_SUPRA_RPC_URL_MAINNET || '',
    chainId: 'supra-mainnet', // This is not in the .env file, but it is not used in the script
    networkName: process.env.NEXT_PUBLIC_SUPRA_MAINNET || 'supra-mainnet',
  };

  try {
    await executeUpdateAmmData(spikeDB, config);
  } catch (error) {
    logger.error('Error running executeUpdateAmmData:', error);
  } finally {
    await spikeDB.$disconnect();
  }
}

main();
