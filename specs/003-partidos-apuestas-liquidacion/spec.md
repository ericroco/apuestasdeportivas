# Feature Specification: Partidos, apuestas y liquidación

**Feature Branch**: `feature/spec-3`
**Created**: 2026-11-14
**Status**: Draft
**Responsable**: Daniel Campoverde
**Input**: User description: "Spec 3 del equipo: partidos, apuestas y liquidación. Partidos con máquina de estados (programado, en vivo, finalizado, suspendido, aplazado, cancelado), mercados y cuotas gestionados por el operador o importados de API-Football por un único worker con presupuesto diario y modo simulación. Apuestas simples y combinadas con aceptación atómica usando BilleteraPort, cuota congelada con reconfirmación, cierre al inicio del partido y límites. Liquidación automática e idempotente al finalizar el partido con notificación por WebSocket en 5 s o menos y re-liquidación auditada. Suspensiones y aplazamientos con plazo configurable, anulación, reembolso y cuota 1.00 en combinadas. Pantallas de cartelera, boleto, mis apuestas y panel del operador."

## Contexto

Este spec cubre las fases F3, F4 y F5 de [`PLAN.md`](../../PLAN.md) y agrupa las specs 005 a 009 del catálogo
original (ver [`specs/README.md`](../README.md)). Es el núcleo del negocio: los partidos sobre los que se apuesta,
la aceptación de apuestas y su liquidación. Consume la identidad, los roles, la billetera y la auditoría del Spec 2,
y opcionalmente los cupones del Spec 4, a través de los contratos de
[`docs/equipo/contratos.md`](../../docs/equipo/contratos.md). Provee los eventos "apuesta aceptada" y "apuesta
liquidada" y los datos de apuestas que lee el servicio de reportes.

Actores: **apostador** (usuario autenticado que apuesta), **operador** (gestiona partidos, mercados, cuotas y
suspensiones), **administrador** (todo lo del operador) y el **proceso de sincronización** con el proveedor de datos
deportivos (API-Football).

## Clarifications

### Session 2026-11-14

- Q: ¿Qué tipos de mercado se soportan con liquidación automática? → A: Resultado final (1X2), doble
  oportunidad, más/menos de N goles y ambos marcan, todos resueltos con el marcador del tiempo reglamentario.
- Q: ¿Qué pasa con un premio ya pagado si una corrección convierte la apuesta en perdida y el apostador no tiene
  saldo? → A: Se revierte con un asiento compensatorio aunque el saldo quede negativo; mientras sea negativo, el
  apostador no puede apostar ni retirar.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cartelera y gestión de partidos por el operador (Priority: P1)

El operador da de alta un partido (competición, equipo local, equipo visitante, fecha y hora de inicio), le agrega
mercados con sus selecciones y cuotas, y lo publica. Los visitantes y apostadores ven la cartelera de próximos
partidos y partidos en vivo, y abren el detalle de un partido para ver sus mercados y cuotas vigentes. El operador
puede cambiar cuotas, suspender o reabrir un mercado y mover el partido entre estados permitidos.

**Why this priority**: sin partidos ni mercados no hay sobre qué apostar; es la base de las demás historias y se
puede demostrar sin depender del proveedor externo.

**Independent Test**: como operador, crear un partido con un mercado y dos cuotas; como visitante, verlo en la
cartelera y en su detalle; cambiar una cuota y comprobar que el detalle muestra la nueva y que el cambio quedó
auditado.

**Acceptance Scenarios**:

1. **Given** un operador autenticado, **When** crea un partido con su competición, equipos y fecha de inicio,
   **Then** el partido queda en estado "programado" y aparece en la cartelera.
2. **Given** un partido programado, **When** el operador le agrega un mercado con selecciones y cuotas mayores a
   1.00, **Then** el mercado aparece en el detalle del partido con esas cuotas.
3. **Given** un mercado con cuotas, **When** el operador cambia una cuota, **Then** las apuestas nuevas usan la
   cuota nueva, las ya aceptadas conservan la suya y el cambio queda en el registro de auditoría con el valor
   anterior, el nuevo, quién y cuándo.
4. **Given** un apostador sin rol de operador, **When** intenta crear un partido o cambiar una cuota, **Then** el
   sistema lo rechaza por falta de permisos.
5. **Given** un partido finalizado, **When** el operador intenta devolverlo a "programado", **Then** el sistema
   rechaza la transición e indica cuáles están permitidas.
