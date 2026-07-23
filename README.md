# Produccion

App interna de Adelante Desarrollos que unifica la operación de **producción de obra**:
gestión de **obras, partidas/subpartidas, cuadrillas, proyectos**, **presupuestos** (subida a
Business Central), **pedidos de compra**, **aprobación de órdenes de compra**, **concretos**,
**avance de obra** y **reporte H4**.

Next.js 16 (App Router, SSR) + SQL Server (`AdelanteSBX`), auth con JWT + cookie + OTP y un
dev-login para entornos no productivos.

> **Origen:** este app parte de [`ControlUsuarios`](https://github.com/adelantedesarrollos/ControlUsuarios)
> como base (obras, partidas/subpartidas, cuadrillas, H4, integración BC) y le integra los
> módulos de [`OrdenesCompras`](https://github.com/DavidpcAD/OrdenesCompras) (pedidos,
> aprobación de OC, concretos). Ambos ya corren contra la misma base `AdelanteSBX`.

## Correr en local

```bash
npm install
npm run dev          # http://localhost:3000 (o el puerto que indique)
```

Necesita un `.env.local` (gitignored) con al menos:

```
JWT_SECRET=...
NEXT_PUBLIC_APP_URL=http://localhost:3000
DB_SERVER=mysqladelante.database.windows.net
DB_NAME=AdelanteSBX
DB_USER=...
DB_PASSWORD=...
DB_PORT=1433
```

En desarrollo, la pantalla de login muestra un panel **Dev** para entrar como cualquier
usuario real sin contraseña (gated por `NODE_ENV` / `ENABLE_DEV_LOGIN`).

## Modelo de datos

Corre contra `AdelanteSBX` (`dbo`): `Colaborador` + `Usuario` (login) + `Rol` (por `App`) +
`UsuarioRol`/`UsuarioProyecto`, catálogos (`Puesto`/`Departamento`, `Distrito`/`Canton`/
`Provincia`, `Pais`) y la vista de lectura `V_Colaborador`. El nivel de permiso por rol se
centraliza en `lib/permissions.ts`. DDL aditivo en `docs/sql/` y `migrations/`.

## Deploy

**Azure App Service** (Node, `output: standalone`). CD por GitHub Actions
(`.github/workflows/azure-app-service.yml`) en cada push a `main`. Antes del primer deploy hay
que crear el Web App de Produccion (`scripts/azure-setup.ps1`), cargar el secret
`AZURE_WEBAPP_PUBLISH_PROFILE` en este repo y ajustar `AZURE_WEBAPP_NAME` en el workflow.

- Dominio destino: https://produccion.adelante.cr
