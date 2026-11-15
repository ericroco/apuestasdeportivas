# Research: Promociones, antifraude y reportes

Decisiones técnicas del Spec 4. Formato: decisión, motivo y alternativas descartadas.

## 1. Concurrencia del cupo y del límite por usuario

- **Decisión**: dentro del `tx` de quien canjea, `SELECT … FROM cupon WHERE id = $1 FOR UPDATE` (con
  `tx.$queryRaw`), luego contar los canjes aceptados del usuario, insertar el canje e incrementar `cupon.canjes`.
  Restricción `CHECK (canjes <= cupo_total)` como red de seguridad.
- **Motivo**: serializa los canjes de un mismo cupón sin bloquear los demás; el conteo por usuario queda protegido
  por el mismo bloqueo. Cumple SC-002 (50 simultáneos, cupo 10) de forma determinista.
- **Alternativas**: `UPDATE … SET canjes = canjes + 1 WHERE canjes < cupo_total` sin bloqueo (protege el cupo pero no
  el límite por usuario); contador en Redis (otra fuente de verdad que puede desincronizarse con la BD).

## 2. Apuesta gratis con el contrato actual

- **Decisión**: `aplicarAApuesta` acredita como bono el monto apostado (`acreditarBono`, clave
  `cupon:<cuponId>:<usuarioId>:<n>:bono`) dentro del `tx` y devuelve `tipoSaldo: 'BONO'`; el Spec 3 debita ese bono.
  El premio, si gana, vuelve al saldo de bono (contrato 2: "al mismo tipo de saldo con que se apostó") y queda sujeto
  al rollover.
- **Motivo**: no cambia ninguna firma; el ledger muestra el origen del dinero de la apuesta gratis.
- **Alternativas**: acreditar el bono al canjear en una pantalla aparte (exige otra operación y deja bonos sin usar);
  marcar la apuesta como "gratis" sin asiento (rompe el principio II).

## 3. Un bono activo a la vez y conversión

- **Decisión**: como máximo un `bono` en estado `ACTIVO` por usuario (índice único parcial). Al cumplir el rollover se
  convierte todo el saldo de bono que devuelva `obtenerSaldos(usuarioId, tx).bono`. El vencimiento se evalúa de forma
  perezosa al consultar o canjear (sin cron).
- **Motivo**: la billetera tiene un solo saldo de bono por usuario; con varios bonos no se puede atribuir el saldo a
  cada uno. Evita apilar bonos (vector de la spec).
- **Alternativas**: varios bonos con FIFO (atribución ambigua); tarea programada para vencer bonos (proceso extra sin
  necesidad).

## 4. Cuota mínima del rollover y fecha de aceptación

- **Decisión**: el listener de `apuesta.aceptada` guarda la apuesta en `actividad_usuario` con su monto, tipo de saldo
  y cuota total. El de `apuesta.liquidada` solo cuenta apuestas con actividad de aceptación registrada después del
  bono y cuota ≥ mínima. Se propone al Spec 3 agregar `cuotaTotal` al evento `ApuestaAceptada`
  (`contracts/cambios-contratos.md`); sin ese dato la apuesta no cuenta (falla segura).
- **Motivo**: sin cuota mínima, el rollover se cumple sin riesgo apostando a cuotas de 1.01.
- **Alternativas**: leer la tabla `apuesta` del Spec 3 desde la API (acopla módulos por la base, salta el contrato).

## 5. Anti-abuso por dispositivo y método de pago

- **Decisión**: los dispositivos de un usuario salen de sus eventos `usuario.registrado`; el método de pago, de un
  campo nuevo propuesto al Spec 2 en `deposito.confirmado` (`metodoPagoHuella`: hash del identificador del medio que
  devuelve Payphone). Un canje se rechaza si otro usuario que comparte dispositivo (o método de pago, en bonos de
  depósito) ya canjeó el mismo cupón.
- **Motivo**: es el control que pide el requisito 3.7 ("un cupón por usuario/dispositivo/método de pago") sin
  agregar campos a `PromocionesApuestaPort`.
- **Alternativas**: pedir el dispositivo en cada apuesta (cambia la firma del puerto y confía en un dato del cliente
  en el momento de mayor incentivo para falsearlo).

