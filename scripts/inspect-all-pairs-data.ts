// scripts/inspect-all-pairs-data.ts
import { PrismaClient as MainPrismaClient } from '../prisma/generated/main_db';
import { PrismaClient as OhlcPrismaClient } from '../prisma/generated/ohlc_db';
import { NetworkConfig } from '../lib/TaskProcessor';
import { fetchBaseData } from '../lib/tasks/update-cycle/data-fetcher';

const spikeDB = new MainPrismaClient();
const ohlcDB = new OhlcPrismaClient();

async function inspectAllPairs(network: string) {
  const config: NetworkConfig = {
    networkName: network,
    rpcUrl: '', // Not needed for this script
    chainId: '0', // Not needed for this script
  };

  const baseData = await fetchBaseData(spikeDB, config);
  const { pricesMap, legacyToWrappedMap, wrappedToLegacyMap } = baseData;

  const allPairs = await spikeDB.ammpair.findMany({
    where: {
      network: network,
    },
  });

  if (!allPairs.length) {
    console.log(`No pairs found on network ${network}`);
    return;
  }

  console.log(`Found ${allPairs.length} pairs to inspect.`);

  for (const pair of allPairs) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Inspecting pair: ${pair.pair}`);
    console.log(`Token0: ${pair.token0Address}`);
    console.log(`Token1: ${pair.token1Address}`);
    console.log(`APR 24h (from DB): ${pair.apr24h}`);
    console.log(`Volume USD 24h (from DB): ${pair.volumeUsd24h}`);

    const legacyToken0 = wrappedToLegacyMap.get(pair.token0Address) ?? pair.token0Address;
    const legacyToken1 = wrappedToLegacyMap.get(pair.token1Address) ?? pair.token1Address;

    console.log(`Legacy Token0: ${legacyToken0}`);
    console.log(`Legacy Token1: ${legacyToken1}`);

    const ohlcData = await ohlcDB.ohlcData.findMany({
      where: {
        network: network,
        timeframe: '1d',
        ammSource: 'DexlynSwap',
        OR: [
          {
            token0Address: legacyToken0,
            token1Address: legacyToken1,
          },
          {
            token0Address: legacyToken1,
            token1Address: legacyToken0,
          },
        ],
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    console.log('Recent OHLC Data (1d):');
    console.log(ohlcData);
  }
}

// Replace with the network you want to inspect
inspectAllPairs('supra-mainnet');