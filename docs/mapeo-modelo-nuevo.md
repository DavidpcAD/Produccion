# Match de columnas: app legacy → modelo nuevo (AdelanteSBX `dbo`)

Estado: **borrador para decidir juntos**. Marcá ✅ / cambiá lo que quieras.

Leyenda: ✅ map directo · 🔁 renombrado · ➕ movido/nuevo · ❓ decisión · ❌ no existe

---

## 1. Colaborador (persona) — `dbo.Colaborador`

| Campo en la app (UI/legacy) | Columna `dbo` (modelo nuevo) | Estado | Decisión |
|---|---|---|---|
| IDCol | idColaborador | 🔁 | ✅ |
| Cedula | cedula | ✅ | ✅ |
| Nombre | nombre | ✅ | ✅ |
| PrimerApellido | primerApellido | ✅ | ✅ |
| SegundoApellido | segundoApellido | ✅ | ✅ |
| NombreCompleto | **calcNombreCompleto** (CALCULADA) | 🔁 | ✅ auto |
| Correo | correo | ✅ | ✅ |
| Telefono | telefono | ✅ | ✅ |
| FechaIngreso | fechaIngreso | ✅ | ✅ |
| FechaSalida | fechaSalida | ✅ | ✅ |
| FechaNacimiento | fechaNacimiento | ✅ | ✅ |
| Activo | esActivo | 🔁 | ✅ |
| TallaCamisa / TallaPantalon | tallaCamisa / tallaPantalon | ✅ | ✅ |
| Direccion | direccion | ✅ | ✅ |
| Sexo (`M`/`F`) | genero (hoy NULL) | ❓ | **¿valores `M`/`F` o `Masculino`/`Femenino`?** |
| Departamento (texto) | idPuesto → Puesto.idDepartamento → **Departamento.nombre** | ❓ | **ahora es catálogo (FK)** |
| Puesto (texto) | **idPuesto** → Puesto.nombre | ❓ | **catálogo (FK)** |
| Provincia / Canton / Distrito (texto) | **codigoDistrito** → Distrito→Canton→Provincia | ❓ | **catálogo (FK)** |
| Pais (texto) | **idPais** → Pais.nombre | ❓ | catálogo (FK) |
| Contrasena | → **dbo.Usuario.passwordHash** | ➕ | movido a Usuario |
| (usuario de login) | → **dbo.Usuario.username** | ➕ | nuevo |
| Salario / SalarioXHora / Bonificacion | — | ❌ | **¿quitar de la UI?** |
| ProfilePic / AzureBlobFotoURL | — | ❌ | ¿quitar? |
| Iniciales | — (se puede calcular) | ❌ | calcular en front |
| IDProcore | — | ❌ | ¿quitar? |

Catálogos disponibles: `dbo.Pais`, `dbo.Provincia`, `dbo.Canton`, `dbo.Distrito`(codigoINEC/codigoCanton/nombre), `dbo.Departamento`, `dbo.Puesto`(idDepartamento/nombre).

## 2. Login / sesión — `dbo.Usuario`
`idUsuario, idColaborador, username, passwordHash, telefono`. N:N con `Rol` vía `UsuarioRol`.
- ❓ **Login por `username` (ej: `dnj`, `david`) o por `cedula`** (hoy las cédulas son de prueba `1-0000-000X`).
- OTP: teléfono sale de `Colaborador.telefono` (el de Usuario casi siempre NULL).

## 3. Rol — `dbo.Rol`

| legacy | `dbo.Rol` | Estado | Decisión |
|---|---|---|---|
| IDRol | idRol | ✅ | ✅ |
| NombreRol | nombre | ✅ | ✅ |
| Descripcion | descripcion | ✅ | ✅ |
| Categoria | — → se usa **App.nombre** | 🔁 | agrupar por App |
| NivelAdmin | — → mapa en `lib/permissions.ts` | ❓ | **confirmar mapa (abajo)** |
| Activo | — | ❌ | siempre activo |
| — | **idApp** (FK App) | ➕ | el rol pertenece a una App |

Mapa **Rol → nivelAdmin** propuesto (editable en `lib/permissions.ts`):
`Administrador=4 · Ingeniero Residente=2 · Jefe de Cuadrillas=2 · Maestro de Obras=1 · Proveeduría=1 · Facturador Bodega=1`

## 4. Proyecto — `dbo.Proyecto`

| legacy | `dbo.Proyecto` | Estado | Decisión |
|---|---|---|---|
| IDProyecto | idProyecto | 🔁 | ✅ |
| Nombre | nombre | ✅ | ✅ |
| CodigoBC | abreviatura | ❓ | **¿abreviatura = CodigoBC?** |
| Estado | — → categoria | ❓ | **¿uso `categoria` como Estado?** |
| Ubicacion | linkUbicacion | 🔁 | ✅ |
| FechaInicio / FechaFinEstimada | — | ❌ | quitar de UI |
| Activo | — | ❌ | siempre activo |
| ColaboradorProyectos | **UsuarioProyecto** | 🔁 | asignación por Usuario |
| — | idCompania, color*, esDesarrollos/esHomes/esVentas | ➕ | nuevos (¿usarlos?) |

## 5. Cuadrilla — `dbo.Cuadrilla` / `dbo.CuadrillaMiembro` (≈ 1:1, PascalCase)
IDCuadrilla, Nombre, IDProyecto, IDEncargado, Capacidad, Activo, TaskNoBC, CreadoPor + **horaInicioJornada/horaFinJornada** (nuevas). `IDEncargado` y `CuadrillaMiembro.IDCol` → `Colaborador.idColaborador`. ✅

## 6. OTP — la app espera `OTPCodes(IDOtp, IDCol, CodeHash, ExpiresAt, Usado, FechaCreacion)`
Existe **`leg.OTPCodes` con esas mismas columnas** (vacía). También `leg.OtpLog` (log más rico).
- ❓ **¿Crear `dbo.OTPCodes` / reusar `leg.OTPCodes` (key por idUsuario) / dejar fallback en memoria?**

## 7. Auditoría — la app espera `UsuarioAuditLog(IDAudit, IDColAccion, Accion, Entidad, IDEntidad, DetallePrevio, DetalleNuevo, IP, FechaAccion)`
No existe en `dbo` (`leg.UsuarioAuditLog` vacía; `dbo.UsuarioActividad` es otra cosa).
- ❓ **¿Crear `dbo.UsuarioAuditLog` o dejar auditoría desactivada?**