6. **Given** un partido con apuestas aceptadas, **When** el operador intenta eliminarlo, **Then** el sistema lo
   rechaza y ofrece cancelarlo.

---

### User Story 2 - Apuesta simple con aceptación segura (Priority: P1)

El apostador elige una selección en el detalle de un partido, la agrega a su boleto, indica el monto y ve la cuota y
la ganancia potencial. Al confirmar, el sistema valida en el servidor el saldo, la cuota vigente, el estado del
partido y los límites; si todo es correcto descuenta el monto y registra la apuesta en una sola operación
indivisible, con la cuota congelada. El apostador ve la apuesta en "Mis apuestas" como pendiente.

**Why this priority**: es el flujo que genera valor y el que concentra los vectores de fraude más graves (apostar
sin saldo, después del inicio o con una cuota alterada).

**Independent Test**: con un apostador con saldo, confirmar una apuesta simple y comprobar que el saldo bajó
exactamente el monto y que la apuesta aparece pendiente con la cuota congelada; repetir sin saldo, tras el inicio y
con una cuota distinta y comprobar los rechazos.

**Acceptance Scenarios**:

1. **Given** un apostador con saldo suficiente y un mercado abierto, **When** confirma una apuesta simple, **Then**
   el saldo se reduce en el monto apostado, la apuesta queda "pendiente" con la cuota vigente congelada y se
   muestra la ganancia potencial.
2. **Given** un apostador con saldo insuficiente, **When** confirma una apuesta, **Then** se rechaza con un mensaje
   que indica el saldo disponible, y no queda ni apuesta ni movimiento de dinero.
3. **Given** un partido cuya hora de inicio ya pasó según el reloj del servidor, **When** el apostador confirma una
   apuesta pre-partido (aunque su dispositivo indique otra hora), **Then** se rechaza porque el mercado está
   cerrado.
4. **Given** que la cuota cambió entre que el apostador la vio y confirmó, **When** confirma, **Then** no se acepta
   la apuesta y se le muestra la cuota nueva para que la reconfirme.
5. **Given** un monto fuera de los límites configurados o una ganancia potencial sobre el máximo, **When** confirma,
   **Then** se rechaza indicando el límite que aplica.
6. **Given** que el apostador pulsa "Confirmar apuesta" dos veces seguidas, **When** llegan ambas solicitudes,
   **Then** se registra una sola apuesta y se descuenta una sola vez.
7. **Given** una apuesta aceptada, **When** cualquier usuario (incluidos operador y administrador) intenta
   modificarla o borrarla, **Then** no existe forma de hacerlo; solo puede anularse por una regla de negocio y con
   auditoría.

---

### User Story 3 - Liquidación automática y resultado en tiempo real (Priority: P1)

Cuando un partido termina y se conoce su resultado final, el sistema liquida automáticamente todas las apuestas de
ese partido: acredita el premio a las ganadoras y marca las perdedoras. El apostador que tiene abierta la aplicación
ve el marcador en vivo y el resultado de su apuesta sin recargar la página, en 5 segundos o menos desde que el
proveedor publica el resultado.

**Why this priority**: sin liquidación el dinero queda retenido; es el criterio de cierre de F5 y un requisito no
funcional explícito (≤ 5 s).

**Independent Test**: con apuestas ganadoras y perdedoras sobre un partido simulado, marcarlo como finalizado y
comprobar los premios acreditados, el estado de cada apuesta, el aviso en pantalla sin recargar y que reprocesar el
mismo resultado no cambia ningún saldo.

**Acceptance Scenarios**:

1. **Given** apuestas pendientes sobre un partido, **When** el partido finaliza con su resultado, **Then** cada
   apuesta ganadora recibe monto × cuota congelada en el mismo tipo de saldo con que se apostó y cada perdedora
   queda "perdida" sin movimiento de dinero.
2. **Given** un apostador con "Mis apuestas" abierta, **When** se liquida su apuesta, **Then** ve el nuevo estado y
   el premio en 5 segundos o menos, sin recargar.
3. **Given** un resultado ya liquidado, **When** el mismo resultado llega o se procesa otra vez, **Then** ningún
   saldo cambia y no se generan pagos nuevos.
4. **Given** una caída temporal del servicio durante la liquidación, **When** el servicio se recupera, **Then** la
   liquidación se completa sin perder ni duplicar pagos.
5. **Given** un partido en vivo, **When** cambia el marcador, **Then** el detalle del partido lo muestra
   actualizado sin recargar.

---

### User Story 4 - Apuesta combinada (Priority: P2)

