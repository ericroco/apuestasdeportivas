# Trazabilidad del equipo en Grafana

Objetivo (`PLAN.md`, F0): un tablero donde el equipo y el docente vean el proceso de desarrollo: commits, PRs,
tiempo de revisión, despliegues, fallos del pipeline y métricas DORA. No mide la aplicación, mide al equipo.

## 1. Conectar GitHub

1. Crear una cuenta gratuita en Grafana Cloud y un stack.
2. Connections → Add new connection → **GitHub** → Install.
3. Crear un *fine-grained token* de GitHub con acceso de solo lectura a `ericroco/apuestasdeportivas`
   (Contents, Pull requests, Actions, Deployments, Metadata) y pegarlo en el datasource.
4. Guardar y probar (*Save & test*).

## 2. Paneles

Crear un dashboard "Equipo: apuestas deportivas" con variable `$__timeFilter` de 30 días y estos paneles
(datasource GitHub, owner `ericroco`, repository `apuestasdeportivas`):

| Panel | Query type | Configuración | Qué muestra |
|-------|------------|---------------|-------------|
| Commits por integrante | Commits | ref `develop`, agrupar por `author` | Reparto del trabajo |
| PRs abiertos y cerrados | Pull Requests | time field `created_at` / `closed_at` | Flujo de integración |
| Tiempo de revisión | Pull Requests | transformación: `merged_at - created_at`, media por semana | Lead time de cambios (DORA) |
| Frecuencia de despliegue | Workflow Runs | workflow `ci.yml`, job `Desplegar`, conclusión `success` | Deployment frequency (DORA) |
| Fallos del pipeline | Workflow Runs | workflow `ci.yml`, conclusión `failure` | Tasa de fallos de cambio (DORA) |
| Tiempo de recuperación | Workflow Runs | tiempo entre un `failure` en `develop` y el siguiente `success` | MTTR (DORA) |
| Specs por estado | Issues | etiqueta `spec` | Avance de los specs del equipo |

## 3. Compartir

Dashboard → Share → **Public dashboard** (o un enlace con acceso) para el docente. Exportar el JSON del tablero a
`docs/grafana-dashboard.json` cuando esté listo, para que quede versionado.

## Notas

- El datasource consulta la API de GitHub; el plan gratuito de Grafana Cloud y el límite de la API alcanzan para
  un repo de este tamaño.
- Las métricas DORA dependen de que el flujo se respete: todo entra por PR y se despliega solo desde CI.
