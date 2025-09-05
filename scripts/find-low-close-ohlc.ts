
import { PrismaClient } from '../prisma/generated/ohlc_db';
import { Decimal } from 'decimal.js';

const prisma = new PrismaClient();

async function findLowCloseOhlc() {
  console.log('Searching for OHLC data with close value near 0.00000333...');
  try {
    const value = new Decimal('0.00000333');
    const tolerance = new Decimal('0.0000001'); // Increased tolerance a bit

    const results = await prisma.ohlcData.findMany({
      where: {
        close: {
          gte: value.minus(tolerance),
          lte: value.plus(tolerance),
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: 20,
    });

    if (results.length > 0) {
      console.log('Found matching records:');
      console.table(results.map(r => ({
        ...r,
        open: r.open.toString(),
        high: r.high.toString(),
        low: r.low.toString(),
        close: r.close.toString(),
        volume: r.volume.toString(),
      })));
    } else {
      console.log('No records found with a close value near 0.00000333.');
      
      // Let's try to find the minimum close value to see what's there
      const minCloseRecord = await prisma.ohlcData.findFirst({
        orderBy: {
          close: 'asc'
        },
        where: {
          close: {
            gt: 0
          }
        }
      });

      if(minCloseRecord) {
        console.log(`\nFor reference, the lowest non-zero close value found is: ${minCloseRecord.close.toString()} at ${minCloseRecord.timestamp}`);
      }

    }
  } catch (error) {
    console.error('An error occurred while querying the database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

findLowCloseOhlc();