El apostador agrega a su boleto selecciones de varios partidos distintos y confirma una sola apuesta combinada cuya
cuota es el producto de las cuotas. La combinada gana solo si aciertan todas las selecciones; pierde en cuanto falla
una.

**Why this priority**: es un requisito funcional, pero reutiliza la aceptación y la liquidación de las historias 2
y 3.

**Independent Test**: confirmar una combinada de tres selecciones, liquidar los partidos uno a uno y comprobar que
queda pendiente hasta el último, que gana solo si aciertan todas y que pierde en cuanto falla una.

**Acceptance Scenarios**:

1. **Given** selecciones de partidos distintos en el boleto, **When** el apostador confirma, **Then** se registra
   una apuesta combinada con la cuota total congelada (producto de las cuotas) y se descuenta el monto una vez.
2. **Given** dos selecciones del mismo partido, **When** el apostador intenta combinarlas, **Then** el sistema lo
   impide e indica el motivo.
3. **Given** una combinada con una selección perdida, **When** se liquida esa selección, **Then** la combinada
   queda "perdida" aunque falten partidos por jugarse.
4. **Given** una combinada en la que todas las selecciones resultan ganadoras, **When** se liquida la última,
   **Then** se acredita monto × cuota total congelada.
5. **Given** que cambió la cuota de cualquiera de las selecciones antes de confirmar, **When** el apostador
   confirma, **Then** se le pide reconfirmar con las cuotas nuevas.

---

### User Story 5 - Importación automática de partidos y resultados, con modo simulación (Priority: P2)

Un único proceso del sistema importa del proveedor de datos deportivos los partidos, sus estados, marcadores,
resultados y cuotas pre-partido, sin superar el presupuesto diario de consultas del plan contratado: consulta con
frecuencia los partidos en vivo y espacia el resto. Para la demostración y las pruebas, un modo simulación reemplaza
al proveedor y permite al operador simular el desarrollo de un partido (inicio, goles, suspensión, final).

**Why this priority**: es el criterio de cierre de F3, pero el operador puede cargar partidos y resultados a mano
mientras tanto, y el modo simulación permite probar todo lo demás sin el proveedor.

**Independent Test**: con el presupuesto configurado en un valor bajo, dejar correr la importación un día simulado
y comprobar que importa los partidos y nunca supera el presupuesto; en modo simulación, jugar un partido completo y
comprobar que dispara la liquidación igual que uno real.

**Acceptance Scenarios**:

1. **Given** la importación activa, **When** el proveedor publica los partidos del día, **Then** aparecen en la
   cartelera sin intervención del operador y sin duplicarse si se importan otra vez.
2. **Given** partidos en vivo y partidos futuros, **When** corre la importación, **Then** los en vivo se consultan
   con mayor frecuencia que los futuros.
3. **Given** que se alcanzó el presupuesto diario de consultas, **When** llega el siguiente ciclo, **Then** no se
   hace ninguna consulta más hasta el día siguiente y el operador ve un aviso de presupuesto agotado.
4. **Given** el proveedor caído o respondiendo con error, **When** corre la importación, **Then** reintenta más
   tarde sin perder resultados ni gastar el presupuesto en reintentos inmediatos.
5. **Given** el modo simulación activo, **When** el operador simula el final de un partido, **Then** las apuestas
   se liquidan como si el resultado viniera del proveedor, y no se hace ninguna consulta al proveedor.
6. **Given** cualquier pantalla del navegador, **When** se inspeccionan sus peticiones, **Then** ninguna va al
   proveedor ni contiene su credencial.

---

### User Story 6 - Suspensiones, aplazamientos y cancelaciones (Priority: P2)

Si un partido se suspende o se aplaza, sus mercados dejan de aceptar apuestas y las apuestas existentes se
mantienen pendientes. Si el partido se reanuda o se juega dentro del plazo configurado (por defecto 48 horas), las
apuestas siguen vigentes. Si no ocurre en ese plazo, o si el partido se cancela, las apuestas sobre él se anulan y se
reembolsa el monto apostado una sola vez. En una combinada, la selección anulada cuenta con cuota 1.00 y el resto
sigue vigente.

**Why this priority**: es un criterio de cierre de F5 y una fuente clásica de disputas, pero ocurre con menos
frecuencia que el flujo normal.

**Independent Test**: aplazar un partido simulado con apuestas simples y combinadas, dejar vencer el plazo y
comprobar que las simples se reembolsan una vez y que las combinadas recalculan su cuota con 1.00 en esa selección.

