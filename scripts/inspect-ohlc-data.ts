const { PrismaClient: OhlcPrismaClient } = require('../prisma/generated/ohlc_db');

const ohlcDB = new OhlcPrismaClient();

async function inspectOhlcForPair() {
    const token0Address = '0x1::supra_coin::SupraCoin';
    const token1Address = '0xe4af154ade9551e7f58a23b8f727ae2dca050f1b74582bb518ba361c889d246d';

    console.log(`--- Inspecting OHLC Data for pair ${token0Address} / ${token1Address} ---`);

    try {
        const records = await ohlcDB.ohlcData.findMany({
            where: {
                OR: [
                    {
                        token0Address: token0Address,
                        token1Address: token1Address,
                    },
                    {
                        token0Address: token1Address,
                        token1Address: token0Address,
                    },
                ],
            },
            orderBy: {
                timestamp: 'desc',
            },
            take: 20,
        });

        if (records.length === 0) {
            console.log('No OHLC data found for this pair.');
        } else {
            console.log('Found OHLC records:');
            console.table(records.map(r => ({
                ...r,
                open: r.open.toString(),
                high: r.high.toString(),
                low: r.low.toString(),
                close: r.close.toString(),
                volume: r.volume.toString(),
            })));
        }
    } catch (error) {
        console.error('Error inspecting OHLC data:', error);
    } finally {
        await ohlcDB.$disconnect();
    }
}

inspectOhlcForPair();