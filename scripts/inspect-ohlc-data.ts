// scripts/inspect-ohlc-data.ts
import { PrismaClient as OhlcPrismaClient } from '../prisma/generated/ohlc_db';

const ohlcDB = new OhlcPrismaClient();

async function inspectOhlcData() {
  console.log('Inspecting OHLC data...');

  const ohlcData = await ohlcDB.ohlcData.findMany({
    where: {
      timeframe: '1d',
    },
    take: 10,
  });

  console.log('OHLC Data (1d):');
  console.log(ohlcData);
}

inspectOhlcData();