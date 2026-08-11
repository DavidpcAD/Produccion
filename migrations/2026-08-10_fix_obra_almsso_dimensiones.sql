/* ============================================================================
   Fix de datos: obra ALM-SSO (Seguridad ocupacional) — dimensiones AC/CC
   corruptas con sufijos basura.

   Diagnóstico (2026-08-10): una sola obra tenía valores mal grabados (edición
   vieja mal hecha; el guardado actual reemplaza, no concatena — no se repite):
     - areaCosteo  = 'IND VARasad'  → debe ser 'IND VAR'  (Indirectos Varios;
                     todos los códigos AC válidos son MAYÚSCULAS, sin cola).
     - centroCosto = 'ALM-SSOcc'    → debe ser 'ALM-SSO'  (regla del sistema:
                     el Centro de costo = N° de obra).

   Blast radius verificado: NINGUNA otra obra tiene minúsculas en areaCosteo ni
   centroCosto <> numeroObra. Se corrige solo esta fila.

   Idempotente: solo toca la fila si aún tiene el valor corrupto. Keyed por el
   N° de obra (llave de negocio estable en SBX y PRO), no por idObra.
   Correr sobre AdelanteSBX (y luego sobre PRO al desplegar).
   ============================================================================ */

UPDATE dbo.Obra
SET areaCosteo = 'IND VAR'
WHERE numeroObra = 'ALM-SSO' AND areaCosteo = 'IND VARasad';
GO

UPDATE dbo.Obra
SET centroCosto = 'ALM-SSO'
WHERE numeroObra = 'ALM-SSO' AND centroCosto = 'ALM-SSOcc';
GO
