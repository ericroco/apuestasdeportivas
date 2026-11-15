// Levanta la API y el servicio de reportes simulados para el E2E del Spec 4 (playwright.config.ts).
// Uso: node e2e/simulado/servidor.mjs. Puertos: E2E_API_SIMULADA_PORT y E2E_REPORTES_SIMULADO_PORT.
import { createServer } from 'node:http';
import { atenderApi } from './api.mjs';
import { enviarJson } from './http.mjs';
import { atenderReportes } from './reportes.mjs';

const PUERTO_API = Number(process.env.E2E_API_SIMULADA_PORT ?? 4010);
const PUERTO_REPORTES = Number(process.env.E2E_REPORTES_SIMULADO_PORT ?? 4011);

/** Un error del simulador no debe tumbar el proceso: responde 500 y sigue. */
function seguro(atender) {
  return (peticion, respuesta) => {
    Promise.resolve(atender(peticion, respuesta)).catch((causa) => {
      process.stderr.write(`Simulador: ${String(causa)}\n`);
      if (!respuesta.headersSent) enviarJson(respuesta, 500, { message: 'Error del simulador' });
    });
  };
}

createServer(seguro(atenderApi)).listen(PUERTO_API, '127.0.0.1');
createServer(seguro(atenderReportes)).listen(PUERTO_REPORTES, '127.0.0.1');
process.stdout.write(
  `API simulada en :${PUERTO_API} y reportes simulados en :${PUERTO_REPORTES}\n`,
);
