# Feature Specification: Fundaciones del stack tecnológico

**Feature Branch**: `feature/spec-1`
**Created**: 2026-11-14
**Status**: Draft
**Responsable**: Erick Rodas (líder del equipo)
**Input**: User description: "Spec 1: configurar e inicializar el stack tecnológico base del monorepo (las tres aplicaciones, base de datos, caché, calidad, CI/CD y despliegue) para que el resto del equipo pueda clonar el repositorio y desarrollar sus specs en paralelo."

## Contexto

Este spec corresponde a la fase F0 de [`PLAN.md`](../../PLAN.md) y a la spec `001` del catálogo original. No entrega
funcionalidad de apuestas: entrega la base sobre la que se construyen los specs 2, 3 y 4 del equipo
(ver [`specs/README.md`](../README.md)). Los "usuarios" de este spec son los integrantes del equipo y el docente
que revisa el repositorio.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Arranque local reproducible (Priority: P1)

Un integrante del equipo clona el repositorio en su computadora y, siguiendo una guía corta, levanta los tres
componentes del sistema (interfaz web, API principal y servicio de reportes) junto con la base de datos y la caché.
Cada componente expone una comprobación de salud que confirma que está vivo y que alcanza sus dependencias.

**Why this priority**: sin esto nadie del equipo puede empezar su spec; es el bloqueo de todo el proyecto.

**Independent Test**: en una máquina limpia, seguir `quickstart.md` y comprobar que la interfaz web muestra el estado
"operativo" de la API y del servicio de reportes, y que cada comprobación de salud responde.

**Acceptance Scenarios**:

1. **Given** un repositorio recién clonado y las herramientas base instaladas, **When** el integrante ejecuta los
   pasos de la guía, **Then** los tres componentes quedan en ejecución y la página de estado los muestra operativos.
2. **Given** la API en ejecución, **When** se consulta su comprobación de salud, **Then** responde que la base de
   datos y la caché están disponibles.
3. **Given** la base de datos detenida, **When** se consulta la comprobación de salud de la API, **Then** responde
   "no disponible" indicando qué dependencia falla, sin exponer credenciales ni trazas internas.
4. **Given** falta una variable de configuración obligatoria, **When** se inicia un componente, **Then** se detiene
   de inmediato con un mensaje que nombra la variable que falta.

---

### User Story 2 - Compuerta de calidad en cada Pull Request (Priority: P1)

Cada vez que un integrante abre o actualiza un Pull Request hacia `develop` o `main`, el sistema de integración
continua ejecuta automáticamente el análisis de estilo, la verificación de tipos y las pruebas de los tres
componentes, y valida el formato de los mensajes de commit. Si algo falla, el PR no se puede integrar.

**Why this priority**: la constitución exige que nada entre a `develop` ni a `main` sin PR revisado y en verde; el
trabajo en paralelo de tres personas sin esta compuerta rompe la rama de integración.

**Independent Test**: abrir un PR con una prueba que falla y comprobar que queda bloqueado; corregirla y comprobar
que queda habilitado.

**Acceptance Scenarios**:

1. **Given** un PR hacia `develop`, **When** se publica, **Then** se ejecutan estilo, tipos y pruebas de las tres
   aplicaciones y su resultado aparece en el PR.
2. **Given** un PR con una prueba en rojo o un commit que no sigue Conventional Commits, **When** termina la
   compuerta, **Then** el PR queda bloqueado para integrarse.
3. **Given** un integrante que intenta hacer push directo a `develop` o `main`, **When** lo intenta, **Then** el
   repositorio lo rechaza y exige un PR.
4. **Given** un commit local con un mensaje que no sigue el formato, **When** el integrante confirma el commit,
   **Then** se rechaza en su máquina antes de llegar al repositorio.

---

### User Story 3 - Despliegue automático por rama (Priority: P2)

Cuando un cambio se integra en `develop`, el sistema se despliega en el entorno de pruebas (staging); cuando se
integra en `main`, se despliega en producción. El despliegue solo ocurre si la compuerta de calidad pasó.

**Why this priority**: permite demostrar avances al docente en un entorno público, pero el equipo puede trabajar
localmente mientras se configura.

**Independent Test**: integrar un cambio trivial en `develop` y comprobar que la versión de staging muestra el
cambio y que su comprobación de salud responde.

**Acceptance Scenarios**:

1. **Given** un PR integrado en `develop` con la compuerta en verde, **When** termina la integración continua,
   **Then** se solicita el despliegue de staging de los tres componentes.
