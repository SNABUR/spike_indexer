// scripts/fix-pair-volume.ts
import { PrismaClient as OhlcPrismaClient } from '../prisma/generated/ohlc_db';
import { Decimal } from 'decimal.js';

const ohlcDB = new OhlcPrismaClient();

async function fixVolume() {
    const NETWORK = "supra-mainnet";
    const LEGACY_TOKEN_0 = "0x1::supra_coin::SupraCoin";
    const LEGACY_TOKEN_1 = "0xe4af154ade9551e7f58a23b8f727ae2dca050f1b74582bb518ba361c889d246d";
    const DAYS_TO_FIX = 7;

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - DAYS_TO_FIX);

    console.log(`Buscando registros de OHLC para el par ${LEGACY_TOKEN_0} / ${LEGACY_TOKEN_1} desde ${sinceDate.toISOString()}...`);

    const whereClause = {
        network: NETWORK,
        timeframe: '1d',
        timestamp: { gte: sinceDate },
        OR: [
            { token0Address: LEGACY_TOKEN_0, token1Address: LEGACY_TOKEN_1 },
            { token0Address: LEGACY_TOKEN_1, token1Address: LEGACY_TOKEN_0 },
        ],
    };

    const recordsToUpdate = await ohlcDB.ohlcData.findMany({ where: whereClause });

    if (recordsToUpdate.length === 0) {
        console.log("No se encontraron registros para actualizar.");
        return;
    }

    console.log(`Se encontraron ${recordsToUpdate.length} registros para actualizar. IDs: ${recordsToUpdate.map(r => r.id).join(', ')}`);
    console.log("Actualizando el campo 'volume' a 0 para estos registros...");

    const updateResult = await ohlcDB.ohlcData.updateMany({
        where: whereClause,
        data: {
            volume: new Decimal(0),
        },
    });

    console.log(`\n¡Éxito! Se actualizaron ${updateResult.count} registros.`);
    console.log("El volumen para este par en los últimos 7 días ha sido puesto a cero.");
}

fixVolume().catch(console.error).finally(() => ohlcDB.$disconnect());
