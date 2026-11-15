# Feature Specification: Promociones, antifraude y reportes

**Feature Branch**: `feature/spec-4`
**Created**: 2026-11-15
**Status**: Draft
**Responsable**: Erick Rodas
**Input**: User description: "Spec 4 del equipo: promociones, antifraude y reportes. Cupones de bono de depósito, apuesta gratis y aumento de cuota con vigencia, cupo, límite por usuario, rollover y controles anti-abuso por usuario, dispositivo y método de pago, expuestos a las apuestas mediante PromocionesApuestaPort. Reglas de detección de fraude (cuentas múltiples, apuestas anómalas, retiro inmediato tras depósito) con alertas y RiesgoPort para retiros. Servicio de reportes en Python con usuario de solo lectura y token de administrador, métricas de volumen, GGR, pagos, depósitos, retiros, usuarios activos, cupones y fraude, filtros y exportación CSV/PDF, y dashboard en la web."

## Contexto

Este spec cubre las fases F6 (promociones y antifraude) y F7 (reportes y cierre) de [`PLAN.md`](../../PLAN.md) y
agrupa las specs 010, 012 y 013 del catálogo original (ver [`specs/README.md`](../README.md)). Es el último spec en
el orden de dependencias: consume la identidad, los roles, la billetera y la auditoría del Spec 2, los eventos de
apuestas del Spec 3 y los datos de ambos en solo lectura, a través de los contratos de
[`docs/equipo/contratos.md`](../../docs/equipo/contratos.md). Provee los puertos de promociones (al Spec 3) y de
riesgo (al Spec 2).

Actores: **apostador** (usa cupones y ve el avance de sus bonos), **operador** (gestiona cupones),
**administrador** (todo lo del operador, revisa alertas de fraude y consulta reportes) y los **procesos del
sistema** que reaccionan a los eventos de registro, depósito, apuesta, liquidación y retiro.

## Clarifications

### Session 2026-11-15

- Q: ¿Cómo se "canjea" un cupón si el apostador no tiene una pantalla de canje? → A: Con la operación que lo usa:
  el bono de depósito se indica al depositar y se aplica cuando el depósito se confirma; la apuesta gratis y el
  aumento de cuota se indican al confirmar la apuesta y se consumen dentro de ella. Existe una vista previa que
  valida el código sin consumirlo.
- Q: ¿Puede un apostador tener varios bonos con rollover pendiente a la vez? → A: No. Un bono a la vez: mientras
  tenga un bono activo, cualquier otro cupón que otorgue bono (depósito o apuesta gratis) se rechaza con el motivo.
  El aumento de cuota no otorga bono y sí se puede usar.
- Q: ¿Qué apuestas cuentan para el rollover? → A: Las liquidadas como ganadas o perdidas, aceptadas después de
  otorgado el bono y con cuota total de al menos 1.50 (configurable). Las anuladas no cuentan.
- Q: ¿Qué se convierte en saldo real al cumplir el rollover? → A: Todo el saldo de bono que tenga el apostador en
  ese momento. El saldo de bono nunca se puede retirar directamente.
- Q: ¿Qué hace una alerta de fraude sobre el usuario? → A: No bloquea la cuenta (eso es del Spec 2). Mientras el
  usuario tenga una alerta de severidad alta abierta o confirmada, sus retiros van a revisión manual y no puede
  usar cupones que otorguen bono.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Gestión de cupones por el operador (Priority: P1)

El operador crea un cupón con su código, tipo (bono de depósito, apuesta gratis o aumento de cuota), valor,
condiciones (depósito mínimo, monto máximo de apuesta), vigencia, cupo total y límite por usuario. Ve la lista de
cupones con cuántos canjes lleva cada uno, puede pausarlo y reactivarlo, extender su vigencia o ampliar su cupo.
Los cambios quedan auditados.

**Why this priority**: sin cupones no hay promociones que aplicar; es la base de las historias 2 y 3 y se puede
demostrar sin los otros specs.

**Independent Test**: como operador, crear un cupón de aumento de cuota, verlo en la lista con 0 canjes, pausarlo
y comprobar que la vista previa del código responde "pausado" y que la creación y la pausa quedaron auditadas.

**Acceptance Scenarios**:

1. **Given** un operador autenticado, **When** crea un cupón con código, tipo, valor, vigencia, cupo y límite por
   usuario válidos, **Then** el cupón queda activo y aparece en la lista con 0 canjes.
2. **Given** un cupón existente con el código "BIENVENIDA", **When** el operador crea otro con "bienvenida",
   **Then** el sistema lo rechaza porque el código ya existe (los códigos no distinguen mayúsculas).
