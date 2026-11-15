# Research: Partidos, apuestas y liquidación

Decisiones técnicas del Spec 3. Cada una: decisión, razón y alternativas descartadas. Los datos de API-Football
marcados con **(verificar)** se confirman contra la API real en la primera tarea del worker, porque el plan
gratuito y su documentación cambian con el tiempo.

## 1. Colas y worker: BullMQ dentro de `apps/api`

- **Decisión**: `@nestjs/bullmq` 12 + `bullmq` 6 en el mismo proceso de la API. Tres colas:
  - `sincronizacion`: trabajos repetibles de importación (partidos del día, partidos en vivo, cuotas) y el
    vencimiento de plazos de suspensión (trabajos con retardo).
  - `apuestas-vivo`: un trabajo con retardo por cada apuesta en vivo (§6).
  - `liquidacion`: un trabajo por partido y versión de resultado (§7).
- Las conexiones se abren con `REDIS_URL` y `maxRetriesPerRequest: null`, sin reutilizar el cliente `REDIS`
  (contratos.md §5 y `redis.constants.ts`).
- La cola `sincronizacion` corre con concurrencia 1: es el "único worker" que exige la constitución (V).
- **Razón**: la constitución exige una cola persistente para los eventos de resultado; BullMQ ya está en `PLAN.md`,
  persiste en Redis y ofrece trabajos repetibles, con retardo, reintentos con espera exponencial y deduplicación por
  `jobId`. Con eso no hace falta `@nestjs/schedule`.
- **Alternativas**: `@nestjs/schedule` (cron en memoria: se pierde un vencimiento si el proceso está caído); un
  servicio aparte para el worker (viola el principio VI: solo tres aplicaciones).

## 2. Presupuesto diario de API-Football

- **Decisión**: contador atómico en Redis por día UTC (`api-football:consumo:AAAA-MM-DD`), con un script Lua que
  incrementa solo si no se supera `API_FOOTBALL_PRESUPUESTO_DIARIO`. Toda consulta pasa por
  `PresupuestoProveedor.reservar()`; si no hay cupo, la consulta no se hace. Al recibir la respuesta se toma el
  menor entre el contador propio y la cabecera `x-ratelimit-requests-remaining` **(verificar)**. Una copia diaria se
  guarda en la tabla `consumo_proveedor` para el panel del operador.
- **Frecuencia adaptativa**:
  - Partidos del día: `GET /fixtures?date=` (una consulta trae todas las ligas; se filtran las de
    `API_FOOTBALL_LIGAS`) a las 06:00 UTC y cada 6 h.
  - Cuotas pre-partido: `GET /odds?league=&season=&date=` por liga configurada, dos veces al día **(verificar
    paginación)**.
  - En vivo: `GET /fixtures?live=<ids>` (una consulta para todos los partidos en vivo) solo mientras haya partidos
    en vivo. Intervalo = máx(15 s, minutos de partido restantes / consultas disponibles para vivo).
  - Se reserva el 10 % del presupuesto para consultar el resultado final de los partidos que terminan.
- **Razón**: el plan gratuito tiene un límite diario bajo (100 consultas/día **(verificar)**); un contador atómico
  garantiza SC-005 incluso con reintentos o con varios procesos.
- **Alternativas**: contar en PostgreSQL (más lento y con más carga en cada consulta); confiar solo en la cabecera
  del proveedor (llega después de gastar la consulta).

## 3. Latencia "≤ 5 s desde que API-Football publica"

- **Hallazgo**: API-Football no avisa los cambios (no hay webhooks); solo se puede consultar periódicamente.
  Con 100 consultas al día no se puede consultar cada 5 s (un partido de 90 min necesitaría más de 1 000).
- **Decisión**: se garantiza ≤ 5 s **desde que el sistema detecta el resultado** hasta que el apostador lo ve
  (SC-001). La demora de detección depende del plan contratado y se mide aparte. En modo simulación, detección y
  publicación son el mismo instante y la latencia total es ≤ 5 s.