**Acceptance Scenarios**:

1. **Given** un partido en vivo, **When** el operador o el proveedor lo marcan como suspendido, **Then** sus
   mercados dejan de aceptar apuestas y las apuestas existentes siguen pendientes.
2. **Given** un partido suspendido que se reanuda dentro del plazo, **When** se reanuda, **Then** las apuestas se
   mantienen y se liquidan con el resultado final.
3. **Given** un partido suspendido o aplazado que no se juega dentro del plazo, **When** vence el plazo, **Then**
   el sistema, sin intervención del operador, anula sus apuestas simples y reembolsa cada monto una sola vez.
4. **Given** un partido cancelado, **When** se registra la cancelación, **Then** se anulan y reembolsan sus
   apuestas de inmediato.
5. **Given** una combinada con una selección de un partido anulado, **When** se anula esa selección, **Then** se
   toma con cuota 1.00, la cuota total se recalcula y el resto de la combinada sigue vigente.
6. **Given** una combinada en la que todas las selecciones quedan anuladas, **When** se anula la última, **Then**
   se reembolsa el monto completo.
7. **Given** un partido suspendido con 2 goles marcados, **When** se anula por vencer el plazo, **Then** el
   mercado "más/menos de 1.5 goles", ya decidido, se liquida con normalidad y los mercados no decididos se anulan.

---

### User Story 7 - Apuestas en vivo con retardo de aceptación (Priority: P3)

Durante un partido en vivo, el apostador puede apostar en los mercados habilitados para vivo. Para evitar la
ventaja de quien ve el partido con menos retraso, la apuesta espera un retardo configurable antes de aceptarse y,
al terminar el retardo, se vuelve a validar el estado del partido, del mercado y de la cuota.

**Why this priority**: es opcional según los requisitos ("si se habilitan") y depende de que haya cuotas en vivo
(del proveedor o del operador), pero mitiga un vector de fraude listado en el brief.

**Independent Test**: confirmar una apuesta en vivo, comprobar que queda "en espera" durante el retardo y se acepta
al terminar; repetir cambiando la cuota durante el retardo y comprobar que no se acepta.

**Acceptance Scenarios**:

1. **Given** un mercado habilitado para vivo, **When** el apostador confirma una apuesta, **Then** queda "en
   espera" durante el retardo configurado y luego se acepta si nada cambió.
2. **Given** una apuesta en espera, **When** durante el retardo cambia la cuota, se suspende el mercado o se marca
   un gol, **Then** la apuesta no se acepta, no se descuenta saldo y se informa al apostador el motivo.
3. **Given** un mercado no habilitado para vivo, **When** el partido empieza, **Then** el mercado se cierra
   automáticamente.

---

### User Story 8 - Corrección de resultado y re-liquidación auditada (Priority: P3)

Si el proveedor o un operador corrigen el resultado de un partido ya liquidado, el sistema re-liquida de forma
controlada las apuestas afectadas y deja en la auditoría el resultado anterior, el nuevo, quién lo cambió, cuándo y
por qué.

**Why this priority**: lo exige la constitución (principio V), pero las correcciones son poco frecuentes.

**Independent Test**: liquidar un partido, corregir su resultado y comprobar que las apuestas que pasan a ganar
reciben su premio una sola vez, que el tratamiento de las que dejan de ganar es el acordado y que todo quedó
auditado.

**Acceptance Scenarios**:

1. **Given** un partido liquidado, **When** un operador corrige el resultado indicando un motivo, **Then** las
   apuestas afectadas se re-liquidan y la corrección queda auditada con el resultado anterior y el nuevo.
2. **Given** una apuesta que pasa de perdida a ganada por la corrección, **When** se re-liquida, **Then** recibe su
   premio una sola vez.
3. **Given** una apuesta ya pagada que pasa de ganada a perdida, **When** se re-liquida, **Then** el premio se
   revierte con un movimiento compensatorio una sola vez, aunque el saldo del apostador quede negativo, y mientras
   sea negativo el apostador no puede apostar ni retirar.
4. **Given** la misma corrección procesada dos veces, **When** se reprocesa, **Then** ningún saldo cambia la
   segunda vez.

### Edge Cases

- La cuota cambia entre que el apostador la ve y la confirma: se pide reconfirmación; nunca se acepta en silencio
  con otra cuota.
- El cliente envía una hora de inicio, una cuota o una ganancia potencial manipuladas: el servidor las ignora y usa
  sus propios valores.
