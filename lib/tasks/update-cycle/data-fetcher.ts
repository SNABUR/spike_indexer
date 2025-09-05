import { Ammpair, PrismaClient as MainPrismaClient } from '../../../prisma/generated/main_db';
import { PrismaClient as OhlcPrismaClient } from '../../../prisma/generated/ohlc_db';
import { NetworkConfig } from '../../TaskProcessor';
import { getSwapFee } from '../../functions/getSwapFee';
import Decimal from 'decimal.js';

// --- Tipos de Datos Exportados ---

// El tipo para el mapa de volúmenes
export type VolumeMap = Map<string, Decimal>;

export interface BaseData {
    pricesMap: Map<string, Decimal>;
    decimalsMap: Map<string, number>;
    swapFeeBps: string | null;
    legacyToWrappedMap: Map<string, string>;
    wrappedToLegacyMap: Map<string, string>;
}

// --- Funciones de Obtención de Datos ---

/**
 * Obtiene datos base (precios, decimales, mapeos de legacy) desde la DB principal (Supabase).
 */
export async function fetchBaseData(spikeDB: MainPrismaClient, config: NetworkConfig): Promise<BaseData> {
    const tokens = await spikeDB.tokens.findMany({ where: { network: config.networkName } });
    const prices = await spikeDB.token_prices.findMany({ where: { network: config.networkName } });
    const swapFeeResult = await getSwapFee(config);

    const decimalsMap = new Map<string, number>();
    const legacyToWrappedMap = new Map<string, string>();
    const wrappedToLegacyMap = new Map<string, string>();

    tokens.forEach(t => {
        if (t.decimals !== null) decimalsMap.set(t.id, t.decimals);
        // Si el token tiene un originalCoinType, es una moneda legacy. Mapeamos su dirección legacy a su ID (que es la dirección wrapped).
        if (t.originalCoinType) {
            legacyToWrappedMap.set(t.originalCoinType, t.id);
            wrappedToLegacyMap.set(t.id, t.originalCoinType);
        }
    });

    const pricesMap = new Map<string, Decimal>();
    prices.forEach(tp => { if (tp.priceUsd) pricesMap.set(tp.tokenAddress, new Decimal(tp.priceUsd.toString())); });

    return {
        pricesMap,
        decimalsMap,
        swapFeeBps: swapFeeResult ? swapFeeResult[0] : null,
        legacyToWrappedMap,
        wrappedToLegacyMap,
    };
}

/**
 * Obtiene los pares AMM y sus reservas directamente desde la DB principal.
 * Esta es ahora la fuente de verdad para los pares a procesar.
 */
export async function fetchAmmPairsToProcess(spikeDB: MainPrismaClient, config: NetworkConfig): Promise<Ammpair[]> {
    return await spikeDB.ammpair.findMany({
        where: {
            network: config.networkName,
            reserve0: { not: null },
            reserve1: { not: null },
        },
    });
}

/**
 * Obtiene el volumen de las últimas 24 horas para cada par desde la DB de OHLC.
 * Utiliza el timeframe '1d' pre-agregado y lo convierte a USD.
 */
export async function fetch24hVolumeData(
    ohlcDB: OhlcPrismaClient,
    spikeDB: MainPrismaClient,
    config: NetworkConfig,
    pricesMap: Map<string, Decimal>,
    wrappedToLegacyMap: Map<string, string>,
    legacyToWrappedMap: Map<string, string>
): Promise<VolumeMap> {
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const allPairs = await spikeDB.ammpair.findMany({
        where: { network: config.networkName },
    });

    const volumeMap: VolumeMap = new Map();

    for (const pair of allPairs) {
        const legacyToken0 = wrappedToLegacyMap.get(pair.token0Address) ?? pair.token0Address;
        const legacyToken1 = wrappedToLegacyMap.get(pair.token1Address) ?? pair.token1Address;

        const result = await ohlcDB.ohlcData.groupBy({
            by: ['token0Address', 'token1Address'],
            where: {
                network: config.networkName,
                ammSource: 'SpikeySwap',
                timeframe: '1d',
                OR: [
                    { token0Address: legacyToken0, token1Address: legacyToken1 },
                    { token0Address: legacyToken1, token1Address: legacyToken0 },
                ],
                timestamp: { gte: twentyFourHoursAgo },
            },
            _sum: { volume: true },
        });

        for (const group of result) {
            const wrappedToken0 = legacyToWrappedMap.get(group.token0Address) ?? group.token0Address;
            const wrappedToken1 = legacyToWrappedMap.get(group.token1Address) ?? group.token1Address;
            const key = [wrappedToken0, wrappedToken1].sort().join('-').toLowerCase();

            const totalVolumeInToken1 = group._sum.volume ?? new Decimal(0);
            const priceToken1 = pricesMap.get(wrappedToken1);
            const volumeUsd = priceToken1 ? totalVolumeInToken1.mul(priceToken1) : new Decimal(0);
            volumeMap.set(key, volumeUsd);
        }
    }

    return volumeMap;
}

