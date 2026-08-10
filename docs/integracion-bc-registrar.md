# Integración Producción → Business Central · Acción "Registrar"

Portado de `adelante-obrascontrol`. El lado app vive ahora en Produccion:
- Pantallas: `/bc/integracion` (listado) y `/bc/integracion/{obra}` (detalle).
- API: `GET /api/bc/resumen`, `GET /api/bc/preview?obra=…`, `POST /api/bc/reportar`, `POST /api/bc/registrar`.
- Cliente OData: `lib/bc/production-lines.ts` (entidad `Obra_Production_Lines`).
- Lógica de comparación OC vs BC: `lib/bc/integracion.ts`.

## Contexto
Producción ya **reporta** el avance a BC escribiendo el campo `Quantity` (0–1) de
las líneas de producción vía OData:

```
PATCH .../ODataV4/Company('ADELANTE_DESARROLLOS_NUEVA')/Obra_Production_Lines(Works_No='VN-K.26',Task_No='2.5')
Body: { "Quantity": 1.0 }
```

Esto deja la línea con `Quantity` actualizado y `Outstanding` (pendiente) = Quantity − Registered.
**Falta el paso "Registrar"** (postear), que hoy se hace a mano con el botón *Registrar*
de la página `GomJob Works Production Card` (page 70720581) y que crea los asientos +
pone la fecha de registro.

## Lo que se solicita al partner de BC (GomJob)
Exponer la acción **"Registrar"** como **web service S2S** para poder dispararla por API
(la misma app `BusinessCentral_API_Adelante`, permission set `ADELANTE API RIMD`).

### Opción recomendada: codeunit con procedimiento `[ServiceEnabled]`
```al
codeunit 70720XXX "ObrasControl Registrar API"
{
    [ServiceEnabled]
    procedure RegistrarObra(WorksNo: Code[20]; FechaRegistro: Date): Text
    begin
        // Ejecutar el MISMO proceso que el botón "Registrar" de la page 70720581
        // para la obra WorksNo, usando FechaRegistro como fecha de registro.
        // Debe respetar todas las validaciones del codeunit de posteo de GomJob.
        // Devolver un texto/estado (ej. "OK" o nº de documento registrado).
    end;
}
```
Publicarlo en **Web Services** (Object Type = Codeunit, Service Name = `ObraRegistrarProd`,
Published = Sí). Queda invocable como acción no enlazada de OData v4:

```
POST .../ODataV4/Company('ADELANTE_DESARROLLOS_NUEVA')/ObraRegistrarProd_RegistrarObra
Body: { "worksNo": "VN-K.26", "fechaRegistro": "2026-06-09" }
```

### Requisitos
- Recibir **Works No.** + **Fecha de registro** (obligatoria para registrar).
- Registrar **solo el Outstanding** (lo pendiente) de esa obra, con validaciones normales.
- Idempotente / seguro: si no hay pendiente, no hacer nada y devolver estado claro.
- Devolver error legible si falla (para mostrarlo en la app).
- Permisos: que el permission set `ADELANTE API RIMD` (o el que se asigne) pueda ejecutarlo.

## Habilitación en Produccion
Cuando BC publique el web service, en el App Service:
- `BC_REGISTRAR_HABILITADO=1` → habilita el botón "Registrar" en la UI.
- `BC_REGISTRAR_ACTION` → nombre de la acción OData (default `ObraRegistrarProd_RegistrarObra`).
- `BC_COMPANY` (nombre de compañía) **o** `BC_COMPANY_ID` (GUID) — direccionamiento de la entidad.
- `BC_PRODUCTION_ENTITY` → default `Obra_Production_Lines`.

Reutiliza las credenciales OAuth ya configuradas (`BC_TENANT_ID`, `BC_CLIENT_ID`,
`BC_CLIENT_SECRET`, `BC_ENVIRONMENT`/`BC_BASE_URL`) vía `getBCToken` (`lib/bc-client.ts`).

## Estado del lado app
- ✅ Reportar (`Quantity`) — funcionando.
- ✅ Preview con monto a registrar (Importe pendiente).
- ✅ Detección de obras con **producción no inicializada** (Σ Line_Amount = 0).
- ⏳ Registrar — botón listo, conectado apenas exista `ObraRegistrarProd_RegistrarObra` y `BC_REGISTRAR_HABILITADO=1`.
