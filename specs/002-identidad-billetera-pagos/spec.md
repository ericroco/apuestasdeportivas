# Feature Specification: Identidad, billetera y pagos

**Feature Branch**: `feature/spec-2`
**Created**: 2026-11-15
**Status**: Draft
**Responsable**: Ricardo Espinosa
**Input**: User description: "Spec 2 del equipo: identidad, billetera y pagos. Registro con verificación de correo y mayoría de edad, login con JWT en cookie httpOnly y refresh rotativo, 2FA TOTP, roles apostador/operador/administrador con denegación por defecto, bloqueo por intentos fallidos, CAPTCHA y auditoría append-only. Billetera con ledger de doble entrada inmutable (saldo real y de bono separados) que implementa BilleteraPort de apps/api/src/contracts. Depósitos con Payphone sandbox confirmados servidor a servidor e idempotentes. Retiros con 2FA, solo al titular del depósito y revisión manual sobre un umbral. Pantallas de acceso, billetera, depósito, retiro y administración de usuarios y retiros."

## Contexto

Este spec cubre las fases F1 y F2 de [`PLAN.md`](../../PLAN.md) y los retiros de la F6, y agrupa las specs 002, 003,
004 y 011 del catálogo original (ver [`specs/README.md`](../README.md)). Es la base de confianza del sistema: quién
es cada usuario, qué puede hacer y cuánto dinero tiene. Provee a los demás specs, a través de los contratos de
[`docs/equipo/contratos.md`](../../docs/equipo/contratos.md), la autenticación y los roles (contrato 1), la billetera
(contrato 2), la auditoría (contrato 3), los eventos "usuario registrado", "depósito confirmado" y "retiro
solicitado" (contrato 5) y el token de acceso que valida el servicio de reportes (contrato 6). Consume, si está
disponible, la evaluación de riesgo de retiros del Spec 4 (contrato 4).

Actores: **visitante** (sin cuenta), **apostador** (usuario autenticado), **operador**, **administrador**, la
**pasarela de pagos** (Payphone en modo sandbox) y los **otros specs** que mueven dinero a través de la billetera
(apuestas, liquidación, promociones).

No se opera con dinero real: todos los pagos se hacen en el entorno de pruebas de la pasarela.

## Clarifications

### Session 2026-11-15

- Q: ¿Quién aprueba un retiro bajo el umbral y sin alertas de riesgo? → A: Se aprueba automáticamente y se marca
  pagado al instante con referencia simulada; sobre el umbral o con alertas, lo revisa el administrador.
- Q: ¿Se acepta la operación `revertirPremio` que propone el Spec 3, aunque deje saldo negativo? → A: Sí, tal
  cual: se agrega al contrato 2 con las claves `apuesta:<id>:reversion:r<n>` (y `apuesta:<id>:premio:r<n>` para
  re-liquidar), es la única operación que puede dejar saldo negativo y mientras lo sea el usuario no retira.
- Q: ¿El 2FA es obligatorio para iniciar sesión con los roles operador y administrador? → A: Sí, para ambos; quien
  tiene uno de esos roles sin 2FA activo solo puede activarlo hasta completarlo.
- Q: ¿Se incluye la recuperación de contraseña olvidada? → A: Sí, con un enlace al correo de un solo uso que caduca
  en 1 hora; al cambiarla se cierran todas las sesiones.
- Q: ¿Operador y administrador pueden depositar y retirar? → A: No; solo quien tiene el rol apostador y ninguno de
  los otros dos, coherente con la regla del Spec 3 de que no pueden apostar.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registro con verificación de correo y mayoría de edad (Priority: P1)

Un visitante crea su cuenta con su nombre completo, correo, contraseña y fecha de nacimiento, declara que es mayor
de edad y resuelve un CAPTCHA. El sistema le envía un enlace de verificación al correo. Hasta que lo verifica puede
iniciar sesión y ver su cuenta, pero no puede depositar, apostar ni retirar.

**Why this priority**: sin cuentas no existe nada más; además es la primera barrera contra cuentas falsas y
menores de edad.

**Independent Test**: registrar una cuenta, abrir el correo de verificación en el buzón de desarrollo, seguir el
enlace y comprobar que la cuenta queda verificada; repetir con un menor de edad, un correo ya usado y sin CAPTCHA y
comprobar los rechazos.

**Acceptance Scenarios**:

1. **Given** un visitante con datos válidos y mayor de 18 años, **When** completa el registro y el CAPTCHA,
   **Then** la cuenta queda creada como "pendiente de verificación" con el rol apostador y recibe un correo con un
   enlace de verificación.
2. **Given** una fecha de nacimiento que indica menos de 18 años o la declaración de mayoría de edad sin marcar,
   **When** intenta registrarse, **Then** el registro se rechaza explicando el motivo.
3. **Given** un correo que ya tiene cuenta, **When** alguien intenta registrarse con él, **Then** la respuesta
   visible es la misma que en un registro nuevo (no revela si el correo existe) y al dueño de la cuenta le llega un
   aviso por correo en lugar de un segundo enlace.
4. **Given** un enlace de verificación válido, **When** el usuario lo abre, **Then** la cuenta queda verificada y
   el enlace deja de funcionar.
5. **Given** un enlace caducado o ya usado, **When** el usuario lo abre, **Then** se le informa y puede pedir uno
   nuevo.