/**
 * Obtiene el volumen de los últimos 7 días para cada par desde la DB de OHLC.
 * Suma los volúmenes de los últimos 7 registros con timeframe '1d' y los convierte a USD.
 */
export async function fetch7dVolumeData(
    ohlcDB: OhlcPrismaClient,
    spikeDB: MainPrismaClient,
    config: NetworkConfig,
    pricesMap: Map<string, Decimal>,
    wrappedToLegacyMap: Map<string, string>,
    legacyToWrappedMap: Map<string, string>
): Promise<VolumeMap> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const allPairs = await spikeDB.ammpair.findMany({
        where: { network: config.networkName },
    });

    const volumeMap: VolumeMap = new Map();

    for (const pair of allPairs) {
        const legacyToken0 = wrappedToLegacyMap.get(pair.token0Address) ?? pair.token0Address;
        const legacyToken1 = wrappedToLegacyMap.get(pair.token1Address) ?? pair.token1Address;

        const result = await ohlcDB.ohlcData.groupBy({
            by: ['token0Address', 'token1Address'],
            where: {
                network: config.networkName,
                ammSource: 'SpikeySwap',
                timeframe: '1d',
                OR: [
                    { token0Address: legacyToken0, token1Address: legacyToken1 },
                    { token0Address: legacyToken1, token1Address: legacyToken0 },
                ],
                timestamp: { gte: sevenDaysAgo },
            },
            _sum: { volume: true },
        });

        for (const group of result) {
            const wrappedToken0 = legacyToWrappedMap.get(group.token0Address) ?? group.token0Address;
            const wrappedToken1 = legacyToWrappedMap.get(group.token1Address) ?? group.token1Address;
            const key = [wrappedToken0, wrappedToken1].sort().join('-').toLowerCase();

            const totalVolumeInToken1 = group._sum.volume ?? new Decimal(0);
            const priceToken1 = pricesMap.get(wrappedToken1);
            const volumeUsd = priceToken1 ? totalVolumeInToken1.mul(priceToken1) : new Decimal(0);
            volumeMap.set(key, volumeUsd);
        }
    }

    return volumeMap;
}
/**
 * Obtiene el volumen de los últimos 30 días para cada par desde la DB de OHLC.
 * Suma los volúmenes de los últimos 30 registros con timeframe '1d' y los convierte a USD.
 */
export async function fetch30dVolumeData(
    ohlcDB: OhlcPrismaClient,
    spikeDB: MainPrismaClient,
    config: NetworkConfig,
    pricesMap: Map<string, Decimal>,
    wrappedToLegacyMap: Map<string, string>,
    legacyToWrappedMap: Map<string, string>
): Promise<VolumeMap> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const allPairs = await spikeDB.ammpair.findMany({
        where: { network: config.networkName },
    });

    const volumeMap: VolumeMap = new Map();

    for (const pair of allPairs) {
        const legacyToken0 = wrappedToLegacyMap.get(pair.token0Address) ?? pair.token0Address;
        const legacyToken1 = wrappedToLegacyMap.get(pair.token1Address) ?? pair.token1Address;

        const result = await ohlcDB.ohlcData.groupBy({
            by: ['token0Address', 'token1Address'],
            where: {
                network: config.networkName,
                ammSource: 'SpikeySwap',
                timeframe: '1d',
                OR: [
                    { token0Address: legacyToken0, token1Address: legacyToken1 },
                    { token0Address: legacyToken1, token1Address: legacyToken0 },
                ],
                timestamp: { gte: thirtyDaysAgo },
            },
            _sum: { volume: true },
        });

        for (const group of result) {
            const wrappedToken0 = legacyToWrappedMap.get(group.token0Address) ?? group.token0Address;
            const wrappedToken1 = legacyToWrappedMap.get(group.token1Address) ?? group.token1Address;
            const key = [wrappedToken0, wrappedToken1].sort().join('-').toLowerCase();

            const totalVolumeInToken1 = group._sum.volume ?? new Decimal(0);
            const priceToken1 = pricesMap.get(wrappedToken1);
            const volumeUsd = priceToken1 ? totalVolumeInToken1.mul(priceToken1) : new Decimal(0);
            volumeMap.set(key, volumeUsd);
        }
    }

    return volumeMap;
}