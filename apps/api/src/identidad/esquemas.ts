import { z } from 'zod';

/** Cuerpos de las rutas de identidad (contracts/api-rest.md). Objetos `.strict()`: un campo extra es un error. */

/** Se recorta y pasa a minúsculas antes de validar: ` Ana@Correo.com ` es el mismo correo (edge case). */
const email = z
  .string({ error: 'Escribe un correo válido.' })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Escribe un correo válido.' }).max(254));
const captcha = z
  .string({ error: 'Completa la verificación de que no eres un robot.' })
  .min(1, 'Completa la verificación de que no eres un robot.')
  .max(2048);
const contrasena = z.string({ error: 'Escribe una contraseña.' }).max(1024);
const token = z.string().min(20).max(200);
const codigo = z
  .string({ error: 'Escribe el código.' })
  .trim()
  .regex(
    /^(\d{6}|[A-Za-z0-9]{10})$/,
    'Escribe el código de 6 dígitos o un código de recuperación.',
  );

export const esquemaRegistro = z
  .object({
    nombreCompleto: z
      .string({ error: 'Escribe tu nombre completo.' })
      .trim()
      .min(3, 'Escribe tu nombre completo.')
      .max(120),
    email,
    contrasena,
    fechaNacimiento: z.iso.date({ error: 'Escribe tu fecha de nacimiento (AAAA-MM-DD).' }),
    declaraMayorEdad: z.literal(true, { error: 'Debes declarar que eres mayor de edad.' }),
    captcha,
  })
  .strict();

export const esquemaToken = z.object({ token }).strict();

export const esquemaInicioSesion = z.object({ email, contrasena, captcha }).strict();

export const esquemaCodigo = z.object({ codigo }).strict();

export const esquemaOlvido = z.object({ email, captcha }).strict();

export const esquemaRestablecer = z.object({ token, contrasena }).strict();

export type DatosInicioSesion = z.infer<typeof esquemaInicioSesion>;