3. **Given** un cupón con canjes, **When** el operador intenta cambiar su tipo o su valor, **Then** el sistema lo
   rechaza y explica que solo puede pausarlo, extender la vigencia o ampliar el cupo.
4. **Given** un cupón activo, **When** el operador lo pausa, **Then** ningún canje nuevo se acepta hasta que lo
   reactive, y los canjes ya hechos no cambian.
5. **Given** un apostador, **When** intenta crear, editar o listar cupones de gestión, **Then** el sistema lo
   rechaza por falta de permisos.
6. **Given** datos inválidos (fin de vigencia anterior al inicio, cupo 0, porcentaje fuera de rango), **When** el
   operador guarda, **Then** el sistema indica qué campo corregir y no crea nada.

---

### User Story 2 - Apuesta gratis y aumento de cuota (Priority: P1)

El apostador escribe un código de cupón en su boleto. Antes de confirmar ve qué hace el cupón y si puede usarlo.
Al confirmar la apuesta, el cupón se valida y se consume dentro de la misma operación que acepta la apuesta: una
apuesta gratis se paga con saldo de bono que el cupón otorga en ese momento; un aumento de cuota sube la cuota
total congelada. Si la apuesta falla, el cupón no queda usado.

**Why this priority**: es el contrato que el Spec 3 espera para aceptar apuestas con cupón y concentra los vectores
de abuso de cupones (reutilización, canje concurrente, cupo agotado).

**Independent Test**: con el servicio de promociones y dobles de billetera y auditoría, aplicar un cupón de
aumento de cuota de 10 % a una apuesta de cuota 2.00 y obtener 2.20; aplicar el mismo cupón otra vez con el mismo
usuario y recibir "ya usaste este cupón".

**Acceptance Scenarios**:

1. **Given** un cupón de aumento de cuota del 10 % activo, **When** el apostador lo aplica a una apuesta con cuota
   total 2.00, **Then** la cuota final congelada es 2.20 y el cupón suma un canje.
2. **Given** un cupón de apuesta gratis de 5.00, **When** el apostador lo aplica a una apuesta de 5.00, **Then** se
   le acreditan 5.00 de bono, la apuesta se paga con ese saldo de bono y se crea un bono con su requisito de
   rollover.
3. **Given** un cupón de apuesta gratis de 5.00, **When** el apostador intenta apostar 8.00 con él, **Then** el
   sistema lo rechaza porque el monto supera el valor del cupón.
4. **Given** un apostador que ya alcanzó el límite por usuario de un cupón, **When** lo vuelve a usar, **Then** el
   sistema lo rechaza con el motivo "ya usaste este cupón".
5. **Given** un cupón ya canjeado por otra cuenta registrada desde el mismo dispositivo, **When** este apostador lo
   usa, **Then** el sistema lo rechaza y registra una alerta de posible cuenta múltiple.
6. **Given** un cupón con cupo de 10 canjes, **When** llegan 50 solicitudes simultáneas de usuarios distintos,
   **Then** exactamente 10 se aceptan y las demás reciben "cupón agotado".
7. **Given** un cupón vencido, pausado o agotado, **When** el apostador lo usa, **Then** el sistema lo rechaza con un
   motivo legible y la apuesta no se acepta.
8. **Given** una apuesta con cupón que falla después de aplicar el cupón (p. ej. saldo insuficiente), **When**
   termina la operación, **Then** el cupón no queda canjeado ni se otorga bono.
9. **Given** un código de cupón, **When** el apostador pide la vista previa, **Then** ve el tipo, el valor y si
   puede usarlo (o por qué no), sin consumirlo.

---

### User Story 3 - Bono de depósito y rollover (Priority: P1)

El apostador indica un código de bono de depósito al depositar. Cuando el depósito se confirma, recibe el bono en
su saldo de bono con un requisito de rollover (un múltiplo del bono). Cada apuesta que cuenta suma a su avance;
al cumplir el requisito, todo su saldo de bono pasa a saldo real y se puede retirar. Una pantalla "Mis bonos"
muestra el avance.

**Why this priority**: el rollover es el control que impide retirar dinero de promociones sin apostar; sin él un
bono de depósito es dinero gratis.

**Independent Test**: emitir un depósito confirmado de 20.00 con un cupón del 100 % hasta 10.00 y rollover ×5;
comprobar que se acreditan 10.00 de bono con requisito 50.00; liquidar apuestas que suman 50.00 con cuota válida y
comprobar que el saldo de bono pasa a real una sola vez.

**Acceptance Scenarios**:

