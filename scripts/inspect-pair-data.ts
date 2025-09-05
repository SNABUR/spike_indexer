// scripts/inspect-pair-data.ts
import { PrismaClient as MainPrismaClient } from '../prisma/generated/main_db';
import { PrismaClient as OhlcPrismaClient } from '../prisma/generated/ohlc_db';
import { NetworkConfig } from '../lib/TaskProcessor';
import { fetchBaseData } from '../lib/tasks/update-cycle/data-fetcher';

const spikeDB = new MainPrismaClient();
const ohlcDB = new OhlcPrismaClient();

async function inspectPair(pairAddress: string, network: string) {
  const config: NetworkConfig = {
    networkName: network,
    rpcUrl: '', // Not needed for this script
    chainId: '0', // Not needed for this script
  };

  const baseData = await fetchBaseData(spikeDB, config);
  const { pricesMap, legacyToWrappedMap } = baseData;

  const pair = await spikeDB.ammpair.findUnique({
    where: {
      network_pair: {
        network: network,
        pair: pairAddress,
      },
    },
  });

  if (!pair) {
    console.log(`Pair ${pairAddress} not found on network ${network}`);
    return;
  }

  console.log(`Inspecting pair: ${pair.pair}`);
  console.log(`Token0: ${pair.token0Address}`);
  console.log(`Token1: ${pair.token1Address}`);

  const canonicalToken0 = legacyToWrappedMap.get(pair.token0Address) ?? pair.token0Address;
  const canonicalToken1 = legacyToWrappedMap.get(pair.token1Address) ?? pair.token1Address;

  console.log(`Canonical Token0: ${canonicalToken0}`);
  console.log(`Canonical Token1: ${canonicalToken1}`);

  const price0 = pricesMap.get(canonicalToken0);
  const price1 = pricesMap.get(canonicalToken1);

  console.log(`Price Token0: ${price0}`);
  console.log(`Price Token1: ${price1}`);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const ohlcData = await ohlcDB.ohlcData.findMany({
    where: {
      network: network,
      token0Address: pair.token0Address,
      token1Address: pair.token1Address,
      timestamp: { gte: sevenDaysAgo },
    },
    orderBy: {
      timestamp: 'desc',
    },
  });

  console.log('Recent OHLC Data:');
  console.log(ohlcData);
}

// Replace with the pair address and network you want to inspect
inspectPair('PAIR_ADDRESS_HERE', 'NETWORK_HERE');
