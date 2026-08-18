# Spec — `AdelantePO_SetLineJob` (codeunit "Adelante PO Actions" / web service `AdelantePO`)

## Objetivo
Poder setear, por línea de un **Pedido de compra** en BC, los campos que la **API estándar
v2.0 `purchaseOrderLines` NO expone**:

- **Job No.** (N.º proyecto) y **Job Task No.** (N.º tarea proyecto) → para material de
  **Consumo inmediato** (se carga contra la obra + actividad).
- **Location Code** (Cód. almacén) por línea → para material de **Stock**.

Es el mismo caso que los cargos (Item Charge), que ya se resolvieron con
`AdelantePO_AddChargeLine`. Este procedimiento sigue exactamente ese patrón.

> Contexto app: la Tarea ya viaja Ingeniería → pedido (SQL) → orden (SQL,
> `OrdenCompraDet.taskNo`). Solo falta este último hop orden → BC. Al aprobar y lanzar,
> `lib/compras/aprobar.ts` crea el pedido en BC con la API estándar (sin job/task) y luego
> llama a este procedimiento para completar los campos que faltan, antes del Release.

---

## 1. Publicación (igual que los demás `AdelantePO_*`)
Procedimiento `[ServiceEnabled]` en el codeunit ya publicado como web service **`AdelantePO`**
(el mismo que expone `AdelantePO_ReleaseOrder`, `AdelantePO_AddChargeLine`,
`AdelantePO_PostInvoice`, `AdelantePO_PostReceipt`). Queda accesible como acción OData V4:

```
POST https://api.businesscentral.dynamics.com/v2.0/{tenant}/{environment}/ODataV4/AdelantePO_SetLineJob?company={companyId}
Content-Type: application/json
Authorization: Bearer <token>  (client credentials, igual que hoy)
```

La compañía es la **misma** que usa la API estándar para items/vendors/pedidos
(`getStdCompanyId()` en el front). Importante para que encuentre el pedido.

---

## 2. Firma
Un único llamado por orden, con un arreglo de asignaciones (menos round-trips):

```al
[ServiceEnabled]
procedure AdelantePO_SetLineJob(orderNo: Text; assignmentsJson: Text): Text
```

- **`orderNo`**: N.º del Pedido de compra (`Purchase Header."No."`, p.ej. `CP-003872`).
- **`assignmentsJson`**: JSON array. Una entrada por línea a completar:

```json
[
  { "lineNo": 10000, "jobNo": "VN-B.24", "jobTaskNo": "1.2", "locationCode": "" },
  { "lineNo": 20000, "jobNo": "",        "jobTaskNo": "",    "locationCode": "ALM-GRAL" }
]
```

- **Consumo inmediato** → viene `jobNo` + `jobTaskNo` (locationCode vacío o el de recepción).
- **Stock** → viene `locationCode` (jobNo/jobTaskNo vacíos).
- **Identificación de línea**: por **`lineNo`** = el `Line No.` de la Purchase Line, que la
  app captura del campo **`sequence`** de la línea estándar al crearla (ver §5). Es lo más
  robusto (soporta el mismo item repetido). *Alternativa* si prefieren no depender del Line
  No.: matchear por `no` (itemNo) + orden de aparición — menos robusto con duplicados.

**Retorno** (Text, JSON): resumen para que la app pueda avisar el error real sin tumbar el
lanzamiento (mismo criterio que `AddChargeLine`):

```json
{ "updated": 2, "errors": "" }
```

---

## 3. Lógica (AL de referencia)
```al
[ServiceEnabled]
procedure AdelantePO_SetLineJob(orderNo: Text; assignmentsJson: Text): Text
var
    PurchLine: Record "Purchase Line";
    Arr: JsonArray;
    Tok: JsonToken;
    Obj: JsonObject;
    LineNo: Integer;
    JobNo, JobTaskNo, LocCode : Code[20];
    Updated: Integer;
    Errors: Text;
begin
    if not Arr.ReadFrom(assignmentsJson) then
        Error('assignmentsJson inválido');

    foreach Tok in Arr do begin
        Obj := Tok.AsObject();
        LineNo := GetInt(Obj, 'lineNo');
        JobNo := CopyStr(GetTxt(Obj, 'jobNo'), 1, 20);
        JobTaskNo := CopyStr(GetTxt(Obj, 'jobTaskNo'), 1, 20);
        LocCode := CopyStr(GetTxt(Obj, 'locationCode'), 1, 20);

        PurchLine.Reset();
        PurchLine.SetRange("Document Type", PurchLine."Document Type"::Order);
        PurchLine.SetRange("Document No.", CopyStr(orderNo, 1, 20));
        PurchLine.SetRange("Line No.", LineNo);
        if PurchLine.FindFirst() then begin
            if JobNo <> '' then begin
                PurchLine.Validate("Job No.", JobNo);        // 1) proyecto primero
                PurchLine.Validate("Job Task No.", JobTaskNo); // 2) luego la tarea
                PurchLine.Validate("Job Line Type", PurchLine."Job Line Type"::Budget); // confirmar (ver nota)
            end;
            if LocCode <> '' then
                PurchLine.Validate("Location Code", LocCode);
            PurchLine.Modify(true);
            Updated += 1;
        end else
            Errors += StrSubstNo('Línea %1 no encontrada. ', LineNo);
    end;

    exit(FormatResult(Updated, Errors)); // -> {"updated":N,"errors":"..."}
end;
```