1. **Given** un cupón de bono de depósito del 100 % con tope de 10.00 y depósito mínimo de 10.00, **When** se
   confirma un depósito de 20.00 con ese código, **Then** el apostador recibe 10.00 de bono y un requisito de
   rollover de 50.00 (con el multiplicador por defecto ×5).
2. **Given** un depósito de 5.00 con ese cupón, **When** se confirma, **Then** no se otorga bono, el depósito no se
   ve afectado y el apostador ve el motivo en "Mis bonos".
3. **Given** el mismo evento de depósito confirmado recibido dos veces, **When** se procesa, **Then** el bono se
   acredita una sola vez.
4. **Given** un bono activo con requisito de 50.00, **When** se liquidan apuestas que cuentan por 50.00, **Then**
   todo el saldo de bono se convierte en saldo real una sola vez y el bono queda cumplido.
5. **Given** un bono activo, **When** se liquida una apuesta con cuota total 1.20 o una apuesta anulada, **Then** no
   suma al avance.
6. **Given** un bono activo, **When** el apostador intenta usar otro cupón que otorga bono, **Then** se rechaza con
   el motivo "ya tienes un bono activo".
7. **Given** un bono activo que llega a su fecha de vencimiento sin cumplir el rollover, **When** se consulta,
   **Then** aparece vencido, deja de sumar avance, su saldo de bono no pasa a real y el apostador puede recibir un
   bono nuevo.
8. **Given** un apostador con saldo de bono, **When** intenta retirar, **Then** solo puede retirar su saldo real
   (el saldo de bono no es retirable; lo garantiza la billetera del Spec 2).

---

### User Story 4 - Detección de fraude y alertas (Priority: P1)

El sistema evalúa reglas de fraude cuando ocurren registros, depósitos y apuestas: cuentas múltiples por
dispositivo, IP o método de pago, y apuestas anómalas (monto muy superior al habitual o ráfagas). Cada regla
activada crea una alerta con su severidad y su evidencia. El administrador revisa las alertas, las filtra y las
resuelve como confirmada o descartada con una nota; la resolución queda auditada.

**Why this priority**: la detección de fraude es criterio prioritario del proyecto (constitución, principio I).

**Independent Test**: emitir dos eventos de usuario registrado con el mismo dispositivo y comprobar que se crea
una alerta alta de cuenta múltiple que nombra ambas cuentas; resolverla como administrador y verla en la
auditoría.

**Acceptance Scenarios**:

1. **Given** una cuenta registrada desde un dispositivo, **When** se registra otra cuenta desde el mismo
   dispositivo, **Then** se crea una alerta de severidad alta "cuentas múltiples por dispositivo" con ambas
   cuentas como evidencia.
2. **Given** 3 cuentas registradas desde la misma IP en 24 horas, **When** se registra la cuarta, **Then** se crea
   una alerta de severidad media "cuentas múltiples por IP".
3. **Given** un método de pago usado por una cuenta, **When** otra cuenta confirma un depósito con el mismo método
   de pago, **Then** se crea una alerta alta "método de pago compartido".
4. **Given** un apostador con al menos 5 apuestas previas de 2.00 en promedio, **When** apuesta 50.00, **Then** se
   crea una alerta media "apuesta anómala por monto".
5. **Given** un apostador, **When** hace más de 10 apuestas en 60 segundos, **Then** se crea una sola alerta media
   "ráfaga de apuestas" para esa ventana.
6. **Given** el mismo evento recibido dos veces, **When** se procesa, **Then** no se duplica la alerta.
7. **Given** un administrador, **When** filtra alertas por estado, severidad, regla o usuario, **Then** ve solo las
   que cumplen el filtro, de la más reciente a la más antigua.
8. **Given** una alerta abierta, **When** el administrador la confirma o descarta con una nota, **Then** cambia de
   estado, queda registrado quién y cuándo, y una alerta resuelta no se puede volver a resolver.
9. **Given** un operador o apostador, **When** intenta ver o resolver alertas, **Then** el sistema lo rechaza por
   falta de permisos.

---

### User Story 5 - Riesgo de retiros (Priority: P2)

Cuando el apostador solicita un retiro, el Spec 2 consulta el riesgo. Si el retiro llega poco después de un
depósito sin actividad de apuestas proporcional, o el usuario tiene una alerta alta abierta o confirmada, el
retiro va a revisión manual con los motivos, y se crea una alerta.

**Why this priority**: cierra el ciclo "depositar y retirar sin jugar" (lavado y abuso de pasarela); depende del
flujo de retiros del Spec 2, que llega después.

