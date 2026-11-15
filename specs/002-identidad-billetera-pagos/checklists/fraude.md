# Vectores de fraude y abuso: dónde se prueban

Cada fila de la tabla "Vectores de fraude y abuso" de [spec.md](../spec.md) y del brief §5, con la prueba que la
cubre (en `apps/api/test/` salvo que se indique otra cosa). Todas corren en CI contra PostgreSQL, Redis y Mailpit
reales.

| Vector | Prueba |
|--------|--------|
| Doble gasto por concurrencia | `billetera.e2e-spec.ts`: 20 débitos simultáneos sobre 100.00 aceptan exactamente 10; `retiros.e2e-spec.ts`: dos retiros simultáneos que superan el saldo aceptan uno |
| Doble acreditación de un depósito | `depositos.e2e-spec.ts`: la misma confirmación 10 veces (5 a la vez) acredita una; una transacción ya usada en otro depósito no se acredita |
| Depósito manipulado | `depositos.e2e-spec.ts`: monto, moneda o referencia distintos se rechazan, se auditan y piden reverso |
| Acreditar por el regreso del navegador | `depositos.e2e-spec.ts`: sin la confirmación del servidor el saldo no cambia y la intención caduca |
| Retiro sin 2FA o a otro titular | `retiros.e2e-spec.ts`: sin 2FA activo, con código incorrecto y a un método de otro usuario se rechaza |
| Retiro de bono o de saldo negativo | `retiros.e2e-spec.ts`: sobre el saldo real y con saldo negativo por reversión se rechaza |
| Fuerza bruta y relleno de credenciales | `sesion.e2e-spec.ts`: 5 fallos bloquean 15 minutos; `segundo-factor.e2e-spec.ts`: 5 códigos incorrectos bloquean |
| Enumeración de cuentas | `registro.e2e-spec.ts` y `sesion.e2e-spec.ts`: misma respuesta exista o no el correo (registro, inicio, recuperación) |
| Robo de sesión | `sesion.e2e-spec.ts`: reutilizar una renovación vieja cierra todas las sesiones; `apps/web/e2e/identidad.spec.ts`: la sesión no es legible por scripts |
| Secuestro por recuperación de contraseña | `sesion.e2e-spec.ts`: enlace de un solo uso, cierra las sesiones abiertas |
| Escalada de rol | `cobertura-rutas.e2e-spec.ts`: toda ruta exige sesión salvo la lista blanca; `guard.e2e-spec.ts`, `usuarios-admin.e2e-spec.ts`, `retiros.e2e-spec.ts`: 403 por rol |
| Autoaprobación de retiros | `retiros` en la base: CHECK `retiro_sin_autoaprobacion` y comprobación en `RetirosService`; un administrador no puede tener retiros propios (FR-068) |
| Personal con privilegios que mueve dinero | `depositos.e2e-spec.ts` y `retiros.e2e-spec.ts`: operador no deposita ni retira; `UsuariosAdminService`: no se promueve con saldo o retiros pendientes |
| Edición del libro contable o de la auditoría | `billetera.e2e-spec.ts` y `esquema-auditoria.e2e-spec.ts`: UPDATE, DELETE y TRUNCATE fallan; un asiento descuadrado no entra |
| Fuga de credenciales por reportes | `reportes-credenciales.e2e-spec.ts`: `reportes_lectura` no lee las tablas de credenciales |
| Cuentas falsas y menores | `registro.e2e-spec.ts`: menor de edad, sin declaración y sin CAPTCHA se rechazan; `depositos.e2e-spec.ts`: sin verificar no deposita; `billetera.e2e-spec.ts`: sin verificar no recibe bonos |
