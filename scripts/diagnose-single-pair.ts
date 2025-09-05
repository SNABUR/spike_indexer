// scripts/diagnose-single-pair.ts
import { PrismaClient as MainPrismaClient } from '../prisma/generated/main_db';
import { PrismaClient as OhlcPrismaClient } from '../prisma/generated/ohlc_db';
import { NetworkConfig } from '../lib/TaskProcessor';
import { fetchBaseData } from '../lib/tasks/update-cycle/data-fetcher';
import Decimal from 'decimal.js';
import { toDisplayAmount } from '../lib/tasks/update-cycle/utils';

// Inicializar clientes de Prisma
const spikeDB = new MainPrismaClient();
const ohlcDB = new OhlcPrismaClient();

async function diagnosePair(pairAddress: string, network: string) {
    console.log(`--- Iniciando diagnóstico para el par: ${pairAddress} en la red ${network} ---\n`);

    // 1. OBTENER DATOS BASE
    console.log('1. Obteniendo datos base...');
    const config: NetworkConfig = { networkName: network, rpcUrl: '', chainId: '0' };
    const baseData = await fetchBaseData(spikeDB, config);
    const { pricesMap, decimalsMap, legacyToWrappedMap, wrappedToLegacyMap, swapFeeBps } = baseData;
    console.log(` -> ${pricesMap.size} precios cargados, ${legacyToWrappedMap.size} mapeos legacy.\n`);

    // 2. BUSCAR EL PAR Y SUS TOKENS
    console.log('2. Buscando el par en la DB principal...');
    const pair = await spikeDB.ammpair.findUnique({
        where: { network_pair: { network: network, pair: pairAddress } },
        include: { token0: true, token1: true }
    });

    if (!pair) {
        console.error(`!! ERROR: No se encontró el par con la dirección ${pairAddress}`);
        return;
    }
    console.log(` -> Par encontrado: ${pair.token0.symbol} / ${pair.token1.symbol}`);
    console.log(` -> Datos actuales en DB: Vol24h=${pair.volumeUsd24h}, Vol7d=${pair.volumeUsd7d}, APR7d=${pair.apr7d}\n`);

    // 3. DETERMINAR DIRECCIONES
    console.log('3. Determinando direcciones legacy y canónicas...');
    const canonicalToken0 = legacyToWrappedMap.get(pair.token0Address) ?? pair.token0Address;
    const canonicalToken1 = legacyToWrappedMap.get(pair.token1Address) ?? pair.token1Address;
    const legacyToken0 = wrappedToLegacyMap.get(pair.token0Address) ?? pair.token0Address;
    const legacyToken1 = wrappedToLegacyMap.get(pair.token1Address) ?? pair.token1Address;
    console.log(` -> Token 0: Canónica=${canonicalToken0} | Legacy=${legacyToken0}`);
    console.log(` -> Token 1: Canónica=${canonicalToken1} | Legacy=${legacyToken1}\n`);

    // 4. ANALIZAR PERIODOS DE TIEMPO
    await analyzePeriod('7 días', 7, network, legacyToken0, legacyToken1, baseData, pair);
    await analyzePeriod('24 horas', 1, network, legacyToken0, legacyToken1, baseData, pair);

    console.log('--- Diagnóstico Finalizado ---');
}