**Independent Test**: registrar un depósito confirmado de 100.00 y apuestas por 10.00 en la última hora; evaluar
un retiro de 90.00 y obtener "requiere revisión" con el motivo "retiro tras depósito sin actividad".

**Acceptance Scenarios**:

1. **Given** un depósito confirmado de 100.00 hace 2 horas y apuestas por 10.00 desde entonces, **When** se evalúa
   un retiro, **Then** requiere revisión con el motivo "retiro tras depósito sin actividad" y se crea una alerta
   alta.
2. **Given** un depósito de hace 2 horas y apuestas por 60.00 desde entonces (al menos el 50 % del depósito),
   **When** se evalúa un retiro, **Then** no requiere revisión por esta regla.
3. **Given** un usuario con una alerta alta abierta o confirmada, **When** se evalúa un retiro, **Then** requiere
   revisión con el motivo "usuario con alerta de fraude".
4. **Given** un usuario sin depósitos recientes ni alertas, **When** se evalúa un retiro, **Then** no requiere
   revisión y no se crea alerta.
5. **Given** una falla interna al evaluar, **When** el Spec 2 consulta el riesgo, **Then** la respuesta es
   "requiere revisión" (falla cerrada), nunca "aprobado".

---

### User Story 6 - Dashboard de reportes (Priority: P2)

El administrador abre el dashboard y ve las métricas del periodo: volumen apostado, GGR, premios pagados,
depósitos y retiros, usuarios activos, uso de cupones y alertas de fraude, junto con su evolución por día y el
desglose por competición. Filtra por rango de fechas, deporte, competición y usuario. Los datos los calcula el
servicio de reportes leyendo la base de datos con un usuario de solo lectura.

**Why this priority**: es el requisito 3.8 del proyecto y el cierre de la fase F7; depende de que existan datos de
los specs 2 y 3.

**Independent Test**: con datos de prueba conocidos (apuestas, depósitos, retiros, canjes y alertas), pedir el
resumen de un rango de fechas y comprobar cada métrica contra el valor calculado a mano; repetir con un filtro de
competición.

**Acceptance Scenarios**:

1. **Given** apuestas, depósitos, retiros, canjes y alertas conocidos, **When** el administrador pide el resumen de
   un rango de fechas, **Then** cada métrica coincide con el cálculo esperado (definiciones en FR-031).
2. **Given** el filtro de una competición, **When** pide el resumen, **Then** las métricas de apuestas solo cuentan
   apuestas con alguna selección de esa competición.
3. **Given** el filtro de un usuario (por correo o identificador), **When** pide el resumen, **Then** todas las
   métricas se restringen a ese usuario.
4. **Given** un rango sin datos, **When** pide el resumen, **Then** ve ceros y un mensaje de "sin datos en este
   periodo", no un error.
5. **Given** un rango de más de 366 días o con fin anterior al inicio, **When** lo pide, **Then** el sistema indica
   cómo corregirlo.
6. **Given** una petición sin token, con token vencido, con firma inválida o sin rol de administrador, **When**
   llega al servicio de reportes, **Then** responde 401 (sin token válido) o 403 (sin rol) y no consulta la base.
7. **Given** cualquier ruta del servicio de reportes, **When** se ejecuta, **Then** no escribe en la base (el
   usuario de base de datos no tiene permisos de escritura).

---

### User Story 7 - Exportación CSV y PDF (Priority: P2)

Desde el dashboard, con los filtros aplicados, el administrador descarga el reporte en CSV (para hojas de cálculo)
o en PDF (para presentar). Ambos incluyen los filtros usados y la fecha de generación.

**Why this priority**: requisito explícito; reutiliza los cálculos de la historia 6.

**Independent Test**: exportar el mismo rango en CSV y PDF y comprobar que los totales coinciden con el resumen.

**Acceptance Scenarios**:

1. **Given** filtros aplicados, **When** el administrador exporta CSV, **Then** descarga un archivo con el resumen y
   la serie diaria, con los mismos valores que el dashboard.
2. **Given** filtros aplicados, **When** exporta PDF, **Then** descarga un documento con título, filtros, fecha de
   generación, las métricas y la serie diaria.
3. **Given** valores de texto que empiezan con `=`, `+`, `-` o `@` (p. ej. un nombre de competición), **When** se
   exportan a CSV, **Then** se neutralizan para que una hoja de cálculo no los ejecute como fórmula.
4. **Given** un usuario sin rol de administrador, **When** intenta exportar, **Then** recibe 401 o 403.

---

### User Story 8 - Cierre del proyecto (Priority: P3)

