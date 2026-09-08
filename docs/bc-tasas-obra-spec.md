# BC — las 2 tasas de la obra (% tasa y % tasa postventa)

**Estado: LISTO y verificado end-to-end** (AdelanteAPI **1.2.7.0** en Sandbox y Production).
Este doc empezó como el pedido a quien mantiene el AL; queda como la documentación de cómo
funciona y de lo que se comprobó contra BC.

## Qué son

Al cargar el presupuesto, el app calcula 2 porcentajes y los escribe en la ficha de la obra
en BC (tabla **GomJob Works**, 70720576, pestaña *Adicionales*):

| Propiedad OData | Campo de la tabla | Id | Fórmula |
|---|---|---|---|
| `taxPcnt` | `Tax Pcnt.` | 231 | coste indirecto ÷ importe de venta × 100 |
| `afterSalesTaxPcnt` | `After-sales Tax Pcnt.` | 233 | postventa (línea `CI.PV`) ÷ importe de venta × 100 |
| `useCustomTax` | `Use Custom Tax` | 230 | booleano "usar tasa personalizada" |
| `useCustomAfterSalesTax` | `Use Custom After-sales Tax` | 232 | idem, para postventa |

Los 4 son de la extensión *Goom Job Global Localization*
(`766530ba-9ab2-4d46-bb05-68244f5d75be`, v28.3.1.0), dueña de la propia tabla; la página API
`work` de AdelanteAPI ya la tenía como origen, así que no hubo que agregar dependencias.

**Validación cruzada:** en Production, VN-B.22 tenía las tasas puestas a mano en **31,1** y
**0,79**, y las fórmulas del app dan exactamente lo mismo (27.341.029,26 ÷ 87.920.306,88 y
694.725,846988 ÷ 87.920.306,88).

## Cómo se escribe

`PATCH .../api/adelante/construction/v1.0/companies({companyId})/works({systemId})`
con `If-Match: *`. **La clave OData es el SystemId (`id`), no el N° de obra** — se ubica con
`?$filter=no eq 'VN-B.22'&$select=id,no`. `companyId` es el mismo en los dos entornos:
`c65a9b3a-4592-f011-b419-6045bd3b8acf`.

Los 4 campos van en **un solo payload**:

```json
{ "useCustomTax": true, "taxPcnt": 31.1,
  "useCustomAfterSalesTax": true, "afterSalesTaxPcnt": 0.79 }
```

### Lo que se comprobó en Sandbox (obra de prueba `ZZC-02`)

1. **El PATCH único pega.** Un GET inmediatamente después devuelve los 4 valores igual. **No
   hay `OnValidate` que pise el porcentaje**, así que no hace falta partirlo en dos PATCH ni
   pedir una acción `AdelanteObra_SetTasas`.
2. **Mandar el porcentaje solo ya enciende su booleano**: un `PATCH {"taxPcnt": 12.5}` sobre
   una obra con el flag en `false` lo deja en `true`. Se mandan igual los cuatro porque el de
   postventa no siempre se enciende solo (con `afterSalesTaxPcnt: 0` no se encendió).
3. **Apagar los booleanos hay que hacerlo aparte**: en el mismo payload que un porcentaje, el
   `OnValidate` del porcentaje los vuelve a encender. Solo importa si algún día hay que
   revertir una obra; el app nunca los apaga.
4. **BC NO valida el rango por la API.** `taxPcnt: 150` y `taxPcnt: -5` entran con **HTTP 200**
   y quedan guardados. El `MinValue 0 / MaxValue 100` de la tabla solo frena la captura a mano
   en la ficha. **Por eso el rango lo cuida el app** (ver abajo) — si no, una obra puede quedar
   con una tasa imposible sin que nada se queje.

## Cómo lo hace el app

- `lib/presupuesto-tasas.ts` — `calcularTasas()` sobre las líneas del Excel ya parseadas. Suma
  solo las líneas `Posting` (los Capítulos son `Total` y duplicarían). Devuelve además
  `faltaPostventa` (no hay línea `CI.PV`) y `fueraDeRango` (alguna tasa fuera de 0–100).
- `lib/bc-construction.ts` — `tasasSoportadas()` prueba una vez que el entorno publique los
  campos (el "sí" se cachea permanente; el "no" solo 5 min, para que un proceso que arrancó
  antes de publicar la extensión se recupere solo sin reiniciar) y `setTasasWork()` hace el
  PATCH, **lanzando antes si un porcentaje sale de 0–100**.
- `app/api/presupuesto/route.ts` — recalcula las tasas del lado del servidor sobre las mismas
  líneas recibidas (no confía en un número del cliente), no las manda si `fueraDeRango`, y
  reporta el resultado en `tasasBC`: `ok` · `pendiente` (el entorno no publica los campos) ·
  `fuera-de-rango` · `error`.
- `app/(protected)/presupuesto/page.tsx` — las muestra con la división a la vista en el paso 2,
  en el modal de confirmación **antes de enviar** y en el panel de resultado.

## Prueba de aceptación

```
GET .../api/adelante/construction/v1.0/companies({companyId})/works
      ?$top=1&$select=no,useCustomTax,taxPcnt,useCustomAfterSalesTax,afterSalesTaxPcnt
```

HTTP 200 con los 4 valores. Antes de la 1.2.7.0 respondía
`Could not find a property named 'taxPcnt' on type 'Microsoft.NAV.work'`.
