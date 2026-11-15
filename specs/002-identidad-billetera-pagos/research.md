# Research: Identidad, billetera y pagos

Decisiones técnicas del Spec 2. Cada sección: decisión, razón y alternativas descartadas.

## 1. Sesión entre dominios: proxy de la API dentro de Next.js

- **Decisión**: el navegador nunca llama a la API de Render directamente (salvo el WebSocket del Spec 3, que usa
  ticket). Llama a `/api/*` de la propia web, y un route handler de Next.js (`apps/web/src/app/api/[...ruta]/route.ts`)
  reenvía la petición a `API_URL` desde el servidor: copia método, cuerpo y cookies, y devuelve el estado, el cuerpo
  y los `Set-Cookie` de la API. Así las cookies `acceso` y `renovacion` son del dominio de la web (primera parte) y
  `SameSite=Lax` funciona.
- **IP real del cliente**: el proxy agrega `x-cliente-ip` (de `x-forwarded-for` de Vercel), `x-cliente-dispositivo`
  (User-Agent) y `x-proxy-secreto` (`WEB_PROXY_SECRETO`, compartido solo entre servidores). La API usa
  `x-cliente-ip` solo si el secreto coincide (comparación en tiempo constante); si no, usa `request.ip` con
  `TRUST_PROXY_HOPS=1`. Sin esto, la auditoría y el rate limiting verían a todos los usuarios con la IP de Vercel.
- **Rate limiting**: el `ThrottlerGuard` global del Spec 1 se reemplaza en `app.module.ts` por una subclase que
  usa la misma IP resuelta como clave (`getTracker`).
- **CSRF**: además de `SameSite=Lax`, el proxy rechaza peticiones que no sean `GET`/`HEAD` cuyo `Origin` no sea el
  de la web.
- **Componentes de servidor**: para renderizar datos del usuario, el servidor de Next.js llama a la API con el
  mismo helper (reenviando la cookie `acceso`).
- **Alternativas**: `SameSite=None` con CORS y credenciales (las cookies de terceros se bloquean cada vez más y
  abre CSRF); dominio propio común para web y API (requiere comprar un dominio); `rewrites` de Next.js (no permite
  agregar la cabecera secreta ni validar el `Origin`).

## 2. Token de acceso: JWT EdDSA con `jose`