- Dos apuestas simultáneas del mismo apostador que juntas superan su saldo: se acepta solo lo que el saldo cubre y
  el saldo nunca queda negativo.
- El mismo resultado final llega dos veces del proveedor, o llega primero por el proveedor y luego lo carga el
  operador: se liquida una sola vez.
- El partido finaliza mientras una apuesta en vivo está en su retardo: la apuesta no se acepta.
- Un partido aplazado recibe nueva fecha dentro del plazo: las apuestas se mantienen y el mercado vuelve a abrirse
  hasta la nueva hora de inicio.
- Se agota el presupuesto de consultas con partidos en vivo: el operador recibe el aviso y puede cargar el resultado
  a mano; la liquidación funciona igual.
- El operador cambia la cuota de un mercado importado: a partir de ahí la importación no la sobrescribe.
- El monto tiene más de dos decimales, es cero o negativo: se rechaza.
- La ganancia potencial supera el máximo: se rechaza indicando el monto máximo que sí se puede apostar con esa
  cuota.
- La billetera no responde durante una aceptación: la apuesta no se registra y el apostador ve un error que le
  indica reintentar; durante una liquidación, se reintenta hasta completarla.
- Una apuesta con cupón cuando el servicio de promociones no está disponible: se rechaza con un mensaje claro y no
  se descuenta nada.
- Un partido importado desaparece del proveedor o cambia de fecha: se actualiza la fecha; nunca se borra un partido
  con apuestas.

## Requirements *(mandatory)*

### Functional Requirements

**Partidos y mercados**

- **FR-001**: El operador y el administrador MUST poder crear y editar partidos con competición, equipo local,
  equipo visitante, fecha y hora de inicio y estado.
- **FR-002**: El sistema MUST aplicar la máquina de estados del partido y rechazar cualquier otra transición:
  programado → en vivo → finalizado; programado → aplazado → programado (con nueva fecha); en vivo → suspendido →
  en vivo; programado, en vivo, suspendido o aplazado → cancelado. "Finalizado" y "cancelado" son estados finales;
  un resultado finalizado solo cambia mediante una corrección (FR-036).
- **FR-003**: El sistema MUST permitir mercados por partido, cada uno con sus selecciones y una cuota decimal mayor
  a 1.00 con dos decimales por selección, configurados por el operador o importados del proveedor.
- **FR-004**: El sistema MUST soportar, con liquidación automática a partir del marcador del tiempo reglamentario
  (incluido el tiempo añadido; sin prórroga ni penales), estos tipos de mercado: resultado final (local, empate,
  visitante); doble oportunidad (local o empate, empate o visitante, local o visitante); más/menos de N goles, con
  líneas de medio gol (0.5, 1.5, 2.5…) para que no haya empate con la línea; y ambos marcan (sí, no). Los mercados
  del proveedor de otros tipos no se importan.
- **FR-005**: El operador MUST poder cambiar cuotas y suspender o reabrir un mercado individual; el cambio aplica
  solo a las apuestas nuevas.
- **FR-006**: Un cambio manual de cuota en un mercado importado MUST marcar ese mercado como gestionado por el
  operador; a partir de ahí la importación no sobrescribe sus cuotas.
- **FR-007**: El sistema MUST impedir eliminar un partido o mercado con apuestas; solo se puede cancelar.
- **FR-008**: La cartelera y el detalle de partidos (estado, marcador, mercados y cuotas vigentes) MUST poder
  consultarse sin iniciar sesión; apostar exige sesión iniciada.

**Importación desde el proveedor de datos deportivos**

- **FR-009**: Un único proceso del sistema MUST importar partidos, estados, marcadores, resultados y cuotas
  pre-partido del proveedor; los navegadores nunca consultan al proveedor ni reciben su credencial.
- **FR-010**: La importación MUST respetar un presupuesto diario de consultas configurable y no superarlo nunca; al
  agotarlo, se detiene hasta el día siguiente y avisa al operador.
- **FR-011**: La importación MUST consultar con mayor frecuencia los partidos en vivo que el resto, y priorizarlos
  cuando el presupuesto restante es bajo.
- **FR-012**: La importación MUST ser idempotente (importar los mismos datos otra vez no duplica partidos, mercados
  ni resultados) y tolerante a fallas del proveedor (reintentos espaciados sin pérdida de resultados).
- **FR-013**: El sistema MUST ofrecer un modo simulación configurable en el que no se consulta al proveedor y el
  operador puede simular inicio, cambios de marcador, suspensión, reanudación y final de un partido; los eventos
  simulados siguen el mismo camino que los reales.

