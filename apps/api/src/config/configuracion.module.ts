import { Global, Module } from '@nestjs/common';
import { ENTORNO, validarEntorno } from './env.js';

@Global()
@Module({
  providers: [{ provide: ENTORNO, useFactory: () => validarEntorno(process.env) }],
  exports: [ENTORNO],
})
export class ConfiguracionModule {}