- **Decisión**: `jose` firma con Ed25519 (`alg: EdDSA`) usando `JWT_PRIVATE_KEY` (PEM PKCS#8) y verifica con
  `JWT_PUBLIC_KEY` (PEM SPKI). Claims del contrato 6 (`sub`, `email`, `roles`, `iat`, `exp`, `iss: apuestas-api`,
  `aud: apuestas`) más dos aditivas: `sid` (id de la sesión, para cerrarla) y `alc` (alcance: `completo` o
  `activar-2fa`). `exp` = 15 minutos. Reportes verifica con PyJWT + `cryptography` (soportan EdDSA).
- **Revocación inmediata** (suspensión, cambio de contraseña o de roles): Redis guarda
  `identidad:revocado-antes:<usuarioId>` = instante, con caducidad igual a la del acceso. El guard rechaza tokens con
  `iat` anterior. Reportes no consulta Redis: acepta como riesgo residual hasta 15 minutos (solo administradores).
- **Alternativas**: RS256 (claves y firmas más grandes, sin ventaja); HS256 (reportes podría emitir tokens);
  consultar la base de datos en cada petición (latencia innecesaria).

## 3. Renovación rotativa con detección de reutilización

- **Decisión**: la credencial de renovación es un valor aleatorio de 32 bytes (base64url) en la cookie
  `renovacion` (`httpOnly`, `Secure`, `SameSite=Lax`, `Path=/api/identidad/sesion`). En la base de datos solo se
  guarda su SHA-256. Cada renovación marca la sesión como usada y crea una nueva de la misma familia, en una
  transacción con `FOR UPDATE` sobre la fila.
- **Reutilización**: si llega una credencial ya usada hace más de 10 s, se revocan todas las sesiones del usuario
  y se audita `sesion.reutilizacion_detectada`. Si se usó hace menos de 10 s (dos pestañas a la vez), responde 409
  sin revocar nada, y el cliente reintenta con la cookie nueva.
- **Alternativas**: renovación sin rotación (no detecta robos); guardar la credencial en claro (una fuga de la
  base de datos daría sesiones válidas).

## 4. Contraseñas: Argon2id con `argon2`

- **Decisión**: paquete `argon2` (binding en C con binarios precompilados) con Argon2id, `memoryCost` 19 MiB,
  `timeCost` 2 y `parallelism` 1 (mínimo de OWASP). Política: 12 caracteres como mínimo, 128 como máximo, sin estar
  en una lista local de 10 000 contraseñas comunes (archivo de texto en el repositorio). Cuando el correo no existe,
  se verifica contra un hash ficticio para igualar el tiempo de respuesta.
- **Alternativas**: `bcrypt` (válido, pero limita a 72 bytes); `@node-rs/argon2` (es un binding de Rust y el
  proyecto prohíbe Rust); consultar Have I Been Pwned (envía datos a un tercero).

## 5. Segundo factor: TOTP con `otpauth`

- **Decisión**: `otpauth` con SHA-1, 6 dígitos y periodo de 30 s (compatibles con Google Authenticator y Authy),
  ventana ±1 periodo. Se guarda el último periodo aceptado para rechazar la reutilización de un código. El secreto se
  cifra con AES-256-GCM (`node:crypto`) usando `TOTP_CLAVE_CIFRADO` (32 bytes en base64). El QR se genera en el
  servidor con `qrcode` como data URL. Los 10 códigos de recuperación (10 caracteres base32) se guardan con SHA-256.
- **Activación**: genera un secreto pendiente; solo queda activo tras verificar un código. Los usuarios con rol
  operador o administrador sin 2FA reciben un acceso con `alc: activar-2fa`, que el guard limita a las rutas marcadas
  con `@PermiteSinSegundoFactor()` (activar 2FA, `yo`, cerrar sesión).
- **Inicio de sesión con 2FA**: tras la contraseña, la API responde `REQUIERE_2FA` y deja una cookie `desafio`
  (5 minutos, `Path=/api/identidad/sesion`, con el id del usuario firmado en un JWT de propósito `desafio-2fa`);
  `POST /sesion/2fa` la consume.
- **Alternativas**: `otplib` (válido; `otpauth` no tiene dependencias); WebAuthn (más seguro, pero fuera del
  alcance y no lo pide el proyecto).

## 6. CAPTCHA: Cloudflare Turnstile

- **Decisión**: widget en la web (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`) y verificación en la API con `siteverify`
  (`TURNSTILE_SECRET`), validando también `hostname` en producción. Se exige en registro, inicio de sesión y
  recuperación de contraseña. Claves de prueba de Cloudflare en desarrollo y CI: secreto
  `1x0000000000000000000000000000000AA` (siempre aprueba) y `2x0000000000000000000000000000000AA` (siempre rechaza),
  clave de sitio `1x00000000000000000000AA`.
- **Alternativas**: reCAPTCHA (más fricción y rastreo); hCaptcha (equivalente, pero Turnstile no pide resolver
  imágenes).

## 7. Correo: puerto con dos adaptadores

- **Decisión**: `CorreoPort` con un adaptador SMTP (`nodemailer`) para desarrollo y CI contra **Mailpit**
  (`docker-compose.yml`, SMTP en 1025 e interfaz en 8025), y un adaptador HTTP para staging (Resend, plan gratuito),
  elegido con `CORREO_TRANSPORTE`. Las pruebas leen los correos con la API de Mailpit (`/api/v1/messages`). Los
  enlaces apuntan a `WEB_ORIGIN`.
- **Razón**: el plan gratuito de Render bloquea el tráfico SMTP saliente (verificar al desplegar); una API HTTP no
  depende de esos puertos.
- **Alternativas**: solo SMTP (puede no funcionar en Render); registrar los enlaces en el log (inseguro).

## 8. Libro contable: doble entrada con disparadores

- **Decisión**:
  - `cuenta_contable` (una por usuario y tipo `USUARIO_REAL` / `USUARIO_BONO`, más `CASA`, `PASARELA` y
    `RETIROS_TRANSITO` del sistema, creadas por la migración).
  - `asiento` (cabecera con tipo, origen y `clave_idempotencia` única).
  - `linea_asiento` con monto con signo, en `Decimal(14,2)`, distinto de cero.
  - El saldo de una cuenta es `SUM(monto)` de sus líneas. Las cuentas de usuario suben con líneas positivas: un
    depósito de 50 es `PASARELA −50 / USUARIO_REAL +50`.
- **Inmutabilidad**: disparadores `BEFORE UPDATE OR DELETE` y `BEFORE TRUNCATE` en `asiento`, `linea_asiento` y
  `evento_auditoria` que lanzan una excepción. Un disparador de restricción `DEFERRABLE INITIALLY DEFERRED` verifica
  al confirmar la transacción que las líneas de cada asiento suman cero.
- **Serialización**: tabla `billetera` (una fila por usuario, creada en el registro). Toda operación que mueve dinero
  de un usuario hace `SELECT … FROM billetera WHERE usuario_id = $1 FOR UPDATE` dentro del `tx` de quien llama,
  luego revisa la idempotencia, después el saldo y por último inserta. Con `READ COMMITTED`, tras obtener el bloqueo
  la consulta ve lo confirmado por la transacción anterior.
- **Idempotencia**: antes de insertar se busca el asiento por `clave_idempotencia`. Si existe con el mismo usuario,
  tipo y monto, devuelve `{ asientoId, creado: false }`; si existe con otros datos, lanza
  `ConflictoIdempotenciaError` (un error del llamador). El índice único es la última defensa.
- **Saldo negativo**: solo `revertirPremio` omite la comprobación de saldo (aclaración del 2026-11-15).
- **Saldo resultante en movimientos**: se calcula al consultar con `SUM(monto) OVER (PARTITION BY cuenta ORDER BY
  creado_en, id)`; no se guarda.
- **Alternativas**: columna de saldo actualizada (viola el principio II); `SERIALIZABLE` con reintentos (más abortos
  y complejidad); bloqueos consultivos (`pg_advisory_xact_lock`) en lugar de la fila (no hay una fila visible que
  documente el bloqueo; el Spec 3 los usa para sus propios límites, lo que es compatible).

## 9. Pagos: Payphone, botón de pago por redirección

Fuente: [documentación de Payphone](https://docs.payphone.app/boton-de-pago-por-redireccion).

- **Prepare**: `POST {PAYPHONE_BASE_URL}/api/button/Prepare` con `Authorization: Bearer PAYPHONE_TOKEN`. Montos
  **enteros en centavos** (`amount` = `amountWithoutTax`), `currency: USD`, `clientTransactionId` = id de la
  intención (UUID), `storeId`, `reference`, `responseUrl` = `WEB_ORIGIN/billetera/deposito/retorno` y
  `cancellationUrl`. La respuesta trae `paymentId` y `payWithCard` (URL a la que se redirige al usuario). El
  formulario caduca a los 10 minutos.
- **Regreso**: Payphone redirige a `responseUrl?id=<int>&clientTransactionId=<uuid>`. La página de retorno solo
  envía esos dos valores a `POST /api/pagos/depositos/confirmar` y muestra "Procesando".
- **Confirm**: `POST {PAYPHONE_BASE_URL}/api/button/V2/Confirm` con `{ id, clientTxId }`. Se acredita solo si
  `statusCode === 3` y `transactionStatus === 'Approved'`, `amount` igual a la intención en centavos, `currency`
  `USD` y `clientTransactionId` igual a la intención. La llamada HTTP va **antes** de la transacción de base de datos,
  para no retener el bloqueo durante la red. Luego, en la transacción: bloqueo de la intención con `FOR UPDATE`,
  idempotencia (si ya está confirmada, devuelve lo mismo), unicidad del `transactionId` de Payphone, asiento
  `deposito:<id>:acreditacion`, método de pago, auditoría y, tras el commit, el evento `deposito.confirmado`.
- **Plazo**: si no se confirma en 5 minutos, Payphone revierte el pago solo. Las intenciones pendientes caducan a
  los 15 minutos con una tarea de `@nestjs/schedule` cada minuto.
- **Discrepancia**: se marca `RECHAZADA_DISCREPANCIA`, se audita `deposito.discrepancia` y se pide
  `POST /api/Reverse` con el id de Payphone (solo funciona el mismo día).
- **Sin consulta por referencia**: la documentación no ofrece consultar una venta por `clientTransactionId`; por eso
  la confirmación depende del regreso del usuario, y el reverso automático evita cobros sin acreditación.
- **Pruebas**: el entorno de pruebas de Payphone aprueba todo sin cobrar. En Vitest, un doble de `PASARELA_PORT`;
  en Playwright, una pasarela falsa (servidor HTTP del `globalSetup`) apuntada por `PAYPHONE_BASE_URL`, que imita
  Prepare, la página de pago, la redirección y Confirm. El código de producción no tiene modo simulado.
- **Riesgo**: Payphone exige registrar el dominio de `responseUrl` en Payphone Developer; hay que comprobar si admite
  `localhost` (si no, las pruebas manuales en el sandbox se hacen en staging).

## 10. Método y titular para retiros

- **Decisión**: al confirmar un depósito se guarda un `metodo_pago` del usuario con los datos que devuelve Confirm:
  tipo (tarjeta o app Payphone), `cardBrand`, `lastDigits`, `optionalParameter4` (nombre del titular en tarjetas),
  `document` y `phoneNumber`. Una huella SHA-256 de (tipo, marca, últimos dígitos, documento, teléfono) evita
  duplicados. El retiro solo acepta un `metodoPagoId` del propio usuario, así que no existe destino libre.
- **Alternativas**: pedir los datos del destino en el retiro y compararlos (más superficie de error y de fraude).

## 11. Retiros

- **Decisión**: `POST /api/retiros` con `{ monto, metodoPagoId, codigo2fa, claveSolicitud }`. Antes de la
  transacción: rol, verificación de correo, código 2FA y `RIESGO_PORT?.evaluarRetiro()` (inyectado con
  `@Optional()`). Dentro: bloqueo de la billetera, idempotencia por `(usuario_id, clave_solicitud)`, saldo real ≥
  monto y ≥ 0, asiento de reserva `retiro:<id>:reserva` (`USUARIO_REAL → RETIROS_TRANSITO`). Si monto ≤ umbral y el
  riesgo no pide revisión, en la misma transacción se paga: asiento `retiro:<id>:pago`
  (`RETIROS_TRANSITO → PASARELA`), estado `PAGADO` y referencia `SIM-<uuid>`. Si no, queda `PENDIENTE_REVISION`.
- **Revisión**: aprobar o rechazar bloquea el retiro con `FOR UPDATE`; si ya no está pendiente, no hace nada y
  devuelve el estado actual. Rechazar crea `retiro:<id>:devolucion` (`RETIROS_TRANSITO → USUARIO_REAL`). El
  administrador no puede resolver sus propios retiros y debe enviar su código 2FA.
- **Sin Spec 4**: sin `RIESGO_PORT`, todo retiro sobre el umbral se revisa y bajo el umbral se paga.

## 12. Guard global, roles y prueba de cobertura de rutas

- **Decisión**: `AutenticacionGuard` como `APP_GUARD` registrado **después** del throttler. Orden: `@Publico()` →
  sin verificar; extrae el token de la cookie `acceso` o de `Authorization: Bearer`; verifica firma, `iss`, `aud` y
  `exp`; comprueba la revocación en Redis; si `alc` es `activar-2fa`, solo pasan las rutas
  `@PermiteSinSegundoFactor()`; aplica `@Roles()`; deja `request.user` (`UsuarioAutenticado`). Los rechazos 403 se
  auditan como `acceso.denegado`.
- **Prueba de cobertura**: una prueba e2e recorre todas las rutas registradas en la app (`DiscoveryService` y
  metadatos de Nest) y comprueba que sin sesión responden 401, salvo una lista blanca explícita de rutas públicas.
  Así una ruta nueva de cualquier spec que olvide `@Roles` o que se marque pública por error rompe CI.
- **Ayuda para los otros specs**: `apps/api/test/ayudas/sesion-de-prueba.ts` emite tokens reales con una clave de
  prueba para cualquier rol, de modo que las pruebas e2e de los specs 3 y 4 pasan por el guard real.

## 13. Auditoría

- **Decisión**: `AuditoriaService` implementa `AUDITORIA_PORT` con un `INSERT` (con el `tx` si se pasa, o con el
  cliente global). Antes de guardar, `datos` pasa por un sanitizador que quita de forma recursiva las claves que
  parecen secretos (`contrasena`, `token`, `secreto`, `codigo`, `tarjeta`, `cvv`, `authorization`…). La IP y el
  dispositivo salen del resolutor de cliente del §1. Disparadores de inmutabilidad (§8).
- **Consulta**: `GET /api/admin/auditoria` con filtros y paginación por cursor (`creado_en`, `id`).

## 14. Credenciales fuera del alcance de reportes

- **Decisión**: las tablas `credencial`, `segundo_factor`, `codigo_recuperacion`, `sesion` y `enlace_correo`
  guardan solo lo sensible y viven separadas de `usuario`. Su migración hace `REVOKE ALL … FROM reportes_lectura` si
  el rol existe (bloque `DO`), porque los privilegios por defecto del Spec 1 le dan `SELECT` a toda tabla nueva. Se
  propone a Erick agregar el mismo `REVOKE` al final de `infra/postgres/usuario-solo-lectura.sql` (protegido con
  `to_regclass`), para que volver a ejecutar el script no devuelva el permiso. Una prueba de integración se conecta
  con `REPORTS_DATABASE_URL` y comprueba que leer esas tablas falla y que `usuario` sí se puede leer.
- **Alternativas**: un esquema de PostgreSQL aparte con `multiSchema` de Prisma (obliga a declarar `@@schema` en
  todos los modelos de los tres specs); SQL crudo para esas tablas (pierde los tipos de Prisma).

## 15. Eventos de dominio

- **Decisión**: `@nestjs/event-emitter` (la misma dependencia que agrega el Spec 3; quien integre después resuelve
  el lockfile). Se emiten `usuario.registrado`, `deposito.confirmado` y `retiro.solicitado` con los payloads de
  `eventos.ts`, siempre después de que la transacción se confirma.

## 16. Interfaz web

- **Decisión**: App Router. Componentes de servidor para billetera, movimientos y paneles de administración (piden
  los datos con el helper del §1), y componentes de cliente para los formularios (validación con zod solo para
  ayudar al usuario; la API vuelve a validar todo). Turnstile se carga con un componente propio, sin dependencias.
  La CSP con nonce que anticipa `next.config.ts` se agrega en `apps/web/src/proxy.ts` (convención de Next.js 16),
  permitiendo `challenges.cloudflare.com`. Diseño con el skill `frontend-design`, siguiendo la tipografía y la
  paleta del Spec 1.
- **Montos en la web**: se muestran tal como los manda la API (texto decimal); la web no suma ni resta saldos.

## 17. Primer administrador y datos de prueba

- **Decisión**: script `apps/api/scripts/crear-administrador.ts` (con `tsx`) que pide correo y contraseña por la
  terminal y crea un usuario verificado con rol `ADMINISTRADOR`. Al entrar por primera vez, el guard le exige
  activar el 2FA. Nunca se expone por HTTP.