Con los cuatro specs en `develop`, el equipo hace la revisión OWASP Top 10 y de dependencias, la revisión de
accesibilidad y responsividad, carga datos de demostración, completa la documentación final y publica la versión
1.0.

**Why this priority**: es el último paso del proyecto y depende de todo lo demás.

**Independent Test**: en staging, con la seed de demostración, recorrer el guion de demo de punta a punta sin
errores y con el quality gate de SonarQube aprobado y sin vulnerabilidades críticas o altas.

**Acceptance Scenarios**:

1. **Given** los cuatro specs integrados, **When** se ejecuta la revisión OWASP Top 10 y de dependencias, **Then**
   queda un informe con cada categoría revisada y cero hallazgos críticos o altos abiertos.
2. **Given** las pantallas del sistema, **When** se revisan a 360 px y con lector de pantalla y teclado, **Then**
   cumplen WCAG 2.1 AA o el hallazgo queda corregido.
3. **Given** una base vacía, **When** se ejecuta la seed de demostración, **Then** existen usuarios de los tres
   roles, partidos, apuestas, depósitos, cupones y alertas suficientes para el guion de demo.
4. **Given** todo lo anterior, **When** se crea `release/1.0` y se integra a `main`, **Then** queda el tag `v1.0.0`
   y la versión desplegada en producción.

---

### Edge Cases

- Códigos de cupón con espacios o minúsculas: se normalizan (sin espacios, en mayúsculas) antes de buscar.
- Cupón que vence entre la vista previa y la confirmación de la apuesta: se rechaza al confirmar; manda la hora
  del servidor.
- Depósito confirmado con un código inexistente: el depósito se mantiene, no se otorga bono y queda el motivo.
- Evento de liquidación de una apuesta que el servicio de promociones no vio aceptar (se perdió el evento de
  aceptación): no suma rollover, porque no se puede comprobar que se aceptó después del bono.
- Re-liquidación (corrección de resultado del Spec 3) de una apuesta ya contada: no se cuenta dos veces.
- Saldo de bono en cero antes de cumplir el rollover: el bono sigue activo hasta cumplirse o vencer; al cumplirse
  se convierte el saldo que haya (puede ser cero).
- Billetera o auditoría no disponibles (Spec 2 aún no integrado): las operaciones que las necesitan fallan con un
  error claro y sin efectos parciales; nunca se otorga un bono sin asiento ni se cambia un cupón sin auditoría.
- Un mismo dispositivo compartido legítimamente (familia): genera alerta, no bloqueo; el administrador la descarta.
- Dashboard con el servicio de reportes caído: la página muestra que los reportes no están disponibles y permite
  reintentar; no muestra cifras viejas como actuales.
- Reportes con una tabla de otro spec todavía inexistente: el servicio responde un error claro de "datos no
  disponibles" en lugar de cifras incompletas.

## Requirements *(mandatory)*

### Functional Requirements

**Cupones**

- **FR-001**: El operador y el administrador MUST poder crear cupones con: código único (4 a 20 caracteres, letras
  y números, sin distinguir mayúsculas), tipo, valor, vigencia (inicio y fin), cupo total, límite por usuario y las
  condiciones de su tipo.
- **FR-002**: Los tipos de cupón MUST ser: bono de depósito (porcentaje del depósito entre 1 y 200 %, con tope de
  bono y depósito mínimo), apuesta gratis (monto fijo; la apuesta no puede superarlo) y aumento de cuota (porcentaje
  entre 1 y 100 % sobre la cuota total, con monto máximo de apuesta).
- **FR-003**: El operador MUST poder listar cupones con su número de canjes, pausar y reactivar un cupón, extender
  su vigencia y ampliar su cupo. El tipo, el valor y las condiciones de un cupón con canjes MUST ser inmutables.
- **FR-004**: Un canje MUST rechazarse con un motivo legible si el cupón no existe, está pausado, no ha empezado,
  venció, agotó su cupo, el usuario alcanzó su límite, la operación no cumple las condiciones del tipo o aplica una
  regla anti-abuso (FR-006, FR-007).
- **FR-005**: El cupo total y el límite por usuario MUST respetarse con solicitudes simultáneas: nunca se aceptan
  más canjes que el cupo ni más por usuario que su límite.
- **FR-006**: Un cupón MUST rechazarse si ya lo canjeó otra cuenta registrada desde alguno de los dispositivos del
  usuario o, en bonos de depósito, con el mismo método de pago. El rechazo crea una alerta de cuenta múltiple.
- **FR-007**: Un usuario con un bono activo o con una alerta alta abierta o confirmada MUST NOT poder canjear
  cupones que otorgan bono (depósito y apuesta gratis).