6. **Given** un registro sin CAPTCHA válido, **When** se envía, **Then** se rechaza sin crear la cuenta.

---

### User Story 2 - Inicio de sesión seguro y protección contra fuerza bruta (Priority: P1)

El usuario inicia sesión con correo y contraseña (y su segundo factor si lo tiene activado). La sesión dura poco y
se renueva sola mientras el usuario está activo; al cerrar sesión deja de servir en ese dispositivo. Tras varios
intentos fallidos la cuenta se bloquea temporalmente.

**Why this priority**: protege todas las cuentas y es el criterio de cierre de la F1 ("intento de fuerza bruta
bloqueado").

**Independent Test**: iniciar sesión, esperar a que caduque el acceso y comprobar que se renueva sin volver a pedir
la contraseña; cerrar sesión y comprobar que la sesión anterior no sirve; fallar la contraseña 5 veces y comprobar
el bloqueo aun con la contraseña correcta.

**Acceptance Scenarios**:

1. **Given** credenciales correctas y CAPTCHA válido, **When** el usuario inicia sesión, **Then** entra a su cuenta
   y la sesión no es legible por scripts de la página.
2. **Given** un correo inexistente o una contraseña incorrecta, **When** intenta entrar, **Then** recibe el mismo
   mensaje genérico en ambos casos.
3. **Given** 5 intentos fallidos consecutivos sobre una cuenta, **When** se intenta entrar otra vez, aunque sea con
   la contraseña correcta, **Then** se rechaza durante 15 minutos y el bloqueo queda auditado.
4. **Given** una sesión activa cuyo acceso caducó, **When** el usuario sigue usando la aplicación, **Then** la
   sesión se renueva sin pedir credenciales y la credencial de renovación anterior deja de servir.
5. **Given** una credencial de renovación ya usada, **When** alguien intenta reutilizarla, **Then** se rechaza y se
   cierran todas las sesiones de ese usuario (posible robo).
6. **Given** un usuario que cierra sesión, **When** se reutiliza su sesión anterior, **Then** se rechaza.
7. **Given** una cuenta suspendida por el administrador, **When** intenta iniciar sesión o usar una sesión abierta,
   **Then** se rechaza.
8. **Given** un usuario que olvidó su contraseña, **When** pide recuperarla con su correo y CAPTCHA, **Then** recibe
   un enlace de un solo uso que caduca en 1 hora, y la respuesta visible es la misma exista o no el correo.
9. **Given** un enlace de recuperación válido, **When** el usuario fija una contraseña nueva, **Then** se cierran
   todas sus sesiones, el enlace deja de servir, el cambio queda auditado y, si tiene 2FA activo, se le sigue
   pidiendo al iniciar sesión.

---

### User Story 3 - Control de acceso por roles y auditoría (Priority: P1)

Cada acción del sistema exige un usuario autenticado salvo las pocas públicas (salud, registro, inicio de sesión,
verificación de correo y la confirmación de la pasarela). Las acciones de operador y de administrador exigen ese
rol. Toda acción sensible queda registrada de forma permanente con quién, qué, cuándo, IP y dispositivo.

**Why this priority**: es el contrato del que dependen los specs 3 y 4 para proteger sus pantallas y registrar sus
acciones; desbloquea su trabajo.

**Independent Test**: llamar a cada acción protegida sin sesión, con apostador, con operador y con administrador, y
comprobar que solo los roles permitidos pasan; ejecutar una acción sensible y comprobar su evento en la auditoría;
comprobar que no hay forma de editar ni borrar un evento.

**Acceptance Scenarios**:

1. **Given** una acción sin marca de pública, **When** se invoca sin sesión, **Then** se rechaza como no
   autenticada.
2. **Given** un apostador autenticado, **When** invoca una acción reservada a operador o administrador, **Then** se
   rechaza por falta de permisos y el intento queda auditado.
3. **Given** un usuario con varios roles, **When** invoca una acción que exige cualquiera de ellos, **Then** pasa.
4. **Given** una acción sensible (registro, inicio de sesión fallido, bloqueo, cambio de rol, depósito, retiro),
   **When** ocurre, **Then** queda un evento de auditoría con actor, acción, entidad, fecha, IP y dispositivo, sin
   contraseñas, tokens, secretos ni datos completos de pago.
5. **Given** un evento de auditoría, **When** cualquiera (incluido el administrador) intenta modificarlo o borrarlo
   por cualquier vía, **Then** no es posible.

---

### User Story 4 - Billetera con saldo real y de bono derivados del libro contable (Priority: P1)

El apostador ve su saldo real, su saldo de bono y la lista de sus movimientos (depósitos, apuestas, premios,
reembolsos, bonos y retiros). Cada movimiento es un asiento de doble entrada que no se modifica nunca; el saldo se
calcula a partir de los asientos. Los demás specs mueven dinero solo a través de las operaciones de la billetera.

**Why this priority**: es el corazón de la integridad financiera (principio II) y lo necesita el Spec 3 para
aceptar apuestas.

**Independent Test**: ejecutar débitos, premios, reembolsos y bonos sobre una billetera y comprobar que los saldos
mostrados coinciden con la suma de los asientos; lanzar muchos débitos simultáneos y comprobar que el saldo final es
exacto y nunca negativo; repetir una operación con la misma clave y comprobar que no se duplica.

**Acceptance Scenarios**:

1. **Given** un apostador con movimientos, **When** abre su billetera, **Then** ve el saldo real y el de bono por
   separado y sus movimientos del más reciente al más antiguo, con fecha, tipo, monto y saldo resultante.
2. **Given** una billetera con 100.00 de saldo real, **When** llegan a la vez 20 débitos de 10.00, **Then** se
   aceptan exactamente 10, se rechazan 10 por saldo insuficiente y el saldo final es 0.00.
3. **Given** una operación ya registrada con una clave de idempotencia, **When** se repite con la misma clave,
   **Then** no se crea otro asiento y se devuelve el resultado original.
4. **Given** una operación que falla a mitad (por ejemplo, la apuesta no se pudo registrar), **When** se revierte la
   operación completa, **Then** tampoco queda el movimiento de dinero.
5. **Given** cualquier usuario o proceso, **When** intenta modificar o borrar un asiento, **Then** no existe forma de
   hacerlo; una corrección se registra como un asiento compensatorio nuevo.
6. **Given** un premio ya pagado que una corrección de resultado anula, **When** se revierte, **Then** se registra un
   asiento compensatorio aunque el saldo quede negativo, y mientras sea negativo el apostador no puede retirar.

---

### User Story 5 - Depósito con la pasarela confirmado por el servidor (Priority: P1)

El apostador verificado elige un monto (y, si tiene, un código de cupón), el sistema registra la intención de pago y
lo lleva a la pasarela. Al volver, la aplicación muestra "procesando" mientras el servidor confirma la transacción
directamente con la pasarela; solo si el monto, la moneda y la referencia coinciden con la intención, el saldo real
se acredita, una sola vez.

**Why this priority**: sin depósitos no hay saldo con qué apostar; es el criterio de cierre de la F2 y concentra
los vectores de fraude de pagos.

**Independent Test**: hacer un depósito en el sandbox y comprobar el saldo acreditado; repetir la confirmación,
volver de la pasarela sin pagar y alterar el monto devuelto, y comprobar que en ningún caso se acredita de más.

**Acceptance Scenarios**:

1. **Given** un apostador verificado, **When** pide depositar 50.00 dentro de los límites, **Then** se registra una
   intención de pago con una referencia única y se le lleva a la pasarela.
2. **Given** un pago aprobado en la pasarela, **When** el servidor lo confirma y el monto, la moneda y la referencia
   coinciden con la intención, **Then** el saldo real aumenta en 50.00, el movimiento aparece en la billetera y se
   emite el evento "depósito confirmado" con el código de cupón si lo hubo.
3. **Given** un depósito ya acreditado, **When** la confirmación llega o se procesa otra vez, **Then** el saldo no
   cambia.
4. **Given** una confirmación cuyo monto, moneda o referencia no coinciden con la intención, **When** se procesa,
   **Then** el depósito se rechaza, no se acredita nada y queda una alerta en la auditoría.
5. **Given** que el usuario vuelve de la pasarela sin haber pagado, o manipula la dirección de regreso, **When**
   llega a la aplicación, **Then** el saldo no cambia.
6. **Given** un pago rechazado o cancelado en la pasarela, **When** el servidor lo confirma, **Then** la intención
   queda como fallida y el usuario ve el motivo.
7. **Given** un usuario sin correo verificado, **When** intenta depositar, **Then** se le pide verificar el correo
   primero.
8. **Given** que el usuario cerró el navegador tras pagar y no volvió a la aplicación, **When** pasan 15 minutos,
   **Then** la intención queda "caducada" sin acreditar nada; la pasarela revierte por sí sola los pagos que no se
   confirman en sus primeros 5 minutos, así que no hay cobro sin acreditación.

---

### User Story 6 - Segundo factor de autenticación (Priority: P2)

El usuario activa un segundo factor con una aplicación de códigos temporales: escanea un código QR, confirma con un
código y recibe códigos de recuperación de un solo uso. Desde entonces se le pide el código al iniciar sesión y en
cada retiro.

**Why this priority**: es obligatorio para retirar y para iniciar sesión como operador o administrador, pero no
bloquea el registro ni los depósitos de los apostadores.

**Independent Test**: activar el segundo factor, cerrar sesión y comprobar que el inicio de sesión pide el código;
usar un código de recuperación una vez y comprobar que no sirve una segunda vez.

**Acceptance Scenarios**:

1. **Given** un usuario autenticado, **When** activa el segundo factor y confirma con un código válido, **Then**
   queda activo, se le muestran 10 códigos de recuperación una sola vez y el cambio queda auditado.
2. **Given** un usuario con segundo factor activo, **When** inicia sesión con la contraseña correcta, **Then** se le
   pide el código y solo entra si es válido.
3. **Given** un código ya usado dentro de su ventana de tiempo, **When** se intenta usar otra vez, **Then** se
   rechaza.
4. **Given** 5 códigos incorrectos seguidos, **When** se intenta otro, **Then** se aplica el mismo bloqueo temporal
   que a la contraseña.
5. **Given** un usuario que perdió su dispositivo, **When** usa un código de recuperación, **Then** entra y ese
   código deja de servir.
6. **Given** un usuario que quiere desactivar el segundo factor, **When** lo pide, **Then** debe confirmar con un
   código válido; si tiene rol de operador o administrador, no puede desactivarlo.
7. **Given** un operador o administrador sin segundo factor activo (por ejemplo, recién promovido), **When** inicia
   sesión, **Then** solo puede activar el segundo factor; cualquier otra acción se rechaza hasta completarlo.

---

### User Story 7 - Retiro al mismo titular con revisión sobre un umbral (Priority: P2)

El apostador con segundo factor activo solicita retirar parte de su saldo real. Solo puede elegir como destino un
método y titular que ya usó en un depósito confirmado. El monto queda reservado en el acto. Los retiros que superan
el umbral configurado, o que la evaluación de riesgo marca, quedan pendientes de revisión manual; como el sandbox no
permite pagos salientes, el pago se registra con una referencia simulada.

**Why this priority**: es un requisito funcional del proyecto y un vector de fraude clave, pero llega después de
tener saldo y apuestas.

**Independent Test**: con saldo real y un depósito previo, solicitar un retiro con 2FA y comprobar la reserva;
intentar sin 2FA, a otro titular y sobre el saldo, y comprobar los rechazos; solicitar uno sobre el umbral y
comprobar que queda pendiente de revisión.

**Acceptance Scenarios**:

1. **Given** un apostador con 2FA activo, saldo real suficiente y un depósito confirmado, **When** solicita un
   retiro bajo el umbral con un código válido y sin alertas de riesgo, **Then** el monto sale de su saldo
   disponible, el retiro queda "pagado" al instante con una referencia simulada y se emite el evento "retiro
   solicitado".
2. **Given** un retiro sin código 2FA válido o de un usuario sin 2FA activo, **When** se solicita, **Then** se
   rechaza.
3. **Given** un destino que no corresponde a un método y titular de un depósito confirmado del mismo usuario,
   **When** se solicita el retiro, **Then** se rechaza.
4. **Given** un monto mayor al saldo real disponible (el saldo de bono no es retirable), **When** se solicita,
   **Then** se rechaza indicando el disponible.
5. **Given** un monto sobre el umbral de revisión o marcado por la evaluación de riesgo, **When** se solicita,
   **Then** queda "pendiente de revisión" con los motivos visibles para el administrador.
6. **Given** dos solicitudes simultáneas que juntas superan el saldo, **When** llegan, **Then** solo se acepta la que
   cabe.
7. **Given** un saldo real negativo por una reversión de premio, **When** se solicita un retiro, **Then** se rechaza.

---

### User Story 8 - Revisión de retiros por el administrador (Priority: P2)

El administrador ve los retiros pendientes con los datos del usuario, su historial de depósitos y apuestas y los
motivos de revisión, y los aprueba o rechaza con un comentario. Al aprobar, el retiro se marca como pagado con una
referencia simulada; al rechazar, el monto reservado vuelve al saldo real del usuario.

**Why this priority**: completa el flujo de retiros y la "aprobación de retiros sospechosos" que pide el proyecto.

**Independent Test**: con un retiro pendiente, aprobarlo y comprobar el estado "pagado" y el asiento; con otro,
rechazarlo y comprobar que el saldo se devuelve; aprobar dos veces el mismo y comprobar que no se paga dos veces.

**Acceptance Scenarios**:

1. **Given** un retiro pendiente, **When** el administrador lo aprueba con su código 2FA, **Then** queda "pagado"
   con una referencia simulada, el dinero sale definitivamente de la billetera y la acción queda auditada.
2. **Given** un retiro pendiente, **When** el administrador lo rechaza con un motivo, **Then** el monto reservado
   vuelve al saldo real del usuario, que ve el motivo.
3. **Given** un retiro ya aprobado o rechazado, **When** se intenta aprobar o rechazar otra vez, **Then** no cambia
   nada.
4. **Given** un operador o apostador, **When** intenta ver o resolver retiros, **Then** se rechaza.
5. **Given** un administrador, **When** intenta aprobar su propio retiro, **Then** se rechaza.

---

### User Story 9 - Administración de usuarios, roles y auditoría (Priority: P3)

El administrador busca usuarios, ve su estado, sus roles y su actividad, les asigna o quita los roles de operador y
administrador, y suspende o reactiva cuentas. También consulta el registro de auditoría filtrando por usuario,
acción y fecha.

**Why this priority**: necesario para operar el sistema (crear operadores) y para la trazabilidad, pero los primeros
usuarios con privilegios pueden crearse al preparar el entorno.

**Independent Test**: como administrador, dar el rol de operador a un apostador y comprobar que ya accede a las
pantallas de operador; suspender una cuenta y comprobar que su sesión deja de funcionar; filtrar la auditoría por
ese usuario y ver ambos cambios.

**Acceptance Scenarios**:

1. **Given** un administrador con 2FA activo, **When** asigna o quita un rol, **Then** el cambio aplica desde la
   siguiente renovación de sesión del usuario afectado (como máximo 15 minutos) y queda auditado con el rol
   anterior y el nuevo.
2. **Given** el único administrador activo, **When** intenta quitarse el rol de administrador o suspenderse,
   **Then** se rechaza.
3. **Given** una cuenta suspendida, **When** su dueño usa una sesión abierta, **Then** se rechaza de inmediato.
4. **Given** el registro de auditoría, **When** el administrador filtra por usuario, acción o rango de fechas,
   **Then** ve los eventos que coinciden, del más reciente al más antiguo.
5. **Given** un apostador con saldo o con un retiro pendiente, **When** el administrador intenta darle el rol de
   operador o administrador, **Then** se rechaza indicando que primero debe quedar sin saldo.
6. **Given** un operador o administrador, **When** intenta depositar o retirar, **Then** se rechaza por su rol.

---

### Edge Cases

- Dos registros simultáneos con el mismo correo: solo se crea una cuenta.
- El correo se compara sin distinguir mayúsculas y sin espacios alrededor.
- Un usuario cumple 18 años hoy: puede registrarse (la edad se calcula con la fecha del servidor).
- La credencial de renovación se usa a la vez desde dos pestañas: una gana y la otra recibe una sesión válida o
  debe volver a entrar, sin cerrar todas las sesiones por error.
- El reloj del dispositivo del usuario está desfasado: los códigos 2FA admiten una ventana de ±30 segundos.
- La pasarela no responde al confirmar: la intención queda pendiente y la página de regreso permite reintentar
  durante el plazo de confirmación; nunca se acredita sin respuesta positiva.
- La pasarela confirma como aprobado un pago de una intención ya caducada: se acredita si coincide en monto, moneda
  y referencia, porque el dinero sí se cobró; queda auditado.
- Un depósito con un monto con más de 2 decimales, negativo o cero: se rechaza.
- La misma referencia de pago se presenta para dos usuarios distintos: solo se acredita a la intención original.
- Un usuario suspendido con un retiro pendiente: el retiro sigue en revisión y el administrador decide.
- Un usuario desactiva su segundo factor con un retiro pendiente: el retiro no se ve afectado; para retiros nuevos
  vuelve a necesitarlo.
- Un débito de apuesta con saldo de bono cuando solo hay saldo real (o al revés): se rechaza por saldo insuficiente
  en ese tipo de saldo; nunca se mezclan.
- El servicio de reportes lee la base de datos: no puede ver contraseñas, secretos 2FA ni credenciales de sesión.

## Requirements *(mandatory)*

### Functional Requirements

#### Registro y verificación

- **FR-001**: El sistema DEBE permitir registrarse con nombre completo, correo, contraseña y fecha de nacimiento,
  con la declaración explícita de mayoría de edad y un CAPTCHA válido.
- **FR-002**: El sistema DEBE rechazar el registro de menores de 18 años, calculando la edad con la fecha del
  servidor.
- **FR-003**: Las contraseñas DEBEN tener al menos 12 caracteres, no figurar en una lista de contraseñas comunes y
  guardarse solo como hash con un algoritmo resistente a fuerza bruta; nunca en claro ni en registros.
- **FR-004**: El sistema DEBE enviar un enlace de verificación de un solo uso que caduca a las 24 horas, y permitir
  pedir uno nuevo como máximo 3 veces por hora.
- **FR-005**: El registro NO DEBE revelar si un correo ya tiene cuenta.
- **FR-006**: Un usuario sin correo verificado NO DEBE poder depositar, apostar ni retirar.
- **FR-007**: Toda cuenta nueva DEBE tener solo el rol apostador.

#### Sesión y acceso

- **FR-008**: El inicio de sesión DEBE exigir correo, contraseña, CAPTCHA válido y, si está activo, el código del
  segundo factor.
- **FR-009**: Los mensajes de error de inicio de sesión DEBEN ser genéricos y no distinguir entre correo
  inexistente y contraseña incorrecta.
- **FR-010**: Tras 5 intentos fallidos consecutivos (de contraseña o de segundo factor) la cuenta DEBE bloquearse 15
  minutos; el contador se reinicia con un inicio de sesión correcto.
- **FR-011**: El sistema DEBE limitar la frecuencia de intentos de registro, inicio de sesión y verificación por
  origen.
- **FR-012**: La credencial de acceso DEBE durar como máximo 15 minutos y viajar en un almacenamiento que los
  scripts de la página no puedan leer.
- **FR-013**: La sesión DEBE renovarse con una credencial de renovación de un solo uso que rota en cada renovación y
  caduca a los 7 días; reutilizar una ya usada DEBE cerrar todas las sesiones del usuario.
- **FR-014**: Cerrar sesión DEBE invalidar la credencial de renovación de ese dispositivo.
- **FR-015**: La sesión DEBE funcionar en el despliegue real, donde la aplicación web y la API están en dominios
  distintos, sin exponer la credencial a los scripts de la página.
- **FR-016**: La credencial de acceso DEBE poder verificarla el servicio de reportes sin poder emitirla, con las
  claims y el algoritmo del contrato 6.
- **FR-067**: El usuario DEBE poder recuperar una contraseña olvidada con un enlace al correo de un solo uso que
  caduca en 1 hora, pedido con CAPTCHA y sin revelar si el correo existe; fijar la contraseña nueva DEBE cerrar
  todas sus sesiones, quedar auditado y no omitir el segundo factor.

#### Segundo factor

- **FR-017**: El usuario DEBE poder activar un segundo factor con códigos temporales (TOTP), confirmándolo con un
  código válido antes de que quede activo.
- **FR-018**: Al activarlo, el sistema DEBE entregar 10 códigos de recuperación de un solo uso, mostrados una sola
  vez y guardados solo como hash.
- **FR-019**: Un código TOTP DEBE aceptarse una sola vez y con una tolerancia de ±30 segundos.
- **FR-020**: Desactivar el segundo factor DEBE exigir un código válido y quedar auditado.
- **FR-021**: El segundo factor DEBE ser obligatorio para solicitar retiros, para aprobar o rechazar retiros y para
  cambiar roles, y para iniciar sesión con los roles operador o administrador. Un usuario con alguno de esos roles
  y sin segundo factor activo DEBE quedar limitado a activarlo: ninguna otra acción le está permitida hasta
  completarlo.
- **FR-022**: El secreto del segundo factor NO DEBE guardarse en claro.

#### Roles y autorización

- **FR-023**: Los roles DEBEN ser apostador, operador y administrador; un usuario puede tener varios.
- **FR-024**: Toda acción DEBE exigir un usuario autenticado salvo las marcadas como públicas (salud, registro,
  inicio de sesión, renovación, verificación de correo, recuperación de contraseña y confirmación de la pasarela).
- **FR-025**: Una acción marcada con roles DEBE exigir al menos uno de ellos; los rechazos por permisos DEBEN
  quedar auditados.
- **FR-026**: El administrador DEBE poder asignar y quitar los roles operador y administrador y suspender o
  reactivar cuentas; NO DEBE poder quitarse el rol ni suspenderse si es el único administrador activo, ni asignar
  operador o administrador a un usuario con saldo distinto de cero o con retiros pendientes.
- **FR-027**: Suspender una cuenta DEBE invalidar de inmediato todas sus sesiones.
- **FR-028**: El primer administrador DEBE crearse con un procedimiento de preparación del entorno, no desde la
  interfaz pública.

#### Auditoría

- **FR-029**: El sistema DEBE registrar en una bitácora de solo inserción cada acción sensible con actor (o sistema),
  acción, entidad, identificador, fecha, IP y dispositivo.
- **FR-030**: Ningún usuario, rol ni proceso (incluida la propia aplicación) DEBE poder modificar o borrar eventos
  de auditoría.
- **FR-031**: Los eventos NO DEBEN incluir contraseñas, tokens, secretos 2FA, códigos de recuperación ni datos
  completos de pago.
- **FR-032**: La auditoría DEBE poder registrarse dentro de la misma operación que la acción auditada, para que una
  no exista sin la otra.
- **FR-033**: El administrador DEBE poder consultar la auditoría filtrando por usuario, acción y rango de fechas.

#### Billetera y libro contable

- **FR-034**: Todo movimiento de dinero DEBE registrarse como un asiento de doble entrada en el libro contable, con
  cuentas separadas para saldo real y saldo de bono de cada usuario y cuentas del sistema (casa, pasarela, retiros
  en tránsito).
- **FR-035**: El saldo DEBE calcularse a partir de los asientos; ningún proceso DEBE guardar ni modificar un saldo
  por separado.
- **FR-036**: Los asientos NO DEBEN modificarse ni borrarse; las correcciones DEBEN hacerse con asientos
  compensatorios.
- **FR-037**: Cada operación de dinero DEBE llevar una clave de idempotencia única; repetirla NO DEBE crear otro
  asiento y DEBE devolver el resultado original.
- **FR-038**: Las operaciones de dinero DEBEN poder ejecutarse dentro de la operación de quien llama (por ejemplo, la
  aceptación de una apuesta), de modo que si una parte falla no quede ninguna.
- **FR-039**: Las operaciones que descuentan saldo DEBEN serializarse por billetera para que operaciones simultáneas
  nunca dejen un saldo inexacto ni negativo, y rechazar el descuento si el saldo del tipo indicado no alcanza.
- **FR-040**: La billetera DEBE ofrecer a los demás specs: débito de apuesta, premio, reembolso, bono, conversión de
  bono a real, reversión de premio y consulta de saldos, con las firmas del contrato 2.
- **FR-041**: La reversión de premio DEBE ser la única operación que puede dejar un saldo negativo, con la clave de
  idempotencia `apuesta:<id>:reversion:r<n>` (`n` = número de corrección); las re-liquidaciones de premio usan
  `apuesta:<id>:premio:r<n>`. Mientras un saldo real sea negativo, el usuario NO DEBE poder retirar, y la consulta
  de saldos DEBE devolverlo tal cual para que el Spec 3 rechace apuestas nuevas.
- **FR-042**: Los montos DEBEN ser positivos, en dólares (USD), con 2 decimales exactos y sin errores de redondeo.
- **FR-043**: El apostador DEBE poder ver sus saldos real y de bono y sus movimientos paginados con fecha, tipo,
  monto y saldo resultante.
- **FR-044**: No DEBE existir ninguna acción, pantalla ni operación que permita fijar o editar un saldo
  directamente.

#### Depósitos

- **FR-068**: Depositar y retirar DEBE estar permitido solo a usuarios con el rol apostador que no tengan además el
  rol operador ni administrador.
- **FR-045**: El apostador verificado DEBE poder iniciar un depósito con un monto entre los límites configurados
  (por defecto, entre 1.00 y 1 000.00 USD) y, opcionalmente, un código de cupón.
- **FR-046**: Antes de ir a la pasarela, el sistema DEBE registrar la intención de pago con el usuario, el monto, la
  moneda y una referencia única.
- **FR-047**: Un depósito solo DEBE acreditarse cuando el servidor confirma la transacción directamente con la
  pasarela y verifica que el monto, la moneda y la referencia coinciden con la intención; el regreso del navegador
  nunca acredita por sí solo.
- **FR-048**: La confirmación DEBE ser idempotente: una transacción de la pasarela se acredita como máximo una vez.
- **FR-049**: Una confirmación que no coincide con la intención DEBE rechazarse y generar un evento de auditoría de
  posible fraude.
- **FR-050**: El sistema DEBE marcar como caducadas las intenciones pendientes sin confirmar a los 15 minutos (el
  formulario de la pasarela caduca a los 10 y un pago sin confirmar se revierte a los 5). Si una confirmación no
  coincide con la intención, además de rechazarla el sistema DEBE pedir el reverso del pago a la pasarela.
- **FR-051**: Al confirmarse un depósito, el sistema DEBE registrar el método de pago y el titular informados por la
  pasarela, y emitir el evento "depósito confirmado" después de completar la operación.
- **FR-052**: Las credenciales de la pasarela DEBEN vivir solo en el servidor.

#### Retiros

- **FR-053**: Solo un usuario verificado, con segundo factor activo y al menos un depósito confirmado DEBE poder
  solicitar un retiro, confirmándolo con un código válido.
- **FR-054**: El destino de un retiro DEBE elegirse entre los métodos y titulares de los depósitos confirmados del
  mismo usuario; no se acepta un destino escrito libremente.
- **FR-055**: El monto de un retiro DEBE estar entre los límites configurados y no superar el saldo real disponible;
  el saldo de bono no es retirable.
- **FR-056**: Al solicitar un retiro, el monto DEBE reservarse en el libro contable (de saldo real a retiros en
  tránsito) en la misma operación que registra la solicitud.
- **FR-057**: Un retiro sobre el umbral configurado (por defecto, 100.00 USD), o marcado por la evaluación de riesgo
  del Spec 4, DEBE quedar pendiente de revisión manual; si la evaluación de riesgo no está disponible, todo retiro
  sobre el umbral queda pendiente. Un retiro en o bajo el umbral y sin alertas DEBE aprobarse automáticamente y
  marcarse pagado con una referencia simulada en la misma operación.
- **FR-058**: El administrador DEBE poder aprobar (con referencia de pago simulada) o rechazar (con motivo) un retiro
  pendiente; aprobar mueve el dinero de tránsito a la pasarela y rechazar lo devuelve al saldo real.
- **FR-059**: Aprobar o rechazar un retiro DEBE ser idempotente y quedar auditado; un administrador NO DEBE resolver
  sus propios retiros.
- **FR-060**: Al solicitarse un retiro, el sistema DEBE emitir el evento "retiro solicitado" después de completar la
  operación.

#### Interfaz

- **FR-061**: La aplicación web DEBE ofrecer pantallas de registro, verificación de correo, inicio de sesión,
  recuperación de contraseña, segundo factor, billetera (saldos y movimientos), depósito, retiro, administración de usuarios y auditoría, y
  revisión de retiros.
- **FR-062**: Las pantallas DEBEN ser usables desde 360 px de ancho, cumplir WCAG 2.1 AA y nombrar las acciones por
  lo que hacen ("Crear cuenta", "Depositar", "Solicitar retiro").
- **FR-063**: La aplicación web NO DEBE calcular saldos ni decidir la acreditación; solo muestra lo que informa el
  servidor.

#### Datos para otros specs

- **FR-064**: Las credenciales de los usuarios (hash de contraseña, secretos y códigos 2FA, credenciales de
  renovación) NO DEBEN ser legibles por el servicio de reportes.
- **FR-065**: Los datos que lee el servicio de reportes (usuarios, movimientos, depósitos, retiros) DEBEN guardar
  los montos con 2 decimales y las fechas en UTC, con nombres estables (contrato 7).
- **FR-066**: Al registrarse un usuario, el sistema DEBE emitir el evento "usuario registrado" con su IP y
  dispositivo después de completar el registro.

### Vectores de fraude y abuso

| Vector | Mitigación | Prueba obligatoria |
|--------|-----------|--------------------|
| Doble gasto por concurrencia | Serialización por billetera (FR-039) | N débitos simultáneos dejan el saldo exacto y nunca negativo |
| Doble acreditación de un depósito | Idempotencia por transacción y por clave (FR-037, FR-048) | Confirmar dos veces el mismo pago acredita una vez |
| Depósito manipulado | Verificación de monto, moneda y referencia (FR-047, FR-049) | Monto, moneda o referencia distintos se rechazan |
| Acreditar por el regreso del navegador | Solo acredita la confirmación servidor a servidor (FR-047) | Volver sin pagar no cambia el saldo |
| Retiro sin 2FA o a otro titular | 2FA obligatorio y destino restringido (FR-053, FR-054) | Ambos se rechazan |
| Retiro de bono o de saldo negativo | Solo saldo real disponible (FR-041, FR-055) | Se rechaza |
| Fuerza bruta y relleno de credenciales | Bloqueo, límite de frecuencia y CAPTCHA (FR-008, FR-010, FR-011) | Tras 5 fallos la cuenta se bloquea |
| Enumeración de cuentas | Respuestas genéricas (FR-005, FR-009, FR-067) | Mismo mensaje con correo existente o no, en registro, inicio de sesión y recuperación |
| Secuestro por recuperación de contraseña | Enlace de un solo uso y corta duración, cierre de sesiones y 2FA intacto (FR-067) | Un enlace usado o caducado no sirve; tras recuperar, el 2FA se sigue pidiendo |
| Robo de sesión | Credencial no legible por scripts, rotación y detección de reutilización (FR-012, FR-013) | Reusar la credencial de renovación cierra todas las sesiones |
| Escalada de rol | Denegación por defecto y roles por acción (FR-024, FR-025) | Un apostador no llama rutas de operador ni de administrador, endpoint por endpoint |
| Autoaprobación de retiros | Separación de funciones (FR-059, FR-068) | Un administrador no aprueba su propio retiro ni deposita o retira |
| Personal con privilegios que mueve dinero | Solo apostadores depositan y retiran; no se promueve a quien tiene saldo (FR-026, FR-068) | Operador y administrador no depositan ni retiran |
| Edición del libro contable o de la auditoría | Solo inserción (FR-030, FR-036, FR-044) | No existe ruta ni operación que actualice o borre |
| Fuga de credenciales por reportes | Credenciales fuera del alcance de reportes (FR-064) | El usuario de reportes no puede leerlas |
| Cuentas falsas y menores | Verificación de correo, mayoría de edad y CAPTCHA (FR-001, FR-002, FR-006) | Sin verificar no se deposita |

### Key Entities *(include if feature involves data)*

- **Usuario**: persona con cuenta; nombre completo, correo único, fecha de nacimiento, estado (pendiente de
  verificación, activo, suspendido), roles, intentos fallidos y bloqueo temporal.
- **Sesión**: credencial de renovación de un dispositivo; familia de rotación, caducidad, revocación, IP y
  dispositivo.
- **Enlace de correo**: verificación de correo o recuperación de contraseña; un solo uso, con caducidad y guardado
  solo como hash.
- **Segundo factor**: secreto protegido, fecha de activación, último código usado y códigos de recuperación (hash).
- **Evento de auditoría**: actor, acción, entidad, identificador, datos no sensibles, IP, dispositivo y fecha; solo
  inserción.
- **Cuenta contable**: cuenta del libro (real o bono de un usuario, casa, pasarela, retiros en tránsito).
- **Asiento**: movimiento de doble entrada con tipo (depósito, apuesta, premio, reembolso, bono, conversión,
  reversión, retiro), clave de idempotencia única, referencia a su origen y líneas que suman cero.
- **Intención de pago / depósito**: usuario, monto, moneda, referencia única, código de cupón opcional, estado
  (pendiente, confirmado, fallido, caducado, rechazado por discrepancia), identificador de la pasarela, método y
  titular.
- **Método de retiro**: método y titular informados por la pasarela en un depósito confirmado del usuario.
- **Retiro**: usuario, monto, método de destino, estado (solicitado, pendiente de revisión, pagado, rechazado),
  motivos de revisión, administrador que resolvió, referencia simulada y comentario.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un visitante completa el registro y la verificación de correo en menos de 3 minutos.
- **SC-002**: En una prueba con 50 débitos simultáneos sobre la misma billetera, el saldo final coincide al centavo
  con el esperado y nunca es negativo, en el 100 % de las ejecuciones.
- **SC-003**: Repetir 10 veces la confirmación del mismo depósito acredita exactamente una vez.
- **SC-004**: El saldo se acredita en 10 segundos o menos desde que el usuario vuelve de la pasarela con el pago
  aprobado.
- **SC-005**: El 100 % de las acciones protegidas rechaza a los usuarios sin el rol requerido, verificado con una
  prueba por acción y por rol.
- **SC-006**: Tras 5 intentos fallidos, el 100 % de los intentos siguientes se rechaza durante 15 minutos.
- **SC-007**: Ninguna prueba de abuso de la tabla de vectores de fraude logra su objetivo.
- **SC-008**: La suma de todos los asientos del libro contable es siempre cero y el saldo de cada usuario coincide
  con la suma de sus asientos.
- **SC-009**: Todas las pantallas del spec son usables sin desplazamiento horizontal desde 360 px y pasan una
  revisión automática de accesibilidad sin errores graves.
- **SC-010**: Un apostador completa un depósito de punta a punta en el sandbox en menos de 2 minutos.

## Assumptions

- Moneda única: dólares estadounidenses (USD), que es la moneda de la pasarela en Ecuador.
- El correo de desarrollo se captura con un buzón local de pruebas; en staging se usa un servicio de correo
  transaccional con plan gratuito.
- El CAPTCHA usa claves de prueba en desarrollo y en las pruebas automáticas.
- El sandbox de la pasarela no permite pagos salientes: todos los retiros se pagan con una referencia simulada,
  registrados igual en el libro contable.
- Los límites (depósito, retiro, umbral, intentos, caducidades) son configurables por variables de entorno con los
  valores por defecto indicados.
- La reversión de premio con saldo negativo responde a la aclaración del Spec 3 (2026-11-14), aceptada en la sesión
  de aclaraciones de este spec, y se agrega al contrato 2 en el PR 2, con Daniel como revisor.
- Mientras el Spec 4 no esté integrado, la evaluación de riesgo de retiros no está disponible y se aplica FR-057.
- Plan de entregas: PR 1 (historias 1, 2, 3, 6 y 9: identidad, roles, auditoría, 2FA y usuarios), PR 2 (historias 4 y
  5: libro contable, billetera y depósitos) y PR 3 (historias 7 y 8: retiros).
