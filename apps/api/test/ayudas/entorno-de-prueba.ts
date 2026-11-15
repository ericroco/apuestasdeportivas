import { generateKeyPairSync, randomBytes } from 'node:crypto';

/**
 * Variables obligatorias del Spec 2 con valores de prueba válidos, para las pruebas unitarias que llaman a
 * `validarEntorno` con un entorno mínimo:
 *
 *   validarEntorno({ DATABASE_URL: '…', REDIS_URL: '…', WEB_ORIGIN: '…', ...VARIABLES_SPEC2_DE_PRUEBA })
 *
 * El par Ed25519 se genera al cargar el módulo y nunca sale de la prueba.
 */
const { privateKey, publicKey } = generateKeyPairSync('ed25519');

export const VARIABLES_SPEC2_DE_PRUEBA = {
  JWT_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  JWT_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  TOTP_CLAVE_CIFRADO: randomBytes(32).toString('base64'),
  // Secreto de prueba de Cloudflare Turnstile: aprueba siempre.
  TURNSTILE_SECRET: '1x0000000000000000000000000000000AA',
  WEB_PROXY_SECRETO: randomBytes(32).toString('base64url'),
} as const;
