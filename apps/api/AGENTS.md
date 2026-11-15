# AGENTS.md (apps/api)

Lee primero `CLAUDE.md` y `.specify/memory/constitution.md` en la raíz del repo.

## NestJS 12

La versión de NestJS de esta app probablemente es más nueva que la que conoces. https://docs.nestjs.com/llms.txt
indexa la documentación con una página markdown por capítulo.

- Los paquetes de Nest son solo ESM y este proyecto también: los imports relativos terminan en `.js`, no existe
  `__dirname` (usa `import.meta.dirname`) y las pruebas corren en Vitest (`vi.fn()`, no `jest.fn()`).
- Validación de entrada: zod con `StandardSchemaValidationPipe` (`@Body({ schema })`) y objetos `.strict()`.
- Antes de agregar una librería, revisa los paquetes oficiales: `@nestjs/throttler`, `@nestjs/bullmq`,
  `@nestjs/schedule`, `@nestjs/websockets`, `@nestjs/idempotency`, `@nestjs/webhooks`, `@nestjs/locks`.

## Contratos entre specs

`src/contracts/` declara los puertos que un spec provee y otro consume (ver `docs/equipo/contratos.md`). No cambies
una firma sin acordarlo con el dueño del otro spec en su PR.
