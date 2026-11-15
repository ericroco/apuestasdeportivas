import { HttpStatus } from '@nestjs/common';
import { ErrorNegocio } from '../comun/error-negocio.js';
import { crearErrorDeValidacion } from '../comun/validacion.js';
import { Prisma, type Cupon } from '../generated/prisma/client.js';
import { esquemaCrearCupon, type ActualizarCupon } from './cupones.esquemas.js';

/** Acciones de auditoría de un cambio de cupón (FR-036). */
export type AccionCupon = 'cupon.actualizado' | 'cupon.pausado' | 'cupon.reactivado';

const CAMPOS_DEL_TIPO = [
  'porcentaje',
  'montoFijo',
  'topeBono',
  'depositoMinimo',
  'apuestaMaxima',
] as const;

/** Con canjes, el tipo, el valor, las condiciones, el inicio y el límite por usuario son inmutables (FR-003). */
const INMUTABLES_CON_CANJES: readonly string[] = [
  'tipo',
  ...CAMPOS_DEL_TIPO,
  'iniciaEn',
  'limitePorUsuario',
];

type CampoDelTipo = (typeof CAMPOS_DEL_TIPO)[number];

type Configuracion = Pick<
  Cupon,
  | 'codigo'
  | 'tipo'
  | CampoDelTipo
  | 'iniciaEn'
  | 'terminaEn'
  | 'cupoTotal'
  | 'limitePorUsuario'
  | 'estado'
>;

type CampoConfigurable = Exclude<keyof Configuracion, 'codigo'>;

const CAMPOS_CONFIGURABLES: readonly CampoConfigurable[] = [
  'tipo',
  ...CAMPOS_DEL_TIPO,
  'iniciaEn',
  'terminaEn',
  'cupoTotal',
  'limitePorUsuario',
  'estado',
];

export interface PlanDeCambios {
  readonly datos: Partial<Configuracion>;
  readonly acciones: readonly AccionCupon[];
  readonly antes: Readonly<Record<string, unknown>>;
  readonly despues: Readonly<Record<string, unknown>>;
}

type Valor = Configuracion[CampoConfigurable];

function iguales(a: Valor, b: Valor): boolean {
  if (Prisma.Decimal.isDecimal(a) && Prisma.Decimal.isDecimal(b)) return a.eq(b);
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

/** Valor serializable para la auditoría y la validación. */
function serializar(valor: Valor): unknown {
  if (Prisma.Decimal.isDecimal(valor)) return valor.toFixed(2);
  if (valor instanceof Date) return valor.toISOString();
  return valor;
}

/** Si cambia el tipo, los campos del tipo anterior que no se reenvían quedan nulos. */
function fusionar(actual: Cupon, cambios: ActualizarCupon): Configuracion {
  const cambiaTipo = cambios.tipo !== undefined && cambios.tipo !== actual.tipo;
  const campo = (nombre: CampoDelTipo) => cambios[nombre] ?? (cambiaTipo ? null : actual[nombre]);
  return {
    codigo: actual.codigo,
    tipo: cambios.tipo ?? actual.tipo,
    porcentaje: campo('porcentaje'),
    montoFijo: campo('montoFijo'),
    topeBono: campo('topeBono'),
    depositoMinimo: campo('depositoMinimo'),
    apuestaMaxima: campo('apuestaMaxima'),
    iniciaEn: cambios.iniciaEn ?? actual.iniciaEn,
    terminaEn: cambios.terminaEn ?? actual.terminaEn,
    cupoTotal: cambios.cupoTotal ?? actual.cupoTotal,
    limitePorUsuario: cambios.limitePorUsuario ?? actual.limitePorUsuario,
    estado: cambios.estado ?? actual.estado,
  };
}

function verificarPermitidos(actual: Cupon, fusion: Configuracion, campos: string[]): void {
  if (actual.canjes > 0 && campos.some((campo) => INMUTABLES_CON_CANJES.includes(campo))) {
    throw new ErrorNegocio(
      'CUPON_CON_CANJES',
      HttpStatus.CONFLICT,
      'El cupón ya tiene canjes: solo puedes pausarlo, reactivarlo, extender su vigencia o ampliar su cupo.',
    );
  }
  if (fusion.terminaEn < actual.terminaEn || fusion.cupoTotal < actual.cupoTotal) {
    throw new ErrorNegocio(
      'CAMBIO_NO_PERMITIDO',
      HttpStatus.CONFLICT,
      'La vigencia solo se puede extender y el cupo solo se puede ampliar.',
    );
  }
}

/** Reutiliza el esquema de creación para validar la configuración resultante según su tipo. */
function validarConfiguracion(fusion: Configuracion): void {
  const camposDelTipo = CAMPOS_DEL_TIPO.filter((campo) => fusion[campo] !== null).map((campo) => [
    campo,
    serializar(fusion[campo]),
  ]);
  const resultado = esquemaCrearCupon.safeParse({
    codigo: fusion.codigo,
    tipo: fusion.tipo,
    iniciaEn: fusion.iniciaEn.toISOString(),
    terminaEn: fusion.terminaEn.toISOString(),
    cupoTotal: fusion.cupoTotal,
    limitePorUsuario: fusion.limitePorUsuario,
    ...Object.fromEntries(camposDelTipo),
  });
  if (!resultado.success) throw crearErrorDeValidacion(resultado.error.issues);
}

function accionesDe(campos: readonly CampoConfigurable[], fusion: Configuracion): AccionCupon[] {
  const acciones: AccionCupon[] = [];
  if (campos.some((campo) => campo !== 'estado')) acciones.push('cupon.actualizado');
  if (campos.includes('estado')) {
    acciones.push(fusion.estado === 'PAUSADO' ? 'cupon.pausado' : 'cupon.reactivado');
  }
  return acciones;
}

/**
 * Decide qué cambia de un cupón y qué se audita, o lanza el `ErrorNegocio` del contrato: `CUPON_CON_CANJES`,
 * `CAMBIO_NO_PERMITIDO` o `DATOS_INVALIDOS`. Enviar el mismo valor que ya tiene no cuenta como cambio.
 */
export function planificarCambios(actual: Cupon, cambios: ActualizarCupon): PlanDeCambios {
  const fusion = fusionar(actual, cambios);
  const campos = CAMPOS_CONFIGURABLES.filter((campo) => !iguales(actual[campo], fusion[campo]));
  verificarPermitidos(actual, fusion, campos);
  validarConfiguracion(fusion);
  const tomar = (origen: Configuracion, serializado: boolean) =>
    Object.fromEntries(
      campos.map((campo) => [campo, serializado ? serializar(origen[campo]) : origen[campo]]),
    );
  return {
    datos: tomar(fusion, false) as Partial<Configuracion>,
    acciones: accionesDe(campos, fusion),
    antes: tomar(actual, true),
    despues: tomar(fusion, true),
  };
}
