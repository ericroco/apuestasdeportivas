/**
 * Imprime el código de 6 dígitos del segundo factor del administrador de demostración LOCAL, para quien no lo
 * tiene en una app de autenticación. Lee `apps/api/.env.cuentas-demo` (lo crea `pnpm --filter api demo:cuentas`).
 *
 *   pnpm --filter api demo:codigo
 */
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import * as OTPAuth from 'otpauth';

const ARCHIVO = '.env.cuentas-demo';
if (!existsSync(ARCHIVO)) {
  console.error('No hay cuentas de demostración: ejecuta antes pnpm --filter api demo:cuentas');
  process.exit(1);
}
const url = parseEnv(readFileSync(ARCHIVO, 'utf8'))['ADMIN_TOTP_URL'];
if (!url) {
  console.error(`Falta ADMIN_TOTP_URL en apps/api/${ARCHIVO}`);
  process.exit(1);
}
const totp = OTPAuth.URI.parse(url);
const segundos = 30 - (Math.floor(Date.now() / 1000) % 30);
console.log(`${totp.generate()}  (vale ${segundos} s más)`);