2. **Given** la compuerta en rojo, **When** termina la integración continua, **Then** no se despliega nada.
3. **Given** que aún no se configuraron las credenciales de despliegue, **When** corre la integración continua,
   **Then** el paso de despliegue se omite con un aviso y no hace fallar la compuerta.

---

### User Story 4 - Base para el trabajo en paralelo del equipo (Priority: P2)

Los integrantes encuentran en el repositorio el reparto de specs, qué le toca a cada uno, los contratos entre
specs (qué provee cada uno y qué consume de los demás), plantillas de PR e issues, y una guía de contribución con
Git Flow y convenciones. El servicio de reportes accede a los datos con credenciales de solo lectura desde el
primer día.

**Why this priority**: evita que dos personas implementen lo mismo o que un spec quede bloqueado esperando a otro.

**Independent Test**: un integrante nuevo puede responder, solo leyendo el repositorio, qué spec le toca, en qué
rama trabaja, de qué contratos depende y cómo abre su PR.

**Acceptance Scenarios**:

1. **Given** el repositorio, **When** un integrante abre el catálogo de specs, **Then** encuentra su spec, su rama
   `feature/spec-X`, su alcance y su estado.
2. **Given** dos specs que dependen entre sí, **When** se consulta el documento de contratos, **Then** queda claro
   qué interfaz provee cada uno y cuál consume, con sus firmas.
3. **Given** las credenciales del servicio de reportes, **When** se intenta escribir en cualquier tabla, **Then** la
   base de datos lo rechaza.

---

### User Story 5 - Trazabilidad y análisis estático (Priority: P3)

El equipo y el docente ven la calidad del código (análisis estático con compuerta) y métricas del proceso de
desarrollo (commits, PRs, tiempos de revisión, despliegues).

**Why this priority**: lo exige el plan, pero depende de cuentas externas que se crean manualmente y no bloquea el
desarrollo.

**Independent Test**: tras configurar las cuentas, un PR muestra el resultado del análisis estático y el tablero
muestra la actividad del repositorio.

**Acceptance Scenarios**:

1. **Given** la cuenta de análisis estático configurada, **When** se abre un PR, **Then** el análisis se ejecuta y
   su compuerta bloquea el PR si encuentra problemas críticos.
2. **Given** la cuenta de análisis estático sin configurar, **When** se abre un PR, **Then** el paso se omite con un
   aviso.
3. **Given** el tablero de trazabilidad configurado según la guía, **When** el equipo lo abre, **Then** ve commits,
   PRs y despliegues del repositorio.

### Edge Cases

- Un puerto local ya está ocupado: la guía indica cómo cambiarlo por variable de entorno sin tocar código.
- La caché no está disponible pero la base de datos sí: la salud de la API se reporta como "no disponible" y nombra
  la caché.
- Un integrante trabaja en Windows y otro en Linux/macOS: los comandos de la guía funcionan en ambos (PowerShell y
  bash).
- Dos specs agregan migraciones de base de datos en paralelo: la guía de contribución define cómo reordenarlas al
  actualizar la rama.
- Alguien sube por error un archivo de secretos: el repositorio lo ignora por defecto y solo se versiona la plantilla
  de ejemplo.

## Requirements *(mandatory)*

### Functional Requirements

**Estructura y arranque**

- **FR-001**: El repositorio MUST contener exactamente tres aplicaciones (interfaz web, API principal y servicio de
  reportes) más paquetes compartidos, organizados como un monorepo con un único punto de instalación.
- **FR-002**: El repositorio MUST proveer la base de datos relacional y la caché para desarrollo local con un solo
  comando.
- **FR-003**: Cada aplicación MUST arrancar en modo desarrollo con un único comando desde la raíz.
- **FR-004**: La API y el servicio de reportes MUST exponer una comprobación de salud pública que indique el estado
  de cada dependencia (base de datos y, en la API, caché) y responda "no disponible" si alguna falla.
- **FR-005**: La comprobación de salud MUST NOT exponer credenciales, cadenas de conexión ni trazas internas.
- **FR-006**: La interfaz web MUST mostrar una página de estado del sistema que consulte, desde el servidor, la salud
  de la API y del servicio de reportes.
- **FR-007**: Cada aplicación MUST validar su configuración al iniciar y detenerse con un mensaje claro si falta o es
  inválida una variable obligatoria.

**Seguridad base**

- **FR-008**: Los secretos MUST vivir solo en variables de entorno; el repositorio MUST incluir plantillas
  `.env.example` sin valores reales e ignorar los archivos `.env`.
- **FR-009**: El servicio de reportes MUST conectarse a la base de datos con un usuario de solo lectura, distinto
  del usuario de la API.