- **Impacto en la constitución**: el principio V dice "desde que API-Football lo publica". Se registra en
  Complexity Tracking del plan y se propone al líder una enmienda PATCH que aclare la medición. No es un principio
  sin excepciones (solo I y II lo son).

## 4. Aceptación atómica de la apuesta

- **Decisión**: transacción interactiva de Prisma (`$transaction(async (tx) => …)`, `ReadCommitted`) en este
  orden:
  1. `pg_advisory_xact_lock(hashtext(usuarioId))`: serializa las apuestas del mismo usuario para que el límite
     diario y la verificación de saldo negativo no tengan carreras entre solicitudes simultáneas.
  2. Idempotencia de la solicitud: si ya existe `(usuario_id, clave_solicitud)`, devuelve esa apuesta sin repetir
     efectos (FR-020).
  3. Leer las selecciones con `SELECT … FOR SHARE` (el cambio de cuota del operador toma `FOR UPDATE`): la cuota
     comparada es la que se congela.
  4. Validar estado del partido y del mercado, hora con `now()` de PostgreSQL (reloj del servidor), cuota vista =
     cuota vigente, límites y saldos no negativos (`BilleteraPort.obtenerSaldos(usuarioId, tx)`).
  5. Cupón opcional: `PromocionesApuestaPort.aplicarAApuesta(tx, …)` (contrato 4).
  6. Insertar `apuesta` y `seleccion_apostada`.
  7. `BilleteraPort.debitarApuesta(tx, …)` con `apuesta:<id>:debito`; la billetera bloquea su fila con
     `FOR UPDATE` y lanza `SaldoInsuficienteError`.
  8. `AuditoriaPort.registrar({ accion: 'apuesta.aceptada', … }, tx)`.
  9. Tras el commit: emitir `apuesta.aceptada` (contrato 5).
- **Cálculo**: cuota decimal con 2 decimales. Cuota total = producto de las cuotas redondeado a 2 decimales
  (`ROUND_HALF_UP`); premio = monto × cuota total redondeado a 2 decimales. Todo con `Prisma.Decimal`, nunca
  `number`.
- **Usuarios con rol OPERADOR o ADMINISTRADOR**: no pueden apostar (FR-039).
- **Alternativas**: `Serializable` con reintentos (más complejo y con más abortos bajo carga); un bloqueo
  optimista por versión de cuota (necesitaría reintentos en el cliente).

## 5. Límite diario por usuario

- **Decisión**: suma de `monto` de las apuestas aceptadas del usuario en el día calendario de
  `America/Guayaquil`, calculada dentro de la transacción después del bloqueo del §4. Un índice
  `(usuario_id, aceptada_en)` mantiene la consulta acotada.
- **Razón**: el usuario entiende "por día" en su hora local; el bloqueo por usuario evita que dos solicitudes
  simultáneas pasen el límite.

## 6. Apuestas en vivo con retardo

- **Decisión**: `POST /api/apuestas` sobre un mercado en vivo guarda una `solicitud_apuesta_vivo` "en espera"
  (sin descontar saldo) con la versión del partido y las cuotas vistas, y encola un trabajo en `apuestas-vivo` con
  retardo `APUESTA_RETARDO_VIVO_MS` y `jobId = vivo:<solicitudId>`. Al ejecutarse, corre la aceptación atómica del
  §4 y además exige que la versión del partido no haya cambiado (cada gol, cambio de estado o de cuota incrementa
  `partido.version`). Responde `202` con el id de la solicitud; el resultado llega por WebSocket.
- **Razón**: mitiga la ventaja por latencia (FR-018) y el trabajo con retardo sobrevive a un reinicio.
- **Alternativas**: dormir la petición HTTP N segundos (se pierde si se cae el proceso y ocupa conexiones).

## 7. Liquidación idempotente

