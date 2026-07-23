# Migración Grupo B (AdelanteDB → AdelanteSBX)

Inventario de tablas/vistas que usan los 3 apps del "Grupo B" (Vite + Azure Functions +
Azure AD), hoy corriendo contra la base **`AdelanteDB`**. Este doc es para decidir qué se
crea en **`AdelanteSBX`** al reescribirlos dentro de Producción (Next.js).

Todos se conectan a `mysqladelante.database.windows.net` vía **Azure AD / Managed Identity**
(sin usuario/clave) y el nombre de base sale de `SQL_DATABASE`.

---

## Regla clave: hay DOS capas de tablas

1. **Schemas propios de cada app** (`obc`, `hor`, `lab`, `uti`) — las que la app **escribe**.
   Están aislados, **no chocan** con `dbo` de AdelanteSBX. Estos se crean limpio.
2. **Datos compartidos externos** (`dbo.*` corporativo, `bi.*` del datawarehouse, `app.*` del
   Flujo de Desembolsos) — las apps solo los **leen**. NO los crean ellas; vienen de OTROS
   sistemas (ventas corporativo, ETL de Business Central, Flujo de Desembolsos). **Este es el
   punto difícil**: no se pueden "crear vacíos", necesitan los datos fluyendo desde esos
   sistemas, y varios nombres (`dbo.Proyecto`, `dbo.Casos`...) pueden chocar con el modelo que
   ya tiene AdelanteSBX.

---

## 1. adelante-obrascontrol — schema `obc` (control de obras / avance / presupuesto)

**32 tablas** (6 con CREATE en el repo, 26 heredadas del dump original de Supabase — hay que
extraer su DDL de la BD viva) + **3 vistas**.

Tablas con DDL en el repo: `obc.obra_estado`, `obc.obra_pesos`, `obc.mo_nomina_semanal`,
`obc.mo_horas_obra`, `obc.mo_subcontratos`, `obc.avance_base_semanal`.

Tablas SIN DDL en el repo (sacar de la BD): `obc.partidas`, `obc.grupos_partida`,
`obc.sub_partidas`, `obc.sub_partida_tipos`, `obc.sub_partida_pesos_partida`,
`obc.sub_partida_pesos_sprint`, `obc.avance_sub_partidas`, `obc.avance_semanal_obra`,
`obc.semanas_operativas`, `obc.sprints_catalogo`, `obc.sprints_cerrados`,
`obc.tipo_casa_sprints`, `obc.tipo_construccion_sprints`, `obc.tipo_casa_config`,
`obc.tipos_casa`, `obc.plan_semanal`, `obc.cierres_produccion`,
`obc.cierre_produccion_snapshots`, `obc.causas_catalogo`, `obc.historial_estado_venta`,
`obc.obra_sub_partidas_excluidas`, `obc.control_nomina_semanal`, `obc.cortes_nomina`,
`obc.horas_obra_semanal`, `obc.subcontratos_obra_semanal`, `obc.usuarios_app`.

Vistas: `obc.vw_obras` (repo), `obc.vw_obra_scope_iniciado` (repo), `obc.vw_proyectos` (NO
está en repo — extraer de la BD).

Dependencias externas que debe existir en el destino:
- `bi.dim_obra`, `bi.fact_presupuesto`
- `dbo.V_CasosActivos`, `dbo.Modelos`, `dbo.Proyecto`, `dbo.Bloques`
- ⚠️ Los joins usan `COLLATE` explícito (`Modern_Spanish_CI_AI`) porque `dbo`/`bi` tienen
  collation distinta a `obc`. Respetar collations al recrear.

---

## 2. adelante-control-concreto — schemas `hor` + `lab` (concretos, plantas Blend)

**El más autocontenido.** ~16 tablas en `hor` + 9 en `lab` + 1 vista (`lab.v_ensayos_resumen`)
+ 1 SEQUENCE (`hor.seq_codigo_interno_colada`). Todas las 41 migraciones están en el repo.