- **FR-010**: La API MUST aplicar cabeceras de seguridad HTTP, limitar el origen de las peticiones del navegador a
  la interfaz web configurada y aplicar un límite de peticiones por cliente por defecto.
- **FR-011**: Ante rutas inexistentes o errores no controlados, la API MUST responder con un formato de error
  uniforme (código y mensaje) y sin trazas internas.

**Calidad y flujo de trabajo**

- **FR-012**: El repositorio MUST definir análisis de estilo, formato y verificación de tipos para el código
  TypeScript y Python, ejecutables desde la raíz.
- **FR-013**: El repositorio MUST definir pruebas automatizadas para las tres aplicaciones, ejecutables desde la raíz,
  con reporte de cobertura.
- **FR-014**: Los mensajes de commit MUST validarse localmente contra Conventional Commits antes de crear el commit.
- **FR-015**: La integración continua MUST ejecutar estilo, tipos, pruebas (incluidas las de integración contra una
  base de datos y caché reales) y validación de commits en cada PR hacia `develop` y `main`.
- **FR-016**: Las ramas `develop` y `main` MUST estar protegidas: sin push directo, con PR obligatorio y la compuerta
  de calidad como requisito.
- **FR-017**: La integración continua MUST ejecutar el análisis estático con compuerta bloqueante cuando sus
  credenciales estén configuradas, y omitirlo con un aviso si no lo están.

**Despliegue y trazabilidad**

- **FR-018**: Una integración en `develop` con la compuerta en verde MUST disparar el despliegue de staging; una en
  `main`, el de producción. Sin credenciales configuradas, el paso se omite con un aviso.
- **FR-019**: El repositorio MUST incluir la definición de infraestructura de despliegue de la API, el servicio de
  reportes, la base de datos y la caché, y la configuración del despliegue de la interfaz web.
- **FR-020**: El repositorio MUST documentar cómo conectar el tablero de trazabilidad del equipo al repositorio.

**Colaboración**

- **FR-021**: El repositorio MUST incluir el catálogo de specs del equipo (4 specs para 3 integrantes), con
  responsable, rama, alcance y estado de cada una.
- **FR-022**: El repositorio MUST documentar los contratos entre specs y declarar en código las interfaces
  compartidas (sin implementación) para que los specs 2, 3 y 4 trabajen en paralelo.
- **FR-023**: El repositorio MUST incluir plantillas de PR e issues y una guía de contribución con Git Flow, ramas
  `feature/spec-X`, Conventional Commits y el flujo de Spec Kit.

### Key Entities

- **Aplicación**: cada uno de los tres componentes desplegables (web, API, reportes), con su configuración, sus
  comandos y su comprobación de salud.
- **Estado de salud**: resultado de comprobar un componente: estado general (operativo / no disponible), versión y
  estado de cada dependencia.
- **Entorno**: local, staging (`develop`) o producción (`main`), cada uno con su propia configuración y secretos.
- **Spec del equipo**: unidad de trabajo asignada a un integrante, con rama, alcance, contratos que provee y
  contratos que consume.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un integrante que sigue la guía pasa de "repositorio recién clonado" a "tres componentes en ejecución"
  en 15 minutos o menos (sin contar descargas).
- **SC-002**: La compuerta de calidad entrega su resultado en el PR en 10 minutos o menos.
- **SC-003**: El 100 % de los cambios que llegan a `develop` y `main` pasan por un PR con la compuerta en verde.
- **SC-004**: Cero secretos reales versionados en el repositorio.
- **SC-005**: Ante la caída de una dependencia, la comprobación de salud lo refleja en 5 segundos o menos.
- **SC-006**: El 100 % de los intentos de escritura con las credenciales del servicio de reportes son rechazados.
- **SC-007**: Cada integrante puede identificar su spec, su rama y sus dependencias leyendo solo el repositorio.

## Assumptions

- El stack está fijado por la constitución y `PLAN.md`; este spec no lo reabre.
- Las cuentas de despliegue, análisis estático y trazabilidad las crea el líder manualmente con planes gratuitos;
  el repositorio deja todo listo para conectarlas y los pasos que dependen de ellas se omiten mientras no existan.
- El plan gratuito de la plataforma de despliegue permite una sola base de datos gratuita; por eso la definición de
  infraestructura versionada cubre staging, y producción se documenta como réplica con la rama `main`.
- Todos los integrantes tienen Node.js 22 o superior, pnpm, Python 3.12, uv, Git y Docker.
- Las interfaces compartidas se declaran sin implementación; cada spec dueño las implementa y sus consumidores
  pueden usar dobles de prueba mientras tanto.