**Apuestas**

- **FR-014**: El apostador MUST poder confirmar una apuesta simple (una selección) o combinada (de 2 a un máximo
  configurable de selecciones, todas de partidos distintos), indicando el monto.
- **FR-015**: Aceptar una apuesta MUST validar el saldo, descontar el monto y registrar la apuesta en una sola
  operación indivisible: si cualquier paso falla, no queda ni apuesta ni movimiento de dinero.
- **FR-016**: La cuota de cada selección MUST tomarse del servidor y congelarse al aceptar la apuesta; si difiere de
  la que vio el apostador, la apuesta no se acepta y se le pide reconfirmar con la cuota vigente.
- **FR-017**: El sistema MUST cerrar los mercados pre-partido a la hora de inicio según el reloj del servidor, y
  rechazar apuestas sobre partidos que no estén en un estado que las admita o sobre mercados suspendidos.
- **FR-018**: Las apuestas en vivo MUST esperar un retardo configurable antes de aceptarse y revalidar al terminarlo
  el estado del partido y del mercado y la cuota; si algo cambió, no se aceptan ni se descuenta saldo.
- **FR-019**: El sistema MUST aplicar límites configurables de monto mínimo y máximo por apuesta, de monto total
  apostado por usuario en un día y de ganancia potencial máxima por apuesta, e informar el límite que se superó.
- **FR-020**: El sistema MUST evitar apuestas duplicadas por reenvío de la misma solicitud (doble clic, reintento
  de red): la misma solicitud produce como máximo una apuesta y un descuento.
- **FR-021**: Una apuesta aceptada MUST ser inmutable: no existe forma de modificarla ni borrarla; solo puede
  anularse por las reglas de este spec, y cada anulación queda auditada.
- **FR-022**: Si el apostador incluye un código de cupón, el sistema MUST aplicarlo mediante el servicio de
  promociones dentro de la misma operación de aceptación (incluido el tipo de saldo y la cuota final que este
  devuelva); si ese servicio no está disponible, MUST rechazar la apuesta con un mensaje claro.
- **FR-023**: El apostador MUST poder consultar "Mis apuestas" con estado (en espera, pendiente, ganada, perdida,
  anulada), selecciones, monto, cuota congelada, ganancia potencial y premio pagado.
- **FR-024**: Tras aceptar una apuesta, el sistema MUST emitir el evento "apuesta aceptada" del contrato 5, solo
  después de que la operación quedó confirmada.

**Liquidación**

- **FR-025**: Al conocerse el resultado final de un partido, el sistema MUST liquidar automáticamente todas las
  selecciones pendientes de sus mercados, sin intervención del operador.
- **FR-026**: Una apuesta simple ganadora MUST recibir monto × cuota congelada en el mismo tipo de saldo con que se
  apostó; una combinada gana solo si todas sus selecciones ganan (las anuladas cuentan con cuota 1.00), pierde en
  cuanto una pierde y permanece pendiente mientras falten selecciones por resolverse.
- **FR-027**: La liquidación, los reembolsos y la re-liquidación MUST ser idempotentes: procesar el mismo resultado
  o la misma anulación más de una vez no produce un segundo pago ni un segundo reembolso.
- **FR-028**: Los resultados y las liquidaciones MUST procesarse de forma persistente: una caída del servicio no
  pierde resultados y la liquidación pendiente se completa al recuperarse.
- **FR-029**: El sistema MUST notificar en tiempo real, sin recargar, los cambios de marcador y estado de los
  partidos y el resultado de las apuestas a su dueño (y solo a él), en 5 segundos o menos desde que el resultado
  llega al sistema.
- **FR-030**: Tras liquidar o anular una apuesta, el sistema MUST emitir el evento "apuesta liquidada" del
  contrato 5.
