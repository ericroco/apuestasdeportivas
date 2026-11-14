// Conventional Commits (constitución: commits atómicos con feat:, fix:, docs:…).
// Los mensajes van en español. Se permite que el asunto empiece con un nombre propio (PostgreSQL, NestJS…)
// y el cuerpo y el pie no tienen límite de largo de línea.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 100],
    'subject-case': [0],
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};