async function analyzePeriod(label: string, days: number, network: string, legacyToken0: string, legacyToken1: string, baseData: any, pair: any) {
    console.log(`------------------------------------------------------`);
    console.log(`4. ANALIZANDO PERIODO: ${label.toUpperCase()}`);
    console.log(`------------------------------------------------------\n`);

    const { pricesMap, decimalsMap, legacyToWrappedMap, wrappedToLegacyMap, swapFeeBps } = baseData;
    const canonicalToken0 = legacyToWrappedMap.get(pair.token0Address) ?? pair.token0Address;
    const canonicalToken1 = legacyToWrappedMap.get(pair.token1Address) ?? pair.token1Address;

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    console.log(`4.1. Consultando volumen bruto en OHLC-DB (desde ${sinceDate.toISOString()})...`);
    const result = await ohlcDB.ohlcData.groupBy({
        by: ['token0Address', 'token1Address'],
        where: {
            network: network,
            ammSource: 'SpikeySwap',
            timeframe: '1d',
            OR: [
                { token0Address: legacyToken0, token1Address: legacyToken1 },
                { token0Address: legacyToken1, token1Address: legacyToken0 },
            ],
            timestamp: { gte: sinceDate },
        },
        _sum: { volume: true },
        _count: { _all: true },
    });

    if (result.length === 0) {
        console.log(' -> No se encontraron datos de volumen en este periodo.\n');
    } else {
        console.log(` -> Se encontraron ${result.length} grupos de volumen:`);
        for (const [index, group] of result.entries()) {
            console.log(`    Grupo ${index + 1}: ${group._count._all} registros sumados`);
            console.log(`      token0: ${group.token0Address}`);
            console.log(`      token1: ${group.token1Address}`);
            console.log(`      volumen total: ${group._sum.volume}`);
        }
        // Vamos a ver los registros individuales si son pocos
        const individualRecords = await ohlcDB.ohlcData.findMany({
             where: {
                network: network, ammSource: 'SpikeySwap', timeframe: '1d',
                OR: [{ token0Address: legacyToken0, token1Address: legacyToken1 }, { token0Address: legacyToken1, token1Address: legacyToken0 }],
                timestamp: { gte: sinceDate },
            },
            orderBy: { timestamp: 'desc' }
        });
        console.log('\n -> Registros individuales encontrados:');
        individualRecords.forEach(r => {
            console.log(`    - ID: ${r.id}, Fecha: ${r.timestamp.toISOString()}, Vol: ${r.volume}, Close: ${r.close}, T0: ${r.token0Address}, T1: ${r.token1Address}`);
        })
        console.log('');
    }

    console.log('4.2. Simulando el cálculo de volumen en USD...');
    let totalVolumeUsd = new Decimal(0);

    for (const group of result) {
        const wrappedToken0 = legacyToWrappedMap.get(group.token0Address) ?? group.token0Address;
        const wrappedToken1 = legacyToWrappedMap.get(group.token1Address) ?? group.token1Address;

        const totalVolumeInToken1 = group._sum.volume ?? new Decimal(0);
        const priceToken1 = pricesMap.get(wrappedToken1);
        const volumeUsd = priceToken1 ? totalVolumeInToken1.mul(priceToken1) : new Decimal(0);
        
        console.log(` -> Procesando grupo: ${group.token0Address} / ${group.token1Address}`);
        console.log(`    - Volumen en Token1 (${wrappedToken1}): ${totalVolumeInToken1}`);
        console.log(`    - Precio de Token1: ${priceToken1 ? priceToken1.toString() : 'No encontrado'}`);
        console.log(`    - Volumen calculado en USD: ${volumeUsd.toString()}`);
        totalVolumeUsd = totalVolumeUsd.plus(volumeUsd);
    }
    console.log(` -> Volumen total (corregido) para ${label}: ${totalVolumeUsd.toString()} USD\n`);

    console.log('4.3. Calculando TVL y APR...');
    let pairTvlUsd = new Decimal(0);
    const price0 = pricesMap.get(canonicalToken0);
    const price1 = pricesMap.get(canonicalToken1);
    const decimals0 = decimalsMap.get(canonicalToken0);
    const decimals1 = decimalsMap.get(canonicalToken1);

    if (pair.reserve0 && price0 && decimals0 !== undefined) {
        pairTvlUsd = pairTvlUsd.plus(toDisplayAmount(pair.reserve0, decimals0).mul(price0));
    }
    if (pair.reserve1 && price1 && decimals1 !== undefined) {
        pairTvlUsd = pairTvlUsd.plus(toDisplayAmount(pair.reserve1, decimals1).mul(price1));
    }
    
    const swapFee = swapFeeBps ? new Decimal(swapFeeBps).div(10000) : new Decimal(0);
    const totalFeesUsd = totalVolumeUsd.mul(swapFee);
    const averageDailyFees = totalFeesUsd.div(days);
    const dailyApr = pairTvlUsd.isZero() ? new Decimal(0) : averageDailyFees.div(pairTvlUsd);
    const yearlyApr = dailyApr.mul(365).mul(100);

    console.log(` -> TVL del par: ${pairTvlUsd.toString()} USD`);
    console.log(` -> Comisiones totales en ${label} (USD): ${totalFeesUsd}`);
    console.log(` -> APR Anual para ${label}: ${yearlyApr.toFixed(2)}%\n`);
}


// --- INSTRUCCIONES ---
const PAIR_ADDRESS = "0xda59f918e6e075d3a345f3fc35237524e396c98e31a3653a353b4a282152c824";
const NETWORK = "supra-mainnet"; // Reemplaza con la red correcta si no es "sui"

diagnosePair(PAIR_ADDRESS, NETWORK).catch(console.error);