## 6. Escucha de eventos

- **Decisión**: `@nestjs/event-emitter` con `@OnEvent(EVENTOS.x, { async: true, promisify: true })`. Cada listener es
  idempotente con una restricción única `(tipo, referencia_id)` en `actividad_usuario` e `insert … on conflict do
  nothing`. Un error en un listener se registra con el `Logger` y no afecta al emisor.
- **Motivo**: el contrato 5 fija EventEmitter dentro de la API; la unicidad en BD hace la idempotencia verificable.
- **Alternativas**: cola BullMQ propia (más infraestructura sin necesidad: los eventos se emiten tras confirmar la
  transacción del emisor).

## 7. Falla cerrada sin el Spec 2

- **Decisión**: `BILLETERA_PORT` y `AUDITORIA_PORT` se inyectan con `@Optional()`. Si faltan, las operaciones que los
  necesitan lanzan `DependenciaNoDisponibleError` (HTTP 503) antes de cualquier escritura. `RiesgoPort` responde
  "requiere revisión" ante cualquier error. Un guard local (`RolesGuard`) deniega si no hay `request.user`.
- **Motivo**: el código de Spec 4 puede llegar a `develop` antes que el Spec 2 sin abrir rutas ni mover dinero.
- **Alternativas**: esperar al Spec 2 (bloquea el calendario del reparto); dobles en producción (inaceptable).

## 8. JWT en reportes

- **Decisión**: PyJWT con `cryptography`, algoritmo configurable `EdDSA` o `RS256` (`JWT_ALGORITHM`, el que elija el
  Spec 2), `JWT_PUBLIC_KEY` en PEM, verificación de `exp`, `iss`, `aud` y `roles` con `ADMINISTRADOR`. Token desde
  `Authorization: Bearer` o la cookie `acceso`. Una lista explícita de algoritmos evita `none` y la confusión
  HS/RS.
- **Motivo**: contrato 6; reportes verifica sin poder emitir.
- **Alternativas**: python-jose (mantenimiento irregular); llamar a la API para validar (acopla y suma latencia).

## 9. Métricas: SQL + pandas

- **Decisión**: el SQL filtra y agrega por día y competición (con `GROUP BY` y parámetros); pandas combina las series,
  rellena días sin datos con cero, calcula GGR y totales, y produce CSV. Montos como `Decimal` convertidos a texto con
  dos decimales al responder.
- **Motivo**: 100 000 apuestas agregadas en SQL devuelven a lo sumo unas cientos de filas; pandas no carga el detalle
  (SC-007). La constitución fija pandas para reportes.
- **Alternativas**: cargar todas las filas en pandas (memoria y latencia); todo en SQL (pierde el formato tabular
  para exportar).

## 10. PDF

- **Decisión**: fpdf2 (Python puro, sin dependencias del sistema) con tablas y una barra simple por día dibujada con
  rectángulos.
- **Motivo**: corre en el runtime Python de Render sin paquetes del sistema.
- **Alternativas**: WeasyPrint (necesita Pango/Cairo); ReportLab (más pesado para lo que se necesita).

## 11. Web: llamadas desde el servidor

- **Decisión**: Server Components y Server Actions leen la cookie `acceso` con `cookies()` y llaman a la API
  (reenviándola como `Cookie`) y a reportes (como `Authorization: Bearer`). Las descargas pasan por route handlers
  (`/admin/reportes/exportar`) que transmiten el archivo de reportes.
- **Motivo**: FR-033 (el token no llega al JavaScript del navegador) y evita el problema de cookies entre sitios
  `vercel.app` ↔ `onrender.com` que señaló el Spec 3.
- **Alternativas**: `fetch` desde el navegador con `credentials: 'include'` (cookie entre sitios bloqueada por
  `SameSite=Lax`).

## 12. Gráfica del dashboard

- **Decisión**: SVG generado en el servidor (barras por día), con tabla equivalente para lectores de pantalla.
- **Motivo**: sin librerías de gráficos en el bundle; accesible y sin JavaScript en el cliente.
- **Alternativas**: Recharts o Chart.js (peso en el cliente, accesibilidad a cargo del equipo).