`hor.*`: migraciones_aplicadas, plantas, materiales, recetas_bc, recetas_blend, coladas,
batches, batches_alarmas, cilindros, importaciones_csv, destinos_canonicos, destino_alias,
colada_batches, mapeo_recetas, umbrales_alerta, densidades_materiales.
(NO portar `hor.ensayos_cilindros` — se elimina en la migración 0012.)

`lab.*`: actividades, muestras, ensayos, mediciones, curva_teorica, fotos_muestra,
esclerometro_ensayos, esclerometro_rebotes, pin_acceso.

Datos "espejo" de BC viven en tablas locales (`hor.recetas_bc`, `hor.materiales`,
`recurso_bc` en `hor.plantas`) — no son dependencia externa.

Dependencia externa: **solo `bi.dim_obra`** (SELECT). Fotos van a Azure Blob, no a SQL.

---

## 3. adelante-utilidades — schema `uti` (reporte de utilidades)

**6 tablas + 15 vistas + 3 stored procedures.** Fuerte en vistas encadenadas; la vista núcleo
es `uti.v_movimientos_con_indirecto`.

`uti.*` tablas: migraciones_aplicadas, tipo_movimiento, comentarios_reporte, envios_reporte,
t_lote_presupuesto_bc (materializada), t_mejor_caso_lote (materializada).

SPs (pobla las materializadas, corre en ETL nocturno): `sp_refresh_lote_presupuesto_bc`,
`sp_refresh_mejor_caso_lote`, `sp_refresh_lookups_indirectos`.

**Dependencias externas (fuerte):**
- `dbo.UtilidadMovimiento`, `dbo.Movimientos`, `dbo.Lotes`, `dbo.Casos`, `dbo.Proyecto`
- `app.vw_utilidad_powerbi` ← vista clave del sistema **Flujo de Desembolsos** (~40 columnas)
- `bi.fact_presupuesto`, `bi.dim_obra`

Esta app es una **capa de reportería sobre otros sistemas**: sin esos `app.*`/`bi.*`/`dbo.*`
poblados, no calcula nada.

---

## Dependencias externas COMPARTIDAS (el verdadero trabajo)

| Objeto externo | Lo usa | Viene de |
|---|---|---|
| `bi.dim_obra` | obras, concreto, utilidades | ETL BI (Business Central) |
| `bi.fact_presupuesto` | obras, utilidades | ETL BI (Business Central) |
| `dbo.Proyecto` | obras, utilidades | Sistema corporativo de ventas |
| `dbo.Casos` / `dbo.V_CasosActivos` | obras, utilidades | Sistema corporativo de ventas |
| `dbo.Lotes`, `dbo.Movimientos` | utilidades | Sistema corporativo de ventas |
| `dbo.UtilidadMovimiento` | utilidades | Sistema corporativo (pool utilidad) |
| `dbo.Modelos`, `dbo.Bloques` | obras | Sistema corporativo de ventas |
| `app.vw_utilidad_powerbi` | utilidades | Flujo de Desembolsos |

⚠️ **Conflicto de nombres a resolver antes de unificar:** `dbo.Proyecto` (y `dbo.Casos`,
`dbo.Lotes`, `dbo.Modelos`) de AdelanteDB pueden NO ser los mismos que el modelo de
obras/proyectos que ya tiene AdelanteSBX (ControlUsuarios). La app de obras/utilidades espera
columnas específicas (`AbreviaturaProyecto`, `TgDesarrollos`, `IDProyecto`...).

---

## Decisión pendiente: ¿cuál es la base destino?

`AdelanteSBX` suena a **sandbox**; `AdelanteDB` parece la base "real" que YA tiene todo el
modelo corporativo (`dbo.*`) y el datawarehouse (`bi.*`) que el Grupo B necesita. Opciones:

- **(a)** Apuntar el app unificado a `AdelanteDB` (ya tiene los datos compartidos) y llevar ahí
  también el modelo de usuarios/roles de ControlUsuarios.
