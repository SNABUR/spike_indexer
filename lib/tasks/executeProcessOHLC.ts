// D:\Crystara\lib\tasks\executeProcessOHLC.ts
import { PrismaClient } from '../../prisma/generated/main_db';
import { Decimal } from '../../prisma/generated/main_db/runtime/library';
import { createLogger } from '../../src/indexer/utils';
import { NetworkConfig } from '../TaskProcessor';
import { signalDB } from '../signalDB';

const logger = createLogger('executeProcessOHLC');

// La función de agrupación de tiempo no necesita cambios.
function groupTradesByInterval(trades: any[], intervalMinutes = 1) {
    const groups = new Map<string, any[]>();
    const intervalMilliseconds = BigInt(intervalMinutes * 60 * 1000);

    trades.forEach(trade => {
        const tradeTimestampMs = BigInt(trade.timestamp) * 1000n;
        const intervalStartTimestampMs = tradeTimestampMs - (tradeTimestampMs % intervalMilliseconds);

        const key = `${trade.tokenAddress}-${intervalStartTimestampMs.toString()}`;

        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key)?.push(trade);
    });

    return groups;
}

export async function executeProcessOHLC(prismadb: PrismaClient, networkConfig: NetworkConfig) {
    if (!signalDB.hasSignal(networkConfig.networkName)) {
        return;
    }
    
    logger.info(`[${networkConfig.networkName}] Activity signal found. Starting OHLC processing...`);

    try {
        const unprocessedTrades = await prismadb.tradeEvent.findMany({
            where: {
                network: networkConfig.networkName,
                processedForOHLC: false,
            },
            orderBy: {
                timestamp: 'asc'
            }
        });

        if (unprocessedTrades.length === 0) {
            logger.info(`[${networkConfig.networkName}] Signal found, but no new trades in DB yet.`);
            return;
        }

        logger.info(`[${networkConfig.networkName}] Found ${unprocessedTrades.length} new trades to process.`);

        const tradesGrouped = groupTradesByInterval(unprocessedTrades);

        const pools = await prismadb.poolsDB.findMany({
            select: { tokenAddress: true, tokenDecimals: true },
        });
        const decimalsMap = new Map<string, number>();
        for (const pool of pools) {
            decimalsMap.set(pool.tokenAddress, pool.tokenDecimals);
        }

        for (const [key, trades] of tradesGrouped.entries()) {
            if (trades.length === 0) continue;

            const [tokenAddress, timestampStr] = key.split('-');
            const intervalTimestamp = BigInt(timestampStr);
            const granularity = '1m';

            // --- INICIO DEL CAMBIO LÓGICO ---
            // Se modifica esta sección para que coincida con la lógica de `generate-ohlc`.
            
            const prices = trades.map(t => { // 't' es cada 'tradeEvent'
                const tokenDecimals = decimalsMap.get(t.tokenAddress);
                const supraDecimals = 8; // Estándar para Move

                // Si no conocemos los decimales, no podemos calcular el precio.
                if (tokenDecimals === undefined) {
                    logger.warn(`Decimales no encontrados para el token ${t.tokenAddress}, omitiendo trade para el cálculo de precio.`);
                    return null;
                }

                // Usamos las reservas virtuales, que están en el modelo TradeEvent
                const supraReserves = new Decimal(t.virtualSupraReserves.toString());
                const tokenReserves = new Decimal(t.virtualTokenReserves.toString());

                // Si las reservas de token son cero, el precio es infinito o indefinido.
                if (tokenReserves.isZero()) {
                    return null;
                }

                // Ajustamos las reservas a su valor real dividiendo por 10^decimales
                const adjustedSupraReserves = supraReserves.div(new Decimal(10).pow(supraDecimals));
                const adjustedTokenReserves = tokenReserves.div(new Decimal(10).pow(tokenDecimals));

                // Otra comprobación de seguridad después del ajuste
                if (adjustedTokenReserves.isZero()) {
                    return null;
                }

                // El precio = (Reservas de SUPRA ajustadas) / (Reservas de Token ajustadas)
                return adjustedSupraReserves.div(adjustedTokenReserves);
            }).filter((p): p is Decimal => p !== null); // Mantenemos el filtro para eliminar los 'null'

            // --- FIN DEL CAMBIO LÓGICO ---

            if (prices.length === 0) continue;

            const open = prices[0];
            const close = prices[prices.length - 1];
            const high = Decimal.max(...prices);
            const low = Decimal.min(...prices);
            
            // El cálculo del volumen sigue basándose en supraAmount, lo cual es correcto.
            const volumeInSupra = trades.reduce((sum, t) => sum + BigInt(t.supraAmount), 0n);
            const volume = new Decimal(volumeInSupra.toString()).div(new Decimal(10).pow(8));

            await prismadb.token_price_history.upsert({
                where: {
                    network_tokenAddress_timestamp_granularity: {
                        network: networkConfig.networkName,
                        tokenAddress: tokenAddress,
                        timestamp: intervalTimestamp,
                        granularity: granularity
                    }
                },
                update: {
                    high: high,
                    low: low,
                    close: close,
                    volume: volume,
                },
                create: {
                    network: networkConfig.networkName,
                    tokenAddress: tokenAddress,
                    timestamp: intervalTimestamp,
                    granularity: granularity,
                    open: open,
                    high: high,
                    low: low,
                    close: close,
                    volume: volume,
                }
            });
        }

        const tradeIds = unprocessedTrades.map(t => t.id);
        await prismadb.tradeEvent.updateMany({
            where: { id: { in: tradeIds } },
            data: { processedForOHLC: true }
        });

        logger.info(`[${networkConfig.networkName}] Successfully processed ${unprocessedTrades.length} trades and updated OHLC data.`);

        signalDB.clear(networkConfig.networkName);

    } catch (error) {
        logger.error(`[${networkConfig.networkName}] Error during OHLC processing:`, error);
    }
}