- **FR-008**: El servicio de promociones MUST ofrecer al Spec 3 la operación del contrato 4 que valida y consume el
  cupón dentro de la transacción de la apuesta: un aumento de cuota devuelve la cuota final redondeada a dos
  decimales; una apuesta gratis acredita como bono el monto apostado y devuelve que la apuesta se paga con saldo de
  bono. Si la transacción de la apuesta se revierte, el canje y el bono también.
- **FR-009**: El apostador MUST poder ver la vista previa de un código (tipo, valor, condiciones y si puede usarlo
  o por qué no) sin consumirlo.

**Bonos y rollover**

- **FR-010**: Al recibir un depósito confirmado con código de cupón de bono de depósito, el sistema MUST acreditar
  como bono `min(depósito × porcentaje, tope)` si el depósito alcanza el mínimo, o registrar el canje rechazado con
  su motivo si no.
- **FR-011**: Todo bono otorgado (depósito o apuesta gratis) MUST registrarse con su monto, un requisito de rollover
  igual al monto por un multiplicador configurable (×5 por defecto) y una fecha de vencimiento configurable (30 días
  por defecto).
- **FR-012**: Cuentan para el rollover del bono activo las apuestas liquidadas como ganadas o perdidas, aceptadas
  después de otorgado el bono y con cuota total mayor o igual a la mínima configurable (1.50 por defecto). Las
  anuladas y las re-liquidaciones de apuestas ya contadas no suman.
- **FR-013**: Al alcanzar el requisito, el sistema MUST convertir todo el saldo de bono del usuario en saldo real
  mediante la billetera, exactamente una vez, y marcar el bono como cumplido.
- **FR-014**: Un bono no cumplido a su fecha de vencimiento MUST quedar vencido: deja de sumar avance y su saldo
  no se convierte.
- **FR-015**: El apostador MUST poder ver sus bonos: monto, requisito, avance, estado, vencimiento y los canjes
  rechazados con su motivo.
- **FR-016**: La acreditación de bonos y la conversión MUST ser idempotentes: procesar el mismo evento varias
  veces produce un único movimiento en la billetera.

**Detección de fraude**

- **FR-017**: El sistema MUST registrar la actividad que necesitan las reglas (registros con IP y dispositivo,
  depósitos con método de pago, apuestas aceptadas y liquidadas, retiros) a partir de los eventos de dominio, sin
  duplicar un evento recibido dos veces.
- **FR-018**: Regla de cuentas múltiples: MUST crear una alerta alta cuando un dispositivo o un método de pago
  aparece en más de una cuenta, y una alerta media cuando una IP registra más cuentas que el umbral configurable
  (3 en 24 horas por defecto).
- **FR-019**: Regla de apuesta anómala por monto: MUST crear una alerta media cuando una apuesta supera el promedio
  de las apuestas previas del usuario por un factor configurable (×10 por defecto), si el usuario tiene un mínimo de
  apuestas previas (5 por defecto).
- **FR-020**: Regla de ráfaga: MUST crear una alerta media cuando un usuario supera un número de apuestas en una
  ventana (10 en 60 segundos por defecto), una sola vez por ventana.
- **FR-021**: Regla de retiro tras depósito: al evaluar un retiro, si hubo un depósito confirmado en una ventana
  configurable (24 horas por defecto) y lo apostado desde entonces es menor que un porcentaje del depósito (50 % por
  defecto), MUST responder que requiere revisión y crear una alerta alta.
- **FR-022**: Cada alerta MUST guardar la regla, la severidad (media o alta), el usuario, la evidencia (cuentas,
  dispositivo, IP, montos) y la fecha; la misma regla no crea alertas duplicadas para la misma evidencia.
- **FR-023**: El administrador MUST poder listar alertas con filtros (estado, severidad, regla, usuario y rango de
  fechas), ver su detalle y resolverlas como confirmada o descartada con una nota obligatoria. Una alerta resuelta
  no se vuelve a resolver.
- **FR-024**: La evaluación de riesgo de un retiro MUST responder "requiere revisión" con sus motivos cuando aplica
  FR-021 o el usuario tiene una alerta alta abierta o confirmada, y MUST fallar cerrada (requiere revisión) ante
  cualquier error interno.
- **FR-025**: Las reglas de fraude MUST NOT bloquear registros, depósitos ni apuestas por sí mismas: generan
  alertas para revisión humana (las restricciones automáticas son solo las de FR-007 y FR-024).

**Reportes y dashboard**