- **Decisión**: al pasar un partido a "finalizado" (desde el proveedor, la simulación o el operador) se incrementa
  `partido.version_resultado` y se encola `liquidar-partido` con `jobId = liquidar:<partidoId>:v<version>`
  (BullMQ descarta duplicados). El trabajo:
  1. Resuelve cada selección de los mercados del partido con funciones puras por tipo de mercado (§10).
  2. Por cada apuesta afectada, en su propia transacción: `SELECT … FOR UPDATE` de la apuesta, recalcula su estado
     (simple o combinada, con cuota 1.00 en anuladas) y, si cambió, mueve dinero con la clave de idempotencia de la
     billetera y registra una fila en `liquidacion` (clave única).
  3. Tras cada commit: emite `apuesta.liquidada` y notifica por WebSocket.
- **Claves de idempotencia** (extienden la convención de contratos.md §2): liquidación original
  `apuesta:<id>:premio` y `apuesta:<id>:reembolso`; correcciones `apuesta:<id>:premio:r<n>` y
  `apuesta:<id>:reversion:r<n>`, con `n` = número de corrección del partido. Así una apuesta que va de ganada a
  perdida y de vuelta a ganada paga y revierte una sola vez por corrección.
- **Defensa en profundidad**: estado de la apuesta + fila única en `liquidacion` + clave de la billetera. Cualquiera
  de las tres basta para no pagar dos veces.
- **Alternativas**: liquidar todo el partido en una sola transacción (bloquea muchas filas y un error revierte
  todo); liquidar sin cola (se pierde si el proceso cae a mitad).

## 8. Suspensiones, aplazamientos y vencimiento del plazo

- **Decisión**: al suspender o aplazar, se encola en `sincronizacion` un trabajo con retardo hasta el vencimiento
  (`SUSPENSION_PLAZO_HORAS` desde la suspensión, o desde la hora de inicio original en un aplazamiento) con
  `jobId = vencer:<partidoId>:<n>`. Al ejecutarse verifica que el partido siga suspendido o aplazado y anula:
  las selecciones de mercados ya decididos con el marcador de la suspensión se liquidan (FR-031) y el resto se anula
  (cuota 1.00 en combinadas, reembolso en simples) por el mismo camino del §7.
- **Cancelación**: anula de inmediato por el mismo camino.

## 9. Tiempo real: Socket.IO con ticket de conexión

- **Decisión**: `@nestjs/websockets` + `@nestjs/platform-socket.io` 12.5, gateway con CORS limitado a
  `WEB_ORIGIN`. El navegador pide `POST /api/tiempo-real/ticket` (ruta autenticada normal) y recibe un ticket
  aleatorio de un solo uso guardado en Redis 60 s con el `usuarioId`; se conecta con `auth: { ticket }`. Salas:
  `partido:<id>` (marcador y estado; se une cualquier usuario autenticado) y `usuario:<id>` (resultado de sus
  apuestas; solo su dueño). Emisión directa desde el proceso de la API (hay una sola instancia).
- **Razón**: la web (Vercel) y la API (Render) están en sitios distintos; una cookie `SameSite=Lax` no viaja en el
  handshake de WebSocket entre sitios. El ticket desacopla el WebSocket de cómo resuelva el Spec 2 la sesión del
  navegador.
- **Aviso para el Spec 2**: el mismo problema afecta a cualquier `fetch` del navegador a la API con cookie `Lax`
  entre `*.vercel.app` y `*.onrender.com` (son sufijos públicos distintos). Conviene que el Spec 2 decida pronto si la
  web llama a la API a través de su propio servidor (Next.js) o con un dominio común.
- **Alternativas**: SSE (unidireccional y sin salas; habría que reimplementarlas); adaptador Redis de Socket.IO
  (solo hace falta con varias instancias: YAGNI).

## 10. Mercados y mapeo de API-Football

