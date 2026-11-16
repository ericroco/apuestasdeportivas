# Contrato de tiempo real (Socket.IO)

Gateway en `apps/api`, espacio de nombres `/tiempo-real`, con CORS limitado a `WEB_ORIGIN`. La web lo alcanza en
`NEXT_PUBLIC_WS_URL`. Payloads tipados en `packages/shared/src/partidos.ts`; montos como texto decimal.

## Conexión

1. La web pide `POST /api/tiempo-real/ticket` (ruta autenticada).
2. La API guarda en Redis `ws:ticket:<valor aleatorio de 32 bytes>` → `usuarioId`, con caducidad de 60 s.
3. El navegador se conecta con `io(NEXT_PUBLIC_WS_URL + '/tiempo-real', { auth: { ticket } })`.
4. El gateway consume el ticket con `GETDEL` (un solo uso). Si no existe o caducó, rechaza la conexión con
   `connect_error` `TICKET_INVALIDO`. Al aceptar, une el socket a `usuario:<usuarioId>`.
5. Al reconectar, la web pide un ticket nuevo.

## Mensajes del cliente

| Evento | Payload | Efecto |
|--------|---------|--------|
| `partido.seguir` | `{ partidoId }` | une el socket a `partido:<partidoId>` (máx. 20 partidos por socket) |
| `partido.dejar` | `{ partidoId }` | sale de la sala |

El cliente no puede unirse a la sala de otro usuario: `usuario:<id>` solo se asigna en el paso 4.

## Mensajes del servidor

| Evento | Sala | Payload |
|--------|------|---------|
| `partido.actualizado` | `partido:<id>` | `{ partidoId, estado, golesLocal, golesVisitante, minuto, version }` |
| `mercado.actualizado` | `partido:<id>` | `{ partidoId, mercadoId, estado, selecciones: [{ id, cuota }] }` |
| `apuesta.liquidada` | `usuario:<id>` | `{ apuestaId, estado, premio, liquidadaEn }` |
| `apuesta.vivo_resuelta` | `usuario:<id>` | `{ solicitudId, estado: 'ACEPTADA' \| 'RECHAZADA', apuestaId?, motivo? }` |

Cada mensaje del servidor lleva `emitidoEn` (ISO UTC) para medir la latencia de SC-001 desde la detección.
Los mensajes se emiten solo después del commit de la transacción que los origina.
