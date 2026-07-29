# Módulo Concreto (portado de `adelante-control-concreto`)

Control de calidad y producción de concreto de las plantas Blend, portado al app
Produccion (Next.js 16). Vive bajo `/concreto` con submenú en el Sidebar
(patrón "Órdenes de Compra"). Usa los esquemas `hor.*` y `lab.*` que **ya existen**
en `AdelanteDB` (vía `getAdelanteDb()`); **no** se crearon ni alteraron tablas.

## Secciones (submenú del Sidebar)

| Ruta | Qué hace |
|---|---|
| `/concreto/dashboard` | KPIs de producción + m³/día por planta |
| `/concreto/coladas` | Lista + detalle + workflow (confirmar/digitar/cerrar/anular, consolidar, asignar obra, excluir/mover batches, crear Pedido BC) |
| `/concreto/batches` | Datos crudos de planta + análisis de anomalías |
| `/concreto/laboratorio` | Muestras, ensayos, mediciones, curva teórica, informe imprimible, importar Excel |
| `/concreto/esclerometro` | Ensayos no destructivos (martillo Schmidt) + rebotes |
| `/concreto/importaciones` | Ingesta del CSV de planta + historial |
| `/concreto/config` | Actividades de lab · Umbrales de alerta · Densidades de materiales |
| `/concreto/usuarios` | Gestión de roles por Microsoft Graph (no en el submenú; por URL, solo admin) |

Acceso: sesión de Produccion + niveles de rol. Acciones destructivas/config
(anular colada, borrar muestras/ensayos, gestión de usuarios, config) exigen
`nivelAdmin >= 4`. No se portó el login por PIN de laboratorio (se usa la sesión normal).

## Features que necesitan configuración de entorno

Estas quedaron portadas pero **inactivas** hasta configurar su env. Sin env
devuelven 501 con mensaje claro; no rompen el resto del módulo.

### Pedido de Ensamblado en BC + Diagnóstico BC
Reusa `lib/bc-client.ts`. Requiere:
- `BC_TENANT_ID`, `BC_CLIENT_ID`, `BC_CLIENT_SECRET`
- `BC_ENVIRONMENT` **o** `BC_BASE_URL`
- `BC_COMPANY_ID` (GUID)
- `BC_COMPANY` (**nueva**: nombre exacto de la empresa en BC, p.ej. `ADELANTE_DESARROLLOS_NUEVA`; para el path OData `Company('NOMBRE')/AssemblyOrder`)

### Fotos de laboratorio (Azure Blob)
- `FOTOS_STORAGE_ACCOUNT` (requerida), `FOTOS_CONTAINER` (opcional, default `fotos-muestras`)
- Credencial: `AZURE_CLIENT_ID` / `AZURE_TENANT_ID` / `AZURE_CLIENT_SECRET` (o Managed Identity en Azure)
- **Falta instalar el SDK** `@azure/storage-blob` (hoy ausente → 501). Import dinámico, no rompe el build.

### Gestión de usuarios (Microsoft Graph)
- Rápido: `AZURE_API_SP_ID`, `ROLE_ID_ADMIN`, `ROLE_ID_OPERADOR`, `ROLE_ID_LABORATORIO`, `ROLE_ID_INGENIERIA`
- Fallback: `AZURE_API_CLIENT_ID` (permiso Graph `Application.Read.All`)
- Credencial: `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` (o MI). Permisos Graph de la MI: `User.Read.All` + `AppRoleAssignment.ReadWrite.All`
- `@azure/identity` ya es dependencia transitiva.

## Formato del CSV de ingesta (planta Blend)

- Separador coma (RFC 4180 simplificado), UTF-8 (BOM opcional), CRLF o LF.
- Fila 1 = header (se ignora); datos desde la fila 2.
- 157 columnas posicionales. Clave: `0` Record no., `2` Machine_SN (define la planta),
  `9/10` fecha inicio/fin, `12` Recipe_Name, `44` Concrete_Cons (m³), dosis/teóricos/deltas
  de áridos/cemento/agua/aditivos, `111` relación agua/cemento, 32 alarmas desde el índice `125`.
- Fechas `DD/MM/YYYY HH:MM:SS` hora local CR (GMT-06:00; se guardan UTC).
- Regla: **un archivo = una sola planta** (un único Machine_SN) o se rechaza (400).
- Dedup por hash SHA-256 del archivo y por `(id_planta, record_no)`.

## Formato del Excel de laboratorio

- Hoja `"BASE DATOS"`, datos desde la fila 10. Columnas (0-indexed): `1` N° MUESTRA,
  `3` ID CASA, `4` ACTIVIDAD, `5` FECHA COLADO (DD/MM/YY), `6` PROVEEDOR, `7` TIPO CONCRETO;
  ensayos 7d (fecha col 9, MPa col 10), 14d (14/15), 28d (19/20).
- Match por `(fecha_colado + casa)`. Idempotente (upsert).