- **FR-026**: El servicio de reportes MUST aceptar solo tokens de acceso firmados por la API con su clave pública,
  vigentes, con el emisor y la audiencia del contrato 6 y el rol de administrador; responde 401 sin token válido y
  403 sin el rol.
- **FR-027**: El servicio de reportes MUST leer con el usuario de base de datos de solo lectura y MUST NOT exponer
  rutas que escriban.
- **FR-028**: El servicio MUST ofrecer el resumen de métricas, la serie diaria y el desglose por competición de un
  rango de fechas, con filtros opcionales de deporte, competición y usuario (por correo o identificador).
- **FR-029**: El rango de fechas MUST ser obligatorio, con fin igual o posterior al inicio y de 366 días como
  máximo; las fechas se interpretan en UTC.
- **FR-030**: Los filtros MUST llegar a la base como parámetros, nunca concatenados en la consulta.
- **FR-031**: Definiciones de métricas en el rango (por fecha de aceptación de la apuesta o de confirmación del
  movimiento): volumen apostado = suma de montos de apuestas aceptadas no anuladas; premios pagados = suma de premios
  pagados de apuestas liquidadas; GGR = montos de apuestas ganadas o perdidas − premios pagados; depósitos y retiros =
  cantidad y suma de los confirmados o pagados; usuarios activos = usuarios distintos con al menos una apuesta;
  cupones = canjes aceptados, canjes rechazados y bono otorgado; alertas = abiertas, confirmadas y descartadas por
  severidad.
- **FR-032**: El servicio MUST exportar el resumen y la serie diaria en CSV (con neutralización de fórmulas) y en
  PDF, con los filtros aplicados y la fecha de generación.
- **FR-033**: El dashboard MUST mostrar las métricas, la evolución diaria y el desglose, con filtros en la URL para
  poder compartir la vista, y botones de exportación. Pide los datos al servicio de reportes desde el servidor web,
  sin exponer el token al código del navegador.
- **FR-034**: Las pantallas de gestión de cupones (operador), alertas (administrador), reportes (administrador) y
  mis bonos (apostador) MUST ser usables desde 360 px y cumplir WCAG 2.1 AA.

**Seguridad y auditoría**

- **FR-035**: Toda ruta de este spec MUST exigir sesión y su rol: gestión de cupones para operador o administrador,
  alertas y reportes para administrador, vista previa y mis bonos para el apostador dueño. Si el contrato de
  autenticación no está disponible, MUST denegar.
- **FR-036**: MUST quedar en auditoría: creación y cambios de cupones (`cupon.creado`, `cupon.actualizado`,
  `cupon.pausado`, `cupon.reactivado`), bonos otorgados y convertidos (`bono.otorgado`, `bono.convertido`) y
  resolución de alertas (`alerta.resuelta`).
- **FR-037**: Toda operación de dinero de este spec (bono, conversión) MUST hacerse mediante la billetera del Spec 2
  con su clave de idempotencia; este spec no guarda saldos.

### Vectores de fraude y mitigación

Exigido por la constitución (principio I). Cada vector tiene una prueba obligatoria en el plan.

| Vector | Mitigación | Requisitos |
|--------|------------|------------|
| Reutilizar un cupón | Límite por usuario con bloqueo del cupón; idempotencia por operación | FR-004, FR-005 |
| Canje concurrente que supera el cupo | Bloqueo de fila del cupón y conteo dentro de la transacción | FR-005 |
| Cuentas múltiples para repetir un cupón | Rechazo por dispositivo y método de pago compartidos; alerta | FR-006, FR-018 |
| Retirar un bono sin rollover | Bono en cuenta separada; solo se convierte al cumplir el requisito | FR-011, FR-013 |
| Cumplir el rollover sin riesgo (cuotas bajas) | Cuota mínima para contar | FR-012 |
| Apilar bonos | Un bono activo a la vez | FR-007 |
| Doble acreditación de bono o conversión | Claves de idempotencia en la billetera | FR-016, FR-037 |
| Cupón vencido, pausado o agotado | Validación con el reloj del servidor dentro de la transacción | FR-004 |
| Depositar y retirar sin jugar | Revisión manual del retiro y alerta | FR-021, FR-024 |
| Apuestas anómalas (información privilegiada, bots) | Alertas por monto y ráfaga | FR-019, FR-020 |
| Evaluación de riesgo caída que aprueba retiros | Falla cerrada | FR-024 |
| Operador que se otorga cupones a sí mismo | Gestión auditada; el operador no apuesta (Spec 3) | FR-036 |
| Escritura desde reportes | Usuario de base de datos de solo lectura; sin rutas de escritura | FR-027 |
| Reportes sin ser administrador o con token falsificado | Firma asimétrica, emisor, audiencia, vigencia y rol | FR-026 |
| Inyección SQL por filtros | Parámetros de consulta | FR-030 |
| Inyección de fórmulas en CSV | Neutralización de celdas | FR-032 |
| Fuga del token al navegador | Llamadas a reportes desde el servidor web | FR-033 |