- **Tipos y reglas** (marcador del tiempo reglamentario, FR-004):

  | Tipo | Selecciones | Gana |
  |------|-------------|------|
  | `RESULTADO_FINAL` | `LOCAL`, `EMPATE`, `VISITANTE` | según goles local vs visitante |
  | `DOBLE_OPORTUNIDAD` | `LOCAL_EMPATE`, `EMPATE_VISITANTE`, `LOCAL_VISITANTE` | si el resultado está en el par |
  | `MAS_MENOS_GOLES` (línea 0.5, 1.5, …) | `MAS`, `MENOS` | total de goles vs línea |
  | `AMBOS_MARCAN` | `SI`, `NO` | ambos equipos con al menos un gol |

- **Decididos antes del final** (para FR-031): `MAS` gana en cuanto el total supera la línea; `AMBOS_MARCAN: SI`
  gana en cuanto los dos marcaron. El resto se decide solo al final.
- **Estados del proveedor → estado del partido** **(verificar códigos)**: `TBD`, `NS` → programado; `1H`, `HT`,
  `2H`, `ET`, `BT`, `P`, `LIVE` → en vivo; `SUSP`, `INT`, `ABD` → suspendido; `PST` → aplazado; `FT`, `AET`, `PEN` →
  finalizado; `CANC`, `AWD`, `WO` → cancelado.
- **Marcador reglamentario**: `score.fulltime` (90 min con añadido), no `goals` (incluye prórroga) **(verificar)**.
- **Mercados del proveedor**: se mapean por nombre ("Match Winner", "Double Chance", "Goals Over/Under", "Both
  Teams Score"), no por id numérico, y se validan contra `GET /odds/bets` **(verificar)**. Los demás se ignoran.
- **Puerto**: `PROVEEDOR_DEPORTIVO` con dos adaptadores: `ApiFootballProveedor` y `SimuladorProveedor`
  (`API_FOOTBALL_SIMULACION=true`). Ambos producen `ActualizacionPartido`, que entra por el mismo
  `aplicarActualizacion()`.

## 11. Inmutabilidad en la base de datos

- **Decisión**: además de no exponer rutas de edición, la migración crea disparadores de PostgreSQL que impiden
  `DELETE` en `apuesta`, `seleccion_apostada`, `liquidacion` e `historial_cuota`, y que impiden `UPDATE` de las
  columnas congeladas (`monto`, `cuota_total`, `tipo_saldo`, `usuario_id`, `cuota_congelada`).
- **Razón**: defensa en profundidad del principio II; un error de código no puede alterar una apuesta aceptada.
- **Alternativas**: solo convención en el código (no protege de un error o de una consulta manual).

## 12. Dobles de prueba de los contratos del Spec 2

- **Billetera**: `BilleteraSqlDePrueba` (solo en `test/`) que escribe con `tx.$executeRaw` en un esquema aparte
  `pruebas` (creado por el setup de las pruebas, fuera de las migraciones) y bloquea su fila con `FOR UPDATE`. Como
  participa en la transacción real, las pruebas de atomicidad y concurrencia (SC-002, SC-004) valen desde ya. Usa
  otro esquema para que `prisma migrate dev` no detecte deriva en `public`.
- **Auditoría**: `AuditoriaEnMemoria`, que captura eventos para las aserciones.
- **Guard**: un guard de prueba que fija `request.user` desde una cabecera, solo en las pruebas e2e (contratos.md
  §1).
- **Al integrar el Spec 2**: las mismas pruebas se corren con la billetera y la auditoría reales.

## 13. Interfaz web

- **Decisión**: App Router con componentes de servidor para cartelera y detalle, y componentes de cliente para el
  boleto, "Mis apuestas" en vivo y el panel del operador; `socket.io-client` 4.8 para el tiempo real. Sin librería
  de estado global: el boleto vive en un contexto de React y en `sessionStorage`. Diseño con el skill
  `frontend-design`, continuando la tipografía Barlow y la paleta del Spec 1.
- **Tipos compartidos**: enums y payloads de eventos de tiempo real en `packages/shared/src/partidos.ts`.

## 14. Datos de demostración

- **Decisión**: un script `pnpm --filter api seed:partidos` que crea competiciones, partidos y mercados con cuotas
  en modo simulación, para la demo (SC-008) y para el E2E de Playwright.
