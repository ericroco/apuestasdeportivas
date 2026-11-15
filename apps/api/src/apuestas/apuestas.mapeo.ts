import type { ApuestaDto } from '@apuestas/shared';
import { aTexto } from '../comun/decimal.js';
import type { Prisma } from '../generated/prisma/client.js';

export const INCLUIR_SELECCIONES = {
  selecciones: { orderBy: { id: 'asc' } },
} as const satisfies Prisma.ApuestaInclude;

type ApuestaConSelecciones = Prisma.ApuestaGetPayload<{ include: typeof INCLUIR_SELECCIONES }>;

export function aApuestaDto(apuesta: ApuestaConSelecciones): ApuestaDto {
  return {
    id: apuesta.id,
    tipo: apuesta.tipo,
    monto: aTexto(apuesta.monto),
    tipoSaldo: apuesta.tipoSaldo,
    cuotaTotal: aTexto(apuesta.cuotaTotal),
    gananciaPotencial: aTexto(apuesta.gananciaPotencial),
    estado: apuesta.estado,
    premioPagado: aTexto(apuesta.premioPagado),
    enVivo: apuesta.enVivo,
    aceptadaEn: apuesta.aceptadaEn.toISOString(),
    liquidadaEn: apuesta.liquidadaEn?.toISOString() ?? null,
    selecciones: apuesta.selecciones.map((seleccion) => ({
      id: seleccion.id,
      seleccionId: seleccion.seleccionId,
      partidoId: seleccion.partidoId,
      cuotaCongelada: aTexto(seleccion.cuotaCongelada),
      resultado: seleccion.resultado,
    })),
  };
}