**Puntos clave a respetar:**
1. **Usar `Validate`, no asignación directa**, y en este orden: `Job No.` → `Job Task No.`
   → `Job Line Type`. Así se dispara la lógica OnValidate de BC (verifica que el proyecto
   esté abierto, que la tarea pertenezca al proyecto y sea de tipo **Posting**, y crea/liga
   las Job Planning Lines si corresponde). La app ya solo ofrece tareas `tipo = Posting`.
2. **`Job Line Type`**: confirmar con el proceso de Adelante el valor correcto
   (`Budget` / `Billable` / `Both Budget and Billable`). Para material comprado que se
   consume en obra suele ser `Budget` (o `Both`). Dejarlo parametrizable si hace falta.
3. **Idempotente**: volver a correrlo con los mismos valores no debe fallar (setea lo mismo).
   Necesario porque "reintentar lanzar" puede re-ejecutar el flujo.
4. **No lanza excepción por una línea**: acumula el motivo en `errors` y sigue (como
   `AddChargeLine`). Si algo es fatal (proyecto inexistente), que el mensaje sea el real de
   BC para mostrarlo en la app.
5. **Antes del Release**: la app llama a este procedimiento **después** de crear las líneas y
   **antes** de `AdelantePO_ReleaseOrder`. Una orden lanzada no debería editarse.

---

## 4. Validaciones esperadas (para probar)
- Proyecto (`Job No.`) existe y está **Open**.
- Tarea (`Job Task No.`) existe **dentro** de ese proyecto y es de posteo (`Posting`).
- La línea es de tipo **Item** (las de cargo se manejan aparte, no llevan job).
- `Location Code` existe si viene.

---

## 5. Cambio del lado app (lo hago yo cuando exista el procedimiento)
En `lib/compras/bc.ts` (`bcCrearPedido`):
1. Al crear cada línea con la API estándar, **capturar el `sequence`** de la respuesta
   (`lineBody` → la línea creada devuelve `sequence` = `Line No.`). Hoy no se guarda.
2. Extender `NuevaLineaBc` con `jobNo?`, `jobTaskNo?`, `locationCode?` (ya vienen en la
   orden: `OrdenLinea.proyecto` = Job No., `OrdenLinea.taskNo` = Job Task, y `almacen`).
3. Tras crear las líneas, armar el `assignmentsJson` (solo las líneas con job o location) y
   `POST AdelantePO_SetLineJob`. Guardado como `AddChargeLine`: si falla, **no** se tumba el
   lanzamiento, pero se surfacea el error real (`⚠️ la actividad/almacén no se aplicó en
   BC: …`).
4. Igual en `bcResyncPedidoLines` (reintentos), que ya empareja líneas por item.

En `aprobar.ts`, `lineasBc` pasaría a incluir `jobNo`/`jobTaskNo`/`locationCode` por línea
(derivados de la orden). El guarda-precios y el resto quedan igual.

---

## 6. Checklist de verificación (Sandbox, antes de PRO)
1. Crear un pedido de **Consumo inmediato** en la app (obra + actividad) y aprobar/lanzar.
2. En BC (página 9307, Purchase Order del `CP-…`): la línea debe mostrar **N.º proyecto** y
   **N.º tarea proyecto** correctos; **Cód. almacén** según corresponda.
3. Revisar que se hayan generado las **Job Planning Lines** (si el `Job Line Type` las crea).
4. Repetir con un pedido de **Stock** → la línea debe llevar **Cód. almacén** y sin proyecto.
5. Reintentar "Aprobar y lanzar" sobre el mismo pedido → idempotente, sin duplicar ni fallar.
6. Confirmar que el **Release** sigue funcionando después de setear los campos.

---

### Resumen para el dev de BC
Agregar `AdelantePO_SetLineJob(orderNo, assignmentsJson)` al codeunit "Adelante PO Actions",
que recorre las Purchase Lines del pedido (por `Line No.`) y hace `Validate` de
`Job No.` → `Job Task No.` → `Job Line Type` (consumo) y/o `Location Code` (stock), idempotente
y sin tumbar por línea. Republicar la extensión "adelante" en el Sandbox. Con eso, la app cierra
el último hop del feature de Consumo inmediato.
