const { PrismaClient: MainPrismaClient } = require('../prisma/generated/main_db');
const Decimal = require('decimal.js');

const spikeDB = new MainPrismaClient();

async function inspectPair(pairId: number) {
  try {
    const pair = await spikeDB.ammpair.findUnique({
      where: {
        id: pairId,
      },
      include: {
        token0: true,
        token1: true,
      },
    });

    if (!pair) {
      console.log(`Pair with id ${pairId} not found.`);
      return;
    }

    console.log(`Inspecting Pair ID: ${pair.id}`);
    console.log(`Pair Address: ${pair.pair}`);
    console.log(`----------------------------------`);
    console.log(`Token 0: ${pair.token0.symbol} (${pair.token0Address})`);
    console.log(`Token 1: ${pair.token1.symbol} (${pair.token1Address})`);
    console.log(`----------------------------------`);
    console.log(`Reserve 0: ${pair.reserve0}`);
    console.log(`Reserve 1: ${pair.reserve1}`);
    console.log(`TVL USD: ${pair.tvlUsd}`);
    console.log(`Volume USD 24h: ${pair.volumeUsd24h}`);
    console.log(`Volume USD 7d: ${pair.volumeUsd7d}`);
    console.log(`Volume USD 30d: ${pair.volumeUsd30d}`);
    console.log(`APR 7d: ${pair.apr7d}`);
    console.log(`Last Stats Update: ${pair.lastStatsUpdate}`);
    console.log(`----------------------------------`);

    const token0Price = await spikeDB.token_prices.findUnique({
        where: {
            network_tokenAddress: {
                network: pair.token0Network,
                tokenAddress: pair.token0Address,
            }
        }
    });

    const token1Price = await spikeDB.token_prices.findUnique({
        where: {
            network_tokenAddress: {
                network: pair.token1Network,
                tokenAddress: pair.token1Address,
            }
        }
    });

    console.log(`Token 0 Price (USD): ${token0Price?.priceUsd}`);
    console.log(`Token 1 Price (USD): ${token1Price?.priceUsd}`);

    if (pair.reserve0 && pair.token0.decimals && token0Price?.priceUsd) {
        const reserve0Amount = new Decimal(pair.reserve0).div(new Decimal(10).pow(pair.token0.decimals));
        const reserve0ValueUsd = reserve0Amount.mul(token0Price.priceUsd);
        console.log(`Reserve 0 Value (USD): ${reserve0ValueUsd.toFixed(6)}`);
    }

    if (pair.reserve1 && pair.token1.decimals && token1Price?.priceUsd) {
        const reserve1Amount = new Decimal(pair.reserve1).div(new Decimal(10).pow(pair.token1.decimals));
        const reserve1ValueUsd = reserve1Amount.mul(token1Price.priceUsd);
        console.log(`Reserve 1 Value (USD): ${reserve1ValueUsd.toFixed(6)}`);
    }


  } catch (error) {
    console.error('Error inspecting pair:', error);
  } finally {
    await spikeDB.$disconnect();
  }
}

// ID del par a inspeccionar
const PAIR_ID_TO_INSPECT = 166;
inspectPair(PAIR_ID_TO_INSPECT);