### Key Entities

- **Cupón**: código, tipo, valor, condiciones del tipo, vigencia, cupo total, límite por usuario, estado (activo o
  pausado), número de canjes y quién lo creó.
- **Canje de cupón**: un uso de un cupón por un usuario (aceptado o rechazado con motivo), con la operación que lo
  originó (apuesta o depósito), el dispositivo o método de pago si aplica y la fecha.
- **Bono**: monto otorgado a un usuario por un canje, requisito de rollover, avance, estado (activo, cumplido o
  vencido), fechas de otorgamiento, vencimiento y cumplimiento.
- **Actividad observada**: registro, depósito, apuesta aceptada, apuesta liquidada o retiro de un usuario, tomado de
  un evento de dominio, con su monto, cuota, IP, dispositivo o método de pago según el tipo.
- **Alerta de fraude**: regla, severidad, usuario, evidencia, estado (abierta, confirmada o descartada), nota de
  resolución, quién la resolvió y cuándo.
- **Reporte** (no se guarda): métricas calculadas a pedido para un rango y filtros.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En las pruebas de abuso, el 0 % de los canjes repetidos, vencidos, pausados, agotados o desde un
  dispositivo o método de pago ya usado por otra cuenta se acepta.
- **SC-002**: Con 50 canjes simultáneos de un cupón de cupo 10, se aceptan exactamente 10 en el 100 % de las
  ejecuciones.
- **SC-003**: Procesar 5 veces el mismo depósito confirmado o la misma liquidación produce un solo bono y una sola
  conversión.
- **SC-004**: El 0 % del saldo de bono pasa a saldo real antes de cumplir el rollover.
- **SC-005**: El 100 % de los escenarios de fraude de prueba (dispositivo, IP, método de pago, monto, ráfaga y
  retiro tras depósito) genera su alerta, y ninguno la genera dos veces.
- **SC-006**: Las métricas del dashboard coinciden al centavo con el cálculo esperado sobre los datos de prueba.
- **SC-007**: El resumen de un rango de 31 días con 100 000 apuestas responde en menos de 3 segundos.
- **SC-008**: El 100 % de las peticiones a reportes sin token válido o sin rol de administrador se rechaza.
- **SC-009**: Un operador crea un cupón en menos de 1 minuto y un administrador resuelve una alerta en menos de 30
  segundos.
- **SC-010**: Las pantallas de cupones, alertas, reportes y mis bonos son usables desde 360 px y cumplen WCAG 2.1 AA.

## Assumptions

- Depende del Spec 2 para identidad y roles (contrato 1), billetera (contrato 2), auditoría (contrato 3), token de
  acceso (contrato 6) y los eventos de registro, depósito y retiro; y del Spec 3 para los eventos de apuesta y los
  datos de apuestas (contrato 7). Mientras no estén en `develop`, este spec trabaja contra dobles que cumplen esos
  contratos; el identificador del usuario se guarda como texto hasta que exista el modelo de usuario.
- Requiere cambios menores a contratos de otros specs, propuestos en `contracts/cambios-contratos.md`: el método de
  pago en el evento de depósito confirmado (Spec 2), la cuota total en el evento de apuesta liquidada (Spec 3), el
  deporte de la competición (Spec 3) y las tablas de usuarios, depósitos y retiros que leen los reportes (Spec 2).
- Moneda: dólares estadounidenses con dos decimales.
- Valores por defecto configurables: rollover ×5, cuota mínima 1.50, vencimiento del bono 30 días, 3 cuentas por IP
  en 24 horas, factor de apuesta anómala ×10 con 5 apuestas previas, ráfaga de 10 apuestas en 60 segundos, retiro
  tras depósito en 24 horas con menos del 50 % apostado.
- El bloqueo de cuentas y la aprobación de retiros son del Spec 2; este spec solo alerta y evalúa riesgo.
- La historia 8 (cierre) se ejecuta cuando los specs 2 y 3 estén en `develop`; sus artefactos de este spec (seed
  de cupones y alertas, revisión de sus pantallas) se preparan antes.
- Quedan fuera de alcance: cupones con segmentación por usuario, programas de lealtad, reportes programados por
  correo y aprendizaje automático para el fraude.