- **(b)** Replicar en `AdelanteSBX` los schemas propios (`obc/hor/lab/uti`) **y** todo el
  modelo compartido `dbo/bi/app` + sus ETLs. Mucho más grande.
- **(c)** Dejar los datos compartidos donde están y hacer que el app lea cross-database.

Hay que confirmar **qué contiene hoy cada base** antes de elegir.

---

## Hallazgo (investigación de bases + ETLs)

Estado real de cada base en `mysqladelante`:

| | AdelanteSBX (dev) | AdelantePRO (prod) | AdelanteDB (legacy) |
|---|:--:|:--:|:--:|
| Auth ControlUsuarios (dbo.Usuario/Colaborador/Rol) | ✅ | ✅ | ❌ |
| Schemas Grupo B (obc/hor/lab/uti) | ❌ | ❌ | ✅ |
| `bi.*` (datawarehouse) + `app.*` (Flujo Desembolsos) | ❌ | ❌ | ✅ 47 + 49 obj |
| `dbo` ventas (Casos/Lotes/Proyecto/Movimientos/...) | ❌ | ❌ | ✅ 318 obj |

Todo el mundo de negocio del Grupo B vive SOLO en AdelanteDB; el auth nuevo solo en SBX/PRO.

**Los 3 sistemas que alimentan los datos compartidos (todos escriben a AdelanteDB):**

| Repo | Sistema | Escribe | Dispara |
|---|---|---|---|
| `LRNAVARRO83/adelante-bi-etl` | ETL de BI (Python + Azure Function) | `bi.*` vía SPs `sp_load_*` que jalan de Business Central (OData) + `dbo` | Timer diario 3AM |
| `LRNAVARRO83/adelante-flujo-desembolsos` | Flujo de Desembolsos (Functions + React) | dueño de `app.*`; escribe `dbo.UtilidadMovimiento` | App web transaccional |
| `dnjarchitecture/adventas` | Sistema de ventas corporativo (.NET) | dueño de `dbo` ventas (Casos/Lotes/Proyecto/...) | App web transaccional |

Notas: `adventas` reusa el ecosistema **ArquiFlow** (repo `arqui-flow` NO accesible — privado/otra cuenta) y varias tablas `dbo` las mantiene **Power Apps**. Portal cliente `adclientes` también comparte AdelanteDB.

**Acoplamiento (conclusión):** mover TODA AdelanteDB a otra base es barato (solo env vars en los 3 sistemas). **Desmembrar** los schemas en bases distintas es caro: el BI-ETL corre en stored procedures `sp_load_*` DENTRO de AdelanteDB con JOINs cross-schema `dbo→stg→bi`; separar `bi` de `dbo` los rompe. **Regla: `dbo` + `bi` + `app` deben quedar juntos en una misma base.**

⚠️ Conflicto `dbo.Proyecto`: el de AdelanteDB (ventas/Adventas, 14 filas) NO es el mismo que el de SBX/PRO (modelo ControlUsuarios). Coexisten por nombre pero difieren.

### Estrategias coherentes
- **Dual-DB (para avanzar ya):** Produccion con 2 conexiones — auth + Grupo A en SBX/PRO, Grupo B en AdelanteDB. Los módulos son independientes (no requieren JOIN cross-DB: auth valida en SBX, negocio consulta AdelanteDB). Sin migración de datos ni repunte de ETLs. Se consolida después.
- **Produccion sobre AdelanteDB:** llevar el auth de ControlUsuarios a AdelanteDB y correr todo ahí. Una sola base, pero es la legacy que se quería dejar; resolver el choque `dbo.Proyecto`.
- **Migración de plataforma a PRO:** mover ventas + flujo + bi-etl + Grupo B a PRO (coordinando con esos equipos/repos) y correr Produccion sobre PRO. End-state limpio, esfuerzo grande, depende de otros equipos.