- **FR-031**: Si un partido se anula tras una suspensión o un aplazamiento, los mercados cuyo resultado ya estaba
  decidido con el marcador al momento de la suspensión (p. ej. "más de 1.5 goles" con 2 goles marcados, o "ambos
  marcan: sí" con goles de los dos equipos) MUST liquidarse con normalidad en lugar de anularse.

**Suspensiones, aplazamientos y cancelaciones**

- **FR-032**: Un partido suspendido o aplazado MUST dejar de aceptar apuestas y mantener pendientes las existentes.
- **FR-033**: Si un partido suspendido o aplazado no se reanuda o juega dentro del plazo configurable (por defecto
  48 horas desde la suspensión o desde la hora de inicio original), el sistema MUST anular automáticamente sus
  selecciones al vencer el plazo.
- **FR-034**: Un partido cancelado MUST anular sus selecciones de inmediato.
- **FR-035**: Al anularse una selección, una apuesta simple MUST reembolsarse por el monto apostado una sola vez;
  en una combinada, la selección MUST tomarse con cuota 1.00 y la combinada sigue vigente, salvo que todas sus
  selecciones queden anuladas, en cuyo caso se reembolsa completa.

**Corrección de resultados**

- **FR-036**: El operador y el administrador MUST poder corregir el resultado de un partido finalizado indicando un
  motivo obligatorio; las correcciones del proveedor siguen el mismo camino.
- **FR-037**: Una corrección MUST re-liquidar solo las apuestas afectadas: las que pasan a ganar reciben su premio
  una sola vez y las que dejan de ganar se tratan según FR-038.
- **FR-038**: Una apuesta ya pagada que deja de ganar por una corrección MUST revertir su premio con un movimiento
  compensatorio en el mismo tipo de saldo, una sola vez, aunque el saldo quede negativo; mientras el saldo real o de
  bono del apostador sea negativo, el sistema MUST rechazar sus apuestas nuevas indicando el motivo, y el retiro
  queda bloqueado porque no hay saldo disponible.

**Seguridad, auditoría y datos**

- **FR-039**: Toda ruta MUST exigir sesión y rol según el contrato 1: gestión de partidos, mercados, cuotas,
  estados, simulación y correcciones solo para operador o administrador; apuestas e historial solo para el
  apostador dueño; cartelera y detalle públicos (FR-008).
- **FR-040**: El sistema MUST registrar en la auditoría, dentro de la misma operación que la acción: creación y
  cambios de estado de partidos por el operador, cambios de cuota, suspensión y reapertura de mercados, apuestas
  aceptadas, anulaciones, reembolsos, correcciones de resultado y re-liquidaciones, con quién, qué, cuándo, IP y
  dispositivo cuando apliquen.
- **FR-041**: Ningún valor calculado en el cliente (monto, cuota, ganancia potencial, hora) MUST aceptarse sin
  revalidarse en el servidor.
- **FR-042**: Los datos de partidos, mercados, apuestas, selecciones y liquidaciones MUST quedar legibles para el
  servicio de reportes según el contrato 7 (nombres estables, montos con dos decimales y fechas en UTC).

### Vectores de fraude y mitigación

Exigido por la constitución (principio I). Cada vector tiene una prueba obligatoria en el plan.

| Vector | Mitigación | Requisitos |
|--------|------------|------------|
| Apostar sin saldo | Validar y descontar en la misma operación indivisible; rechazo sin efectos | FR-015 |
| Doble gasto con apuestas simultáneas | Operación indivisible con bloqueo de la billetera; saldo nunca negativo | FR-015 |
| Apostar después del inicio | Cierre por reloj del servidor; se ignora la hora del cliente | FR-017, FR-041 |
| Cuota alterada por el cliente | Cuota del servidor; reconfirmación si cambió | FR-016, FR-041 |
| Ventaja por latencia en vivo | Retardo de aceptación y revalidación al terminarlo | FR-018 |
| Apuesta duplicada por reenvío | Una solicitud produce como máximo una apuesta | FR-020 |
| Doble pago de una apuesta ganada | Liquidación idempotente | FR-027 |
| Doble reembolso de un partido aplazado | Reembolso idempotente | FR-027, FR-035 |
| Modificar o borrar una apuesta aceptada | Inmutabilidad; anulación solo por regla y auditada | FR-021, FR-040 |
| Manipular resultados o cuotas desde dentro | Solo operador/administrador, con motivo y auditoría | FR-036, FR-039, FR-040 |
| Cobrar y gastar un premio luego corregido | Reversión compensatoria; con saldo negativo no se apuesta ni retira | FR-038 |
| Agotar la cuota del proveedor | Presupuesto diario que nunca se supera | FR-010 |
| Exposición de la credencial del proveedor | Solo el servidor consulta al proveedor | FR-009 |
| Ver apuestas o notificaciones ajenas | Historial y notificaciones solo para el dueño | FR-029, FR-039 |

### Key Entities

- **Competición**: torneo o liga al que pertenece un partido (nombre, país o región, identificador del proveedor
  si fue importada).
- **Partido**: enfrentamiento entre un equipo local y uno visitante en una competición, con hora de inicio, estado,
  marcador, resultado final, origen (operador o proveedor) y momento de suspensión o aplazamiento.
- **Mercado**: tipo de apuesta sobre un partido (p. ej. resultado final), con su regla de liquidación, si admite
  apuestas en vivo, si está abierto o suspendido y si lo gestiona el operador o el proveedor.
- **Selección**: opción concreta dentro de un mercado (p. ej. "gana el local"), con su cuota vigente y su resultado
  (pendiente, ganadora, perdedora, anulada).
- **Historial de cuota**: cada valor que tuvo la cuota de una selección, con quién la cambió y cuándo.
- **Apuesta**: compromiso inmutable de un apostador: tipo (simple o combinada), monto, tipo de saldo, cuota total
  congelada, ganancia potencial, estado, premio pagado, cupón aplicado y fechas de aceptación y liquidación.
- **Selección apostada**: cada selección incluida en una apuesta con la cuota congelada al aceptarla y su resultado.
- **Liquidación**: registro de cada vez que se resolvió una apuesta (original, anulación o re-liquidación), con el
  resultado, el monto pagado o reembolsado y el resultado del partido que la originó.
- **Consumo del proveedor**: consultas hechas en el día frente al presupuesto configurado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El resultado de un partido se refleja en la pantalla del apostador en 5 segundos o menos desde que
  llega al sistema, en el 100 % de las pruebas de punta a punta.
- **SC-002**: En las pruebas de abuso, el 0 % de las apuestas sin saldo, posteriores al inicio, con cuota distinta
  a la mostrada o fuera de límites queda aceptada.
- **SC-003**: Procesar el mismo resultado o la misma anulación 5 veces deja todos los saldos idénticos a procesarlos
  una vez (cero pagos o reembolsos duplicados).
- **SC-004**: Con 20 apuestas simultáneas del mismo apostador que en total superan su saldo, el monto aceptado nunca
  supera el saldo y el saldo final es exacto.
- **SC-005**: Los partidos del día se importan sin intervención y las consultas al proveedor nunca superan el
  presupuesto diario configurado.
- **SC-006**: El 100 % de las apuestas de un partido aplazado fuera de plazo se reembolsan exactamente una vez sin
  intervención del operador.
- **SC-007**: Un apostador con saldo pasa de la cartelera a una apuesta simple confirmada en menos de 1 minuto.
- **SC-008**: El operador simula un partido completo (inicio, marcador, final y liquidación) para la demostración
  en menos de 2 minutos, sin conexión con el proveedor.
- **SC-009**: Cartelera, boleto, mis apuestas y panel del operador son usables desde 360 px de ancho y cumplen
  WCAG 2.1 AA.

## Assumptions

- Depende del Spec 2 para identidad y roles (contrato 1), billetera (contrato 2) y auditoría (contrato 3). Mientras
  no estén en `develop`, este spec trabaja contra dobles que cumplen esos contratos; el identificador del usuario se
  guarda como texto hasta que exista el modelo de usuario.
- Los cupones dependen del Spec 4 (contrato 4) y son opcionales: sin él, las apuestas con cupón se rechazan.
- Moneda: dólares estadounidenses con dos decimales. Cuotas en formato decimal.
- Valores por defecto configurables: plazo de suspensión o aplazamiento de 48 h; retardo en vivo de 5 s; monto
  mínimo 0.50 y máximo 500.00 por apuesta; 1 000.00 de monto total apostado por usuario y día; ganancia potencial
  máxima de 5 000.00 por apuesta; combinadas de 2 a 10 selecciones.
- El plan gratuito del proveedor puede no incluir cuotas en vivo: las cuotas en vivo, si existen, las fija el
  operador; las pre-partido vienen del proveedor o del operador.
- El catálogo de deportes y mercados no se define en el alcance general; este spec soporta lo que ofrezca el
  proveedor dentro de los tipos de mercado que defina FR-004, empezando por fútbol.
- Las fechas se guardan en UTC y se muestran en la hora local del apostador.
- Quedan fuera de alcance: cierre anticipado de apuestas (cash-out), apuestas entre usuarios, apuestas de sistema
  (p. ej. "trixie") y cuotas calculadas automáticamente por el sistema.
- Revertir un premio ya pagado (FR-038) requiere una operación nueva en el contrato de billetera (hoy solo permite
  debitar apuestas, acreditar premios y reembolsar) y que el ledger admita un saldo negativo originado por esa
  reversión. El cambio de firma se acuerda con el dueño del Spec 2 en su PR, según la regla de
  `docs/equipo/contratos.md`.
