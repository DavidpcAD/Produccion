# Deploy de ControlUsuarios → Azure App Service

ControlUsuarios es un **Next.js 16 SSR** (API routes, server components, middleware
`proxy.ts`, auth JWT/cookie, `mssql`, `output: standalone`). **No** es una static app,
así que **no** va en Static Web Apps. El patrón correcto es **Azure App Service (Node)**,
el mismo que usa la app hermana **b0-boletas**.

> ¿Por qué no SWA? Una Static Web App sirve archivos estáticos (+ un backend de Functions
> opcional). ControlUsuarios necesita un servidor Node corriendo (`node server.js`) para
> las API routes, los server components y el middleware. Forzarlo a SWA = reescribir la app.

## Arquitectura del deploy
- **Build**: corre en GitHub Actions (`npm ci` + `next build` con `output: standalone`).
- **Runtime**: App Service Linux, Node 22, arranca con `node server.js`.
- **BD**: `AdelanteSBX` en `mysqladelante.database.windows.net` (mismas credenciales que local).
- **Auth del deploy**: publish profile (secret `AZURE_WEBAPP_PUBLISH_PROFILE`).

## Pre-requisitos
- Azure CLI (`az`) + login con la suscripción `azureadelantedesarrollos`.
- `.env.local` en la raíz (de ahí el script lee DB/JWT; nunca se commitea).
- Un repo en GitHub que controles (con permiso de Settings → Secrets).
- La BD ya tiene los objetos del modelo nuevo (`V_Colaborador`, `OTPCodes`,
  `UsuarioAuditLog`). Si desplegás contra una BD limpia, corré `docs/sql/001-modelo-nuevo.sql`.

## Pasos

### 1. Crear los recursos en Azure (lo corrés vos)
```powershell
az login
az account set --subscription "azureadelantedesarrollos"
./scripts/azure-setup.ps1
```
El script crea: resource group, App Service Plan (Linux B1), Web App (Node 22),
startup `node server.js`, y carga las **app settings** (DB_*, JWT_SECRET,
NEXT_PUBLIC_APP_URL, WEBSITES_PORT=8080, NODE_ENV=production, ENABLE_DEV_LOGIN=true,
y Twilio/BC/AppInsights si están en `.env.local`). Al final:
- Imprime las **IPs outbound** del Web App.
- Genera `publish-profile.xml` (gitignored).

### 2. Firewall del SQL
En `mysqladelante` → Networking → Firewall rules: agregá las IPs outbound que imprimió
el script, **o** activá *"Allow Azure services and resources to access this server"*.
(Si no, el server no conecta a AdelanteSBX en el primer query.)

### 3. Secret de GitHub
Repo → **Settings → Secrets and variables → Actions → New repository secret**:
- Name: `AZURE_WEBAPP_PUBLISH_PROFILE`
- Value: el contenido COMPLETO de `publish-profile.xml`.
- Después borrá `publish-profile.xml` (ya está en `.gitignore`).

### 4. Ajustar el nombre del Web App
En `.github/workflows/azure-app-service.yml`, `AZURE_WEBAPP_NAME` debe ser el nombre
EXACTO del Web App creado (default `controlusuarios-ad`; debe ser único en
`azurewebsites.net`). Si lo cambiás, ajustá también `$WebAppName` en el script.

### 5. Push → deploy automático
Push a `main` (o "Run workflow" manual). El workflow: `npm ci` → `tsc --noEmit` →
`next build` → empaqueta `.next/standalone` + `.next/static` + `public` → deploy.

### 6. Smoke test
```
https://<webapp>.azurewebsites.net/login   -> 200
https://<webapp>.azurewebsites.net/        -> 307 a /login (sin sesión)
```
El panel **Dev** del login aparece porque `ENABLE_DEV_LOGIN=true`.

## Gotchas confirmados (deploy real 2026-06-26)
- **`HOSTNAME=0.0.0.0`** es obligatorio: Next standalone (`server.js`) enlaza a
  `process.env.HOSTNAME`; en App Service ese valor es un host no ruteable y la probe
  de warmup falla con 503 / `ContainerTimeout` / `exit code 1`. Ya está en el script.
- **Zip hecho en Windows**: NO uses `ZipFile.CreateFromDirectory` ni `Compress-Archive`
  de PowerShell 5.1 — escriben los nombres de entrada con `\`, que en Linux no se
  interpretan como carpetas → `Error: Cannot find module 'next'`. Si zipeás a mano en
  Windows, normalizá las entradas a `/` (`CreateEntry($rel.Replace('\','/'))`). El
  **workflow de GitHub Actions no tiene este problema** (zipea en Linux) → es el camino
  recomendado para deploys siguientes.
- El primer `az webapp deploy` puede devolver **504** ("Warming up Kudu"); el deploy
  igual **continúa async** y termina bien. Verificá con el sitio, no con ese código.
- **SCM basic auth**: los web apps nuevos lo traen DESHABILITADO → el deploy del workflow
  (`azure/webapps-deploy@v3` con publish profile) falla con *"Publish profile is invalid
  for app-name and slot-name provided"*. Fix (ya en el script):
  `az resource update -g <rg> --name scm --namespace Microsoft.Web --resource-type basicPublishingCredentialsPolicies --parent sites/<app> --set properties.allow=true`,
  luego regenerar el publish profile y re-subir el secret.

## Estado actual
- **Desplegado y funcionando**: https://usuarios-ad.azurewebsites.net
- Recursos: RG `rg-controlusuarios`, plan `plan-controlusuarios` (B1), webapp
  `usuarios-ad`, región **southcentralus** (misma que el SQL).
- **CD por GitHub Actions** (`.github/workflows/azure-app-service.yml` → `usuarios-ad`)
  con el secret `AZURE_WEBAPP_PUBLISH_PROFILE`. Push a `main` despliega solo.

## Endurecer para PRODUCCIÓN real
- **Quitar** `ENABLE_DEV_LOGIN` (deja entrar sin contraseña). El login real exige
  password+OTP; configurá `TWILIO_*` para SMS real.
- Rotar `JWT_SECRET` (no reusar el de dev).
- Cookies ya van `secure` + `sameSite=strict` con `NODE_ENV=production` (HTTPS lo da
  `*.azurewebsites.net`).
- Custom domain + cert si aplica (ver `scripts/azure-domain.ps1` de b0-boletas como
  referencia).
- Considerar apuntar a `AdelanteDB`/PRO en vez de `AdelanteSBX` cuando el modelo migre.
