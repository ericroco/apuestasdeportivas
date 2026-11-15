import { Injectable, type OnModuleInit } from '@nestjs/common';
import argon2 from 'argon2';

/** Argon2id con el mínimo recomendado por OWASP (research §4). */
const OPCIONES = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class ContrasenasService implements OnModuleInit {
  /** Hash de un valor al azar para igualar el tiempo de respuesta cuando el correo no existe (FR-009). */
  private hashFicticio = '';

  async onModuleInit(): Promise<void> {
    this.hashFicticio = await argon2.hash(crypto.randomUUID(), OPCIONES);
  }

  hashear(contrasena: string): Promise<string> {
    return argon2.hash(contrasena, OPCIONES);
  }

  /** `hash` nulo (usuario inexistente): verifica contra el ficticio y devuelve `false` con el mismo costo. */
  async verificar(hash: string | null, contrasena: string): Promise<boolean> {
    try {
      const valida = await argon2.verify(hash ?? this.hashFicticio, contrasena);
      return hash !== null && valida;
    } catch {
      return false;
    }
  }
}
