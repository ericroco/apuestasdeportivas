## Spec

- Spec: <!-- p. ej. Spec 2: identidad, billetera y pagos -->
- Carpeta: <!-- specs/002-identidad-billetera-pagos -->
- Tareas de `tasks.md` cubiertas: <!-- T001–T014 -->

## Qué cambia y por qué

<!-- Dos o tres frases. Enlaza la historia de usuario del spec. -->

## Constitución

- [ ] **I. Seguridad**: vectores de fraude del spec mitigados; RBAC en cada endpoint nuevo; acciones sensibles auditadas; sin secretos en el código.
- [ ] **II. Dinero**: solo vía ledger; transacción con bloqueo de fila; operaciones idempotentes. <!-- N/A si no toca dinero -->
- [ ] **III. Servidor**: ningún valor del cliente se acepta sin revalidar.
- [ ] **IV. Pruebas primero**: escritas antes de implementar (rojo → verde); concurrencia, idempotencia y abuso si aplica.
- [ ] **V. Tiempo real**: objetivo ≤ 5 s y cola persistente. <!-- N/A si no aplica -->
- [ ] **VI. Simplicidad**: sin servicios nuevos; complejidad extra justificada en el plan.
- [ ] **VII. UX**: 360 px, WCAG 2.1 AA, skill `frontend-design`. <!-- N/A si no hay UI -->

## Contratos entre specs

- [ ] No cambia ninguna firma de `apps/api/src/contracts/` (o el dueño del otro spec está como revisor).

## Cómo probarlo

<!-- Comandos o pasos. Capturas a 360 px y escritorio si hay UI. -->
