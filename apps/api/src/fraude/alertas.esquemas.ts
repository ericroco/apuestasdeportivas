import { z } from 'zod';
import { camposDePaginacion, filtroOpcional } from '../comun/consultas.js';

export const REGLAS_FRAUDE = [
  'CUENTAS_DISPOSITIVO',
  'CUENTAS_IP',
  'METODO_PAGO_COMPARTIDO',
  'CUPON_CUENTA_MULTIPLE',
  'APUESTA_MONTO_ANOMALO',
  'RAFAGA_APUESTAS',
  'RETIRO_TRAS_DEPOSITO',
] as const;
export const SEVERIDADES = ['MEDIA', 'ALTA'] as const;
export const ESTADOS_ALERTA = ['ABIERTA', 'CONFIRMADA', 'DESCARTADA'] as const;
export const RESOLUCIONES = ['CONFIRMADA', 'DESCARTADA'] as const;

const fechaIso = z.iso
  .datetime({ offset: true, message: 'debe ser una fecha ISO 8601, como "2026-12-01T00:00:00Z"' })
  .transform((valor) => new Date(valor));

export const esquemaFiltrosAlertas = z
  .strictObject({
    estado: filtroOpcional(z.enum(ESTADOS_ALERTA)),
    severidad: filtroOpcional(z.enum(SEVERIDADES)),
    regla: filtroOpcional(z.enum(REGLAS_FRAUDE)),
    usuarioId: filtroOpcional(z.string().min(1).max(100)),
    desde: filtroOpcional(fechaIso),
    hasta: filtroOpcional(fechaIso),
    ...camposDePaginacion,
  })
  .refine((filtros) => !filtros.desde || !filtros.hasta || filtros.desde <= filtros.hasta, {
    message: 'desde no puede ser posterior a hasta',
    path: ['desde'],
  });

/** Resolución humana: estado final y nota obligatoria de 5 a 500 caracteres. */
export const esquemaResolverAlerta = z.strictObject({
  estado: z.enum(RESOLUCIONES),
  nota: z.string().trim().min(5).max(500),
});

export const esquemaIdAlerta = z.uuid('debe ser un identificador válido');

export type FiltrosAlertas = z.output<typeof esquemaFiltrosAlertas>;
export type ResolverAlerta = z.output<typeof esquemaResolverAlerta>;
