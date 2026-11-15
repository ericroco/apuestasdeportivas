/**
 * Genera secretos NUEVOS para desarrollo local o para un job de CI (nunca reutilizar en staging o producción).
 * Imprime líneas VARIABLE=valor sin comillas, válidas para `.env` y para `$GITHUB_ENV`:
 *
 *   pnpm --filter api exec tsx scripts/generar-secretos.ts >> apps/api/.env
 *
 * Las claves PEM salen en una sola línea con `\n` escritos; `validarEntorno` las normaliza.
 */
import { generateKeyPairSync, randomBytes } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const enUnaLinea = (pem: string): string => pem.trim().replaceAll('\n', String.raw`\n`);

const lineas = [
  `JWT_PRIVATE_KEY=${enUnaLinea(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())}`,
  `JWT_PUBLIC_KEY=${enUnaLinea(publicKey.export({ type: 'spki', format: 'pem' }).toString())}`,
  `TOTP_CLAVE_CIFRADO=${randomBytes(32).toString('base64')}`,
  `WEB_PROXY_SECRETO=${randomBytes(32).toString('base64url')}`,
];

process.stdout.write(`${lineas.join('\n')}\n`);
