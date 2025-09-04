// Constantes de configuración
import { createLogger } from '../../src/indexer/utils';
const logger = createLogger('executeGetReserves-task');

const SUPRA_RPC_URL_TESTNET = process.env.NEXT_PUBLIC_SUPRA_RPC_URL_TESTNET || '';
const SUPRA_RPC_URL_MAINNET = process.env.NEXT_PUBLIC_SUPRA_RPC_URL_MAINNET || '';

// Mapeo de identificadores de red a URLs RPC
const RPC_URLS: Record<string, string> = {
  'supra-testnet': SUPRA_RPC_URL_TESTNET, // Clave coincide con el valor de 'network'
  'supra-mainnet': SUPRA_RPC_URL_MAINNET, // Clave coincide con el valor de 'network'
};

/**
 * Llama a una función de vista en Supra y devuelve los datos obtenidos.
 * @param network Identificador de la red ('testnet', 'mainnet')
 * @param functionName Nombre de la función de vista a llamar
 * @param typeArgs Argumentos de tipo para la función de vista
 * @param args Argumentos para la función de vista
 * @returns Datos devueltos por la API
 * @throws Error si la llamada falla o no se devuelven datos
 */
// En tu archivo useView.ts o similar

export async function callViewFunction(
  network: string,
  modulepath: string,
  functionName: string,
  typeArgs: any[],
  args: string[]
): Promise<any> {
  const rpcUrl = RPC_URLS[network];
  if (!rpcUrl) {
    logger.error(`❌ Configuración de RPC faltante para la red: ${network}`);
    throw new Error(`Unsupported network: ${network}. No RPC URL configured.`);
  }

  const contractFunctionName = `${modulepath}::${functionName}`;

  const payload = {
    function: contractFunctionName,
    type_arguments: typeArgs,
    arguments: args,
  };

  // --- LOG #1: QUÉ ESTAMOS ENVIANDO ---
  // Este es el log más importante. Nos muestra el payload exacto.
  logger.debug(`[${network}] Intentando llamar a la función view con el payload:`, JSON.stringify(payload, null, 2));

  try {
    const response = await fetch(`${rpcUrl}/view`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let errorBody = 'No se pudo leer el cuerpo del error.';
      try {
        // Intenta leer el error como JSON, que es lo más común.
        const errorJson = await response.json();
        errorBody = JSON.stringify(errorJson, null, 2);
      } catch (e) {
        // Si falla, léelo como texto plano.
        errorBody = await response.text();
      }
      
      // --- LOG #2: EL SERVIDOR RPC RESPONDIÓ CON UN ERROR ---
      logger.error(`[${network}] El servidor RPC respondió con un error HTTP ${response.status} para la función ${functionName}. Cuerpo del error:`, errorBody);
      
      // Lanza un error claro que será capturado por la función que llama (getSwapFee)
      throw new Error(`RPC request failed with status ${response.status}`);
    }

    const data = await response.json();

    // --- LOG #3: ÉXITO ---
    // Logueamos la respuesta exitosa para poder inspeccionarla.
    logger.debug(`[${network}] Llamada exitosa a la función ${functionName}. Respuesta recibida:`, JSON.stringify(data, null, 2));
    
    return data;

  } catch (error: any) {
    // --- LOG #4: ERROR DE RED O CONEXIÓN ---
    // Este bloque 'catch' se activa si 'fetch' falla por completo (ej. timeout, sin conexión, DNS).
    // Aquí es donde probablemente se origina tu error `{}`.
    logger.error(`[${network}] Fallo de red o conexión al llamar a la función ${functionName}. Error:`, error);

    // Re-lanzamos el error para que la función que llama (getSwapFee) sepa que algo salió mal.
    throw new Error(`Network or connection error calling view function: ${error.message || 'Unknown fetch error'}`);
  }
}