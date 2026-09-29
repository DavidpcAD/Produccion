/* ARMA el catálogo completo en dbo (AdelantePRO y AdelanteSBX), ADITIVO:
   - Estructura: dbo.TipoObra / TipoObraAreaCosteo / TipoCasa / SubPartidaTipoCasa nuevas;
     Etapa +tipoObra/bcTaskNo/bcWorksNo/orden; Partida +bcTaskNo; ensanches; numSprint NULL.
   - Datos desde el catálogo VIVO (h4 de AdelantePRO): vivienda se corresponde con las filas
     que dbo ya tiene (ids 1..94 heredados + por código), lo demás se INSERTA con ids nuevos.
   - Las filas propias de H4 (CO-*, F-*, INF-*…) NO se tocan: quedan bajo el tipo H4_LEGADO
     (inactivo → la app no lo muestra, H4 las sigue referenciando).
   - Boletas: las 3 vistas b0 pasan a filtrar esPosting=1 (los códigos ya no son únicos).
   MODO=ensayo revierte todo. */
import sql from '/Users/davidpc/Desktop/Produccion/node_modules/mssql/index.js';
import { readFileSync } from 'node:fs';
const raw = readFileSync('/Users/davidpc/Desktop/Produccion/.env.local', 'utf8');
for (const l of raw.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim(); }
const MODO = process.env.MODO;
if (MODO !== 'ensayo' && MODO !== 'real') throw new Error('MODO=ensayo|real');

const open = (db) => new sql.ConnectionPool({ server: process.env.DB_SERVER, database: db,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, port: 1433,
  connectionTimeout: 60000, requestTimeout: 600000, options: { encrypt: true, trustServerCertificate: false } }).connect();

const j = (rows) => JSON.stringify(rows);
const CHUNK = 1500;

(async () => {
  const pro = await open('AdelantePRO');
  const sbx = await open('AdelanteSBX');

  // ---------- FUENTE: el catálogo vivo (h4 de AdelantePRO) ----------
  const src = {};
  for (const [k, q] of Object.entries({
    tipos: 'SELECT codigo, letra, nombre, termino_grupo, termino_grupo_pl, usa_sprints, usa_tipos_casa, genero, orden, activo FROM h4.tipos_obra',
    areas: 'SELECT area_costeo, tipo_obra FROM h4.tipo_obra_area_costeo',
    tiposCasa: 'SELECT codigo, descripcion, niveles, activo FROM h4.tipos_casa',
    grupos: 'SELECT id, codigo, nombre, orden, activo, tipo_obra, bc_task_no, bc_works_no FROM h4.grupos_partida',
    partidas: 'SELECT p.id, p.codigo, p.nombre, p.grupo_id, p.orden, p.activo, p.bc_task_no FROM h4.partidas p',
    subs: 'SELECT id, codigo, nombre, partida_id, sprint_numero, es_critica, descripcion, activo FROM h4.sub_partidas',
    subTipos: 'SELECT sub_partida_id, tipo_casa FROM h4.sub_partida_tipos',
  })) src[k] = (await pro.request().query(q)).recordset;
  console.log(`Fuente h4@PRO: ${src.tipos.length} tipos · ${src.grupos.length} etapas · ${src.partidas.length} partidas · ${src.subs.length} subpartidas · ${src.subTipos.length} sub-tipos\n`);

  async function armar(pool, base) {
    const tx = new sql.Transaction(pool);
    await tx.begin();
    const rq = () => new sql.Request(tx);
    const uno = async (q) => (await rq().query(q)).recordset;
    try {
      await rq().query('SET LOCK_TIMEOUT 30000');
      // Las #temp van en un BATCH de sesión: node-mssql corre .query() vía sp_executesql
      // y una #tabla creada ahí adentro muere al salir de esa llamada.
      await rq().batch(`
        CREATE TABLE #g (cat_id int PRIMARY KEY, codigo varchar(50), nombre nvarchar(100), orden smallint, activo bit, tipo varchar(20), bcTaskNo varchar(50), bcWorksNo varchar(20));
        CREATE TABLE #mapG (cat_id int PRIMARY KEY, dbo_id int NOT NULL);
        CREATE TABLE #p (cat_id int PRIMARY KEY, codigo varchar(50), nombre nvarchar(100), grupo_cat int, orden smallint, activo bit, bcTaskNo varchar(50));
        CREATE TABLE #mapP (cat_id int PRIMARY KEY, dbo_id int NOT NULL);
        CREATE TABLE #s (cat_id int PRIMARY KEY, codigo varchar(50), nombre nvarchar(150), partida_cat int, numSprint smallint, esCritica bit, descripcion nvarchar(max), activo bit);
        CREATE TABLE #mapS (cat_id int PRIMARY KEY, dbo_id int NOT NULL);`);
      // Foto de las vistas de Boletas: tienen que devolver LO MISMO al final.
      const vb = {};
      for (const v of ['V_BoletaSalida', 'V_BoletaEntrega', 'V_BoletaTraslado'])
        vb[v] = (await uno(`SELECT COUNT(*) AS n FROM b0.${v}`))[0].n;

      /* ---------- 1) ESTRUCTURA ---------- */
      await rq().query(`
        IF OBJECT_ID('dbo.TipoObra') IS NULL
          CREATE TABLE dbo.TipoObra (
            codigo varchar(20) NOT NULL CONSTRAINT pk_tipoObra PRIMARY KEY,
            letra char(1) NOT NULL CONSTRAINT uq_tipoObra_letra UNIQUE,
            nombre nvarchar(60) NOT NULL,
            terminoGrupo nvarchar(20) NOT NULL, terminoGrupoPl nvarchar(20) NOT NULL,
            usaSprints bit NOT NULL CONSTRAINT df_tipoObra_usaSprints DEFAULT (0),
            usaTiposCasa bit NOT NULL CONSTRAINT df_tipoObra_usaTiposCasa DEFAULT (0),
            genero char(1) NOT NULL CONSTRAINT df_tipoObra_genero DEFAULT ('F'),
            orden smallint NOT NULL,
            esActivo bit NOT NULL CONSTRAINT df_tipoObra_esActivo DEFAULT (1),
            fechaCreacion datetime2 NOT NULL CONSTRAINT df_tipoObra_fechaCreacion DEFAULT (SYSUTCDATETIME()))`);
      await rq().query(`
        IF OBJECT_ID('dbo.TipoObraAreaCosteo') IS NULL
          CREATE TABLE dbo.TipoObraAreaCosteo (
            areaCosteo varchar(50) NOT NULL CONSTRAINT pk_tipoObraAreaCosteo PRIMARY KEY,
            tipoObra varchar(20) NOT NULL CONSTRAINT fk_tipoObraAreaCosteo_tipoObra REFERENCES dbo.TipoObra (codigo))`);
      await rq().query(`
        IF OBJECT_ID('dbo.TipoCasa') IS NULL
          CREATE TABLE dbo.TipoCasa (
            codigo varchar(20) NOT NULL CONSTRAINT pk_tipoCasa PRIMARY KEY,
            descripcion nvarchar(100) NOT NULL, niveles tinyint NOT NULL,
            esActivo bit NOT NULL CONSTRAINT df_tipoCasa_esActivo DEFAULT (1),
            fechaCreacion datetime2 NOT NULL CONSTRAINT df_tipoCasa_fechaCreacion DEFAULT (SYSUTCDATETIME()))`);
      await rq().query(`
        IF OBJECT_ID('dbo.SubPartidaTipoCasa') IS NULL
          CREATE TABLE dbo.SubPartidaTipoCasa (
            idSubPartida int NOT NULL CONSTRAINT fk_subPartidaTipoCasa_subPartida REFERENCES dbo.SubPartida (idSubPartida),
            tipoCasa varchar(20) NOT NULL CONSTRAINT fk_subPartidaTipoCasa_tipoCasa REFERENCES dbo.TipoCasa (codigo),
            CONSTRAINT pk_subPartidaTipoCasa PRIMARY KEY (idSubPartida, tipoCasa))`);
      await rq().query(`
        IF COL_LENGTH('dbo.Etapa','tipoObra')  IS NULL ALTER TABLE dbo.Etapa ADD tipoObra varchar(20) NULL;
        IF COL_LENGTH('dbo.Etapa','bcTaskNo')  IS NULL ALTER TABLE dbo.Etapa ADD bcTaskNo varchar(50) NULL;
        IF COL_LENGTH('dbo.Etapa','bcWorksNo') IS NULL ALTER TABLE dbo.Etapa ADD bcWorksNo varchar(20) NULL;
        IF COL_LENGTH('dbo.Etapa','orden')     IS NULL ALTER TABLE dbo.Etapa ADD orden smallint NULL;
        IF COL_LENGTH('dbo.Partida','bcTaskNo') IS NULL ALTER TABLE dbo.Partida ADD bcTaskNo varchar(50) NULL;`);
      // Los únicos por código pueden ser CONSTRAINT o INDEX según la base: soltar el que sea.
      await rq().query(`
        IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='uq_etapa_codigo' AND object_id=OBJECT_ID('dbo.Etapa') AND is_unique_constraint=1)
          ALTER TABLE dbo.Etapa DROP CONSTRAINT uq_etapa_codigo;
        ELSE IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='uq_etapa_codigo' AND object_id=OBJECT_ID('dbo.Etapa'))
          DROP INDEX uq_etapa_codigo ON dbo.Etapa;
        IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='uq_partida_codigo' AND object_id=OBJECT_ID('dbo.Partida') AND is_unique_constraint=1)
          ALTER TABLE dbo.Partida DROP CONSTRAINT uq_partida_codigo;
        ELSE IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='uq_partida_codigo' AND object_id=OBJECT_ID('dbo.Partida'))
          DROP INDEX uq_partida_codigo ON dbo.Partida;`);
      await rq().query(`
        IF COL_LENGTH('dbo.Etapa','codigo')   < 50  ALTER TABLE dbo.Etapa   ALTER COLUMN codigo varchar(50) NOT NULL;
        IF COL_LENGTH('dbo.Partida','codigo') < 50  ALTER TABLE dbo.Partida ALTER COLUMN codigo varchar(50) NOT NULL;
        IF COL_LENGTH('dbo.SubPartida','nombre') < 300 ALTER TABLE dbo.SubPartida ALTER COLUMN nombre nvarchar(150) NOT NULL;
        IF COL_LENGTH('dbo.SubPartida','descripcion') <> -1 ALTER TABLE dbo.SubPartida ALTER COLUMN descripcion nvarchar(max) NULL;
        IF COLUMNPROPERTY(OBJECT_ID('dbo.SubPartida'),'numSprint','AllowsNull') = 0 ALTER TABLE dbo.SubPartida ALTER COLUMN numSprint smallint NULL;`);

      /* ---------- 2) TIPOS ---------- */
      const tiposVals = src.tipos.map((t) =>
        `('${t.codigo}','${t.letra}',N'${t.nombre.replace(/'/g, "''")}',N'${t.termino_grupo}',N'${t.termino_grupo_pl}',${t.usa_sprints ? 1 : 0},${t.usa_tipos_casa ? 1 : 0},'${t.genero}',${t.orden},${t.activo ? 1 : 0})`)
        .concat([`('H4_LEGADO','X',N'H4 (catálogo legado)',N'Etapa',N'Etapas',0,0,'F',99,0)`]).join(',');
      await rq().query(`
        MERGE dbo.TipoObra AS d
        USING (VALUES ${tiposVals}) AS s (codigo, letra, nombre, terminoGrupo, terminoGrupoPl, usaSprints, usaTiposCasa, genero, orden, esActivo)
        ON d.codigo = s.codigo
        WHEN MATCHED THEN UPDATE SET d.letra=s.letra, d.nombre=s.nombre, d.terminoGrupo=s.terminoGrupo, d.terminoGrupoPl=s.terminoGrupoPl,
          d.usaSprints=s.usaSprints, d.usaTiposCasa=s.usaTiposCasa, d.genero=s.genero, d.orden=s.orden, d.esActivo=s.esActivo
        WHEN NOT MATCHED THEN INSERT (codigo, letra, nombre, terminoGrupo, terminoGrupoPl, usaSprints, usaTiposCasa, genero, orden, esActivo)
          VALUES (s.codigo, s.letra, s.nombre, s.terminoGrupo, s.terminoGrupoPl, s.usaSprints, s.usaTiposCasa, s.genero, s.orden, s.esActivo);`);
      await rq().query(`
        MERGE dbo.TipoObraAreaCosteo AS d
        USING (VALUES ${src.areas.map((a) => `('${a.area_costeo.replace(/'/g, "''")}','${a.tipo_obra}')`).join(',')}) AS s (areaCosteo, tipoObra)
        ON d.areaCosteo = s.areaCosteo
        WHEN MATCHED THEN UPDATE SET d.tipoObra = s.tipoObra
        WHEN NOT MATCHED THEN INSERT (areaCosteo, tipoObra) VALUES (s.areaCosteo, s.tipoObra);`);
      await rq().query(`
        MERGE dbo.TipoCasa AS d
        USING (VALUES ${src.tiposCasa.map((t) => `('${t.codigo}',N'${t.descripcion.replace(/'/g, "''")}',${t.niveles},${t.activo ? 1 : 0})`).join(',')}) AS s (codigo, descripcion, niveles, esActivo)
        ON d.codigo = s.codigo
        WHEN MATCHED THEN UPDATE SET d.descripcion=s.descripcion, d.niveles=s.niveles, d.esActivo=s.esActivo
        WHEN NOT MATCHED THEN INSERT (codigo, descripcion, niveles, esActivo) VALUES (s.codigo, s.descripcion, s.niveles, s.esActivo);`);

      /* ---------- 3) ETAPAS ---------- */
      // Staging de los grupos del catálogo
      for (let i = 0; i < src.grupos.length; i += CHUNK)
        await rq().input('j', sql.NVarChar(sql.MAX), j(src.grupos.slice(i, i + CHUNK)))
          .query(`INSERT INTO #g SELECT id, codigo, nombre, orden, activo, tipo_obra, bc_task_no, bc_works_no
                  FROM OPENJSON(@j) WITH (id int, codigo varchar(50), nombre nvarchar(100), orden smallint, activo bit, tipo_obra varchar(20), bc_task_no varchar(50), bc_works_no varchar(20))`);
      // Herencia vivienda: 1→gris, 2→acabados, 3→electro, EXT→extras (si existe)
      await rq().query(`
        INSERT INTO #mapG (cat_id, dbo_id)
        SELECT g.cat_id, e.id
        FROM #g g JOIN dbo.Etapa e ON e.codigo = CASE g.codigo WHEN 'gris' THEN '1' WHEN 'acabados' THEN '2' WHEN 'electro' THEN '3' WHEN 'extras' THEN 'EXT' END
        WHERE g.tipo = 'VIVIENDA' AND g.bcWorksNo IS NULL AND g.codigo IN ('gris','acabados','electro','extras');
        -- por si esta migración ya corrió: los códigos ya serían los del catálogo
        INSERT INTO #mapG (cat_id, dbo_id)
        SELECT g.cat_id, e.id FROM #g g JOIN dbo.Etapa e ON e.codigo = g.codigo AND ISNULL(e.tipoObra,'VIVIENDA') = g.tipo AND ISNULL(e.bcWorksNo,'') = ISNULL(g.bcWorksNo,'')
        WHERE NOT EXISTS (SELECT 1 FROM #mapG m WHERE m.cat_id = g.cat_id) AND e.id NOT IN (SELECT dbo_id FROM #mapG);
        UPDATE e SET e.codigo = g.codigo, e.nombre = g.nombre, e.activo = g.activo, e.tipoObra = g.tipo,
                     e.bcTaskNo = g.bcTaskNo, e.bcWorksNo = g.bcWorksNo, e.orden = g.orden
        FROM dbo.Etapa e JOIN #mapG m ON m.dbo_id = e.id JOIN #g g ON g.cat_id = m.cat_id;
        -- lo preexistente que no corresponde al catálogo = mundo propio de H4
        UPDATE dbo.Etapa SET tipoObra = 'H4_LEGADO' WHERE tipoObra IS NULL;
        -- el resto del catálogo entra nuevo
        MERGE dbo.Etapa AS d
        USING (SELECT g.* FROM #g g WHERE NOT EXISTS (SELECT 1 FROM #mapG m WHERE m.cat_id = g.cat_id)) AS s
        ON 1 = 0
        WHEN NOT MATCHED THEN INSERT (codigo, nombre, activo, tipoObra, bcTaskNo, bcWorksNo, orden)
          VALUES (s.codigo, s.nombre, s.activo, s.tipo, s.bcTaskNo, s.bcWorksNo, s.orden)
        OUTPUT s.cat_id, INSERTED.id INTO #mapG (cat_id, dbo_id);`);

      /* ---------- 4) PARTIDAS ---------- */
      for (let i = 0; i < src.partidas.length; i += CHUNK)
        await rq().input('j', sql.NVarChar(sql.MAX), j(src.partidas.slice(i, i + CHUNK)))
          .query(`INSERT INTO #p SELECT id, codigo, nombre, grupo_id, orden, activo, bc_task_no
                  FROM OPENJSON(@j) WITH (id int, codigo varchar(50), nombre nvarchar(100), grupo_id int, orden smallint, activo bit, bc_task_no varchar(50))`);
      await rq().query(`
        -- correspondencia por código dentro de la etapa YA mapeada (cualquier tipo:
        -- así la corrida es repetible), más el caso vivienda de partidas movidas de etapa
        INSERT INTO #mapP (cat_id, dbo_id)
        SELECT p.cat_id, MIN(d.idPartida)
        FROM #p p JOIN #mapG mg ON mg.cat_id = p.grupo_cat
        JOIN #g g ON g.cat_id = p.grupo_cat
        JOIN dbo.Partida d ON d.codigo = p.codigo AND (
             d.idEtapa = mg.dbo_id
             OR (g.tipo = 'VIVIENDA' AND g.bcWorksNo IS NULL AND d.idEtapa IN (SELECT mx.dbo_id FROM #mapG mx JOIN #g gx ON gx.cat_id = mx.cat_id WHERE gx.tipo = 'VIVIENDA' AND gx.bcWorksNo IS NULL)))
        GROUP BY p.cat_id;
        UPDATE d SET d.codigo = p.codigo, d.nombre = p.nombre, d.idEtapa = mg.dbo_id, d.esActivo = p.activo,
                     d.orden = p.orden, d.bcTaskNo = p.bcTaskNo,
                     d.esPosting = CASE WHEN g.tipo = 'VIVIENDA' AND g.bcWorksNo IS NULL THEN 1 ELSE 0 END
        FROM dbo.Partida d JOIN #mapP m ON m.dbo_id = d.idPartida JOIN #p p ON p.cat_id = m.cat_id
        JOIN #mapG mg ON mg.cat_id = p.grupo_cat JOIN #g g ON g.cat_id = p.grupo_cat;
        MERGE dbo.Partida AS d
        USING (SELECT p.cat_id, p.codigo, p.nombre, mg.dbo_id AS etapa, p.orden, p.activo, p.bcTaskNo,
                      CASE WHEN g.tipo = 'VIVIENDA' AND g.bcWorksNo IS NULL THEN 1 ELSE 0 END AS esPosting
               FROM #p p JOIN #mapG mg ON mg.cat_id = p.grupo_cat JOIN #g g ON g.cat_id = p.grupo_cat
               WHERE NOT EXISTS (SELECT 1 FROM #mapP m WHERE m.cat_id = p.cat_id)) AS s
        ON 1 = 0
        WHEN NOT MATCHED THEN INSERT (codigo, nombre, idEtapa, orden, esActivo, bcTaskNo, esPosting)
          VALUES (s.codigo, s.nombre, s.etapa, s.orden, s.activo, s.bcTaskNo, s.esPosting)
        OUTPUT s.cat_id, INSERTED.idPartida INTO #mapP (cat_id, dbo_id);`);

      /* ---------- 5) SUBPARTIDAS ---------- */
      for (let i = 0; i < src.subs.length; i += CHUNK)
        await rq().input('j', sql.NVarChar(sql.MAX), j(src.subs.slice(i, i + CHUNK)))
          .query(`INSERT INTO #s SELECT id, codigo, nombre, partida_id, sprint_numero, es_critica, descripcion, activo
                  FROM OPENJSON(@j) WITH (id int, codigo varchar(50), nombre nvarchar(150), partida_id int, sprint_numero smallint, es_critica bit, descripcion nvarchar(max), activo bit)`);
      await rq().query(`
        -- 5a) herencia por ID (1..94): dbo y el catálogo comparten esas filas de vivienda
        INSERT INTO #mapS (cat_id, dbo_id)
        SELECT s.cat_id, d.idSubPartida FROM #s s JOIN dbo.SubPartida d ON d.idSubPartida = s.cat_id
        WHERE s.cat_id <= 94;
        -- 5b) por código, para las que dbo ya tenía con otro id (4.2.x, 2.4.x de ayer)
        INSERT INTO #mapS (cat_id, dbo_id)
        SELECT s.cat_id, MIN(d.idSubPartida)
        FROM #s s JOIN #mapP mp ON mp.cat_id = s.partida_cat
        JOIN dbo.SubPartida d ON d.codigo = s.codigo AND d.idPartida = mp.dbo_id
        WHERE NOT EXISTS (SELECT 1 FROM #mapS m WHERE m.cat_id = s.cat_id)
          AND d.idSubPartida NOT IN (SELECT dbo_id FROM #mapS)
        GROUP BY s.cat_id;
        UPDATE d SET d.codigo = s.codigo, d.nombre = s.nombre, d.idPartida = mp.dbo_id,
                     d.numSprint = s.numSprint, d.esCritica = s.esCritica, d.descripcion = s.descripcion, d.esActivo = s.activo
        FROM dbo.SubPartida d JOIN #mapS m ON m.dbo_id = d.idSubPartida JOIN #s s ON s.cat_id = m.cat_id JOIN #mapP mp ON mp.cat_id = s.partida_cat;
        MERGE dbo.SubPartida AS d
        USING (SELECT s.cat_id, s.codigo, s.nombre, mp.dbo_id AS partida, s.numSprint, s.esCritica, s.descripcion, s.activo
               FROM #s s JOIN #mapP mp ON mp.cat_id = s.partida_cat
               WHERE NOT EXISTS (SELECT 1 FROM #mapS m WHERE m.cat_id = s.cat_id)) AS s
        ON 1 = 0
        WHEN NOT MATCHED THEN INSERT (codigo, nombre, idPartida, numSprint, esCritica, descripcion, esActivo, fechaCreacion)
          VALUES (s.codigo, s.nombre, s.partida, s.numSprint, s.esCritica, s.descripcion, s.activo, SYSUTCDATETIME())
        OUTPUT s.cat_id, INSERTED.idSubPartida INTO #mapS (cat_id, dbo_id);`);

      /* ---------- 6) TIPOS DE CASA POR SUBPARTIDA ---------- */
      for (let i = 0; i < src.subTipos.length; i += CHUNK)
        await rq().input('j', sql.NVarChar(sql.MAX), j(src.subTipos.slice(i, i + CHUNK)))
          .query(`INSERT INTO dbo.SubPartidaTipoCasa (idSubPartida, tipoCasa)
                  SELECT m.dbo_id, o.tipo_casa
                  FROM OPENJSON(@j) WITH (sub_partida_id int, tipo_casa varchar(20)) o
                  JOIN #mapS m ON m.cat_id = o.sub_partida_id
                  WHERE NOT EXISTS (SELECT 1 FROM dbo.SubPartidaTipoCasa x WHERE x.idSubPartida = m.dbo_id AND x.tipoCasa = o.tipo_casa)`);

      /* ---------- 7) Etapa.tipoObra NOT NULL + FK + únicos nuevos ---------- */
      await rq().query(`
        IF COLUMNPROPERTY(OBJECT_ID('dbo.Etapa'),'tipoObra','AllowsNull') = 1 ALTER TABLE dbo.Etapa ALTER COLUMN tipoObra varchar(20) NOT NULL;
        IF OBJECT_ID('dbo.fk_etapa_tipoObra','F') IS NULL ALTER TABLE dbo.Etapa ADD CONSTRAINT fk_etapa_tipoObra FOREIGN KEY (tipoObra) REFERENCES dbo.TipoObra (codigo);
        IF INDEXPROPERTY(OBJECT_ID('dbo.Etapa'),'ux_etapa_tipoObra_codigo','IndexID') IS NULL CREATE UNIQUE INDEX ux_etapa_tipoObra_codigo ON dbo.Etapa (tipoObra, bcWorksNo, codigo);
        IF INDEXPROPERTY(OBJECT_ID('dbo.Partida'),'ux_partida_etapa_codigo','IndexID') IS NULL CREATE UNIQUE INDEX ux_partida_etapa_codigo ON dbo.Partida (idEtapa, codigo);
        IF INDEXPROPERTY(OBJECT_ID('dbo.SubPartida'),'ix_subPartida_partida','IndexID') IS NULL CREATE INDEX ix_subPartida_partida ON dbo.SubPartida (idPartida);`);

      /* ---------- 8) Vistas de Boletas: solo partidas Posting (vivienda) ---------- */
      for (const [v, patrones] of [
        ['V_BoletaSalida',   ['ON p.codigo = bs.taskNo']],
        ['V_BoletaEntrega',  ['ON p.codigo = bs.taskNo']],
        ['V_BoletaTraslado', ['ON po.codigo = t.taskNoOrigen', 'ON pd.codigo = t.taskNoDestino']],
      ]) {
        const d = (await uno(`SELECT OBJECT_DEFINITION(OBJECT_ID('b0.${v}')) AS def`))[0]?.def;
        if (!d) { console.log(`${base}: b0.${v} no existe, se salta`); continue; }
        if (d.includes('esPosting')) continue;
        let def = d;
        let okTodos = true;
        for (const p of patrones) {
          if (!def.includes(p)) { okTodos = false; break; }
          def = def.split(p).join(`${p} AND ${p.includes('po.') ? 'po' : p.includes('pd.') ? 'pd' : 'p'}.esPosting = 1`);
        }
        if (!okTodos) throw new Error(`${base}: b0.${v} no tiene el JOIN esperado; revisar a mano.`);
        def = def.replace(/CREATE\s+VIEW/i, 'ALTER VIEW');
        await rq().batch(def);
      }

      /* ---------- 9) VERIFICACIÓN ---------- */
      const conteo = await uno(`
        SELECT e.tipoObra, COUNT(DISTINCT e.id) AS etapas, COUNT(DISTINCT p.idPartida) AS partidas, COUNT(DISTINCT sp.idSubPartida) AS subpartidas
        FROM dbo.Etapa e
        LEFT JOIN dbo.Partida p ON p.idEtapa = e.id AND p.esActivo = 1
        LEFT JOIN dbo.SubPartida sp ON sp.idPartida = p.idPartida AND sp.esActivo = 1
        WHERE e.activo = 1 GROUP BY e.tipoObra ORDER BY e.tipoObra`);
      for (const c of conteo) console.log(`${base}  ${String(c.tipoObra).padEnd(14)} ${String(c.etapas).padStart(4)} etapas ${String(c.partidas).padStart(5)} partidas ${String(c.subpartidas).padStart(6)} subpartidas`);
      // el catálogo tiene que estar completo: cada fila fuente con su fila dbo
      const faltan = await uno(`
        SELECT (SELECT COUNT(*) FROM #g WHERE cat_id NOT IN (SELECT cat_id FROM #mapG)) AS g,
               (SELECT COUNT(*) FROM #p WHERE cat_id NOT IN (SELECT cat_id FROM #mapP)) AS p,
               (SELECT COUNT(*) FROM #s WHERE cat_id NOT IN (SELECT cat_id FROM #mapS)) AS s`);
      if (faltan[0].g || faltan[0].p || faltan[0].s) throw new Error(`${base}: quedaron sin migrar ${faltan[0].g} etapas / ${faltan[0].p} partidas / ${faltan[0].s} subpartidas`);
      const stc = await uno(`SELECT COUNT(*) AS n FROM dbo.SubPartidaTipoCasa`);
      // Boletas intactas
      for (const v of Object.keys(vb)) {
        const n = (await uno(`SELECT COUNT(*) AS n FROM b0.${v}`))[0].n;
        if (n !== vb[v]) throw new Error(`${base}: b0.${v} cambió de ${vb[v]} a ${n} filas`);
      }
      console.log(`${base}  sub-tipos de casa: ${stc[0].n} · vistas de Boletas: mismas filas (${Object.values(vb).join('/')}) · fuente 100% migrada`);

      if (MODO === 'real') { await tx.commit(); console.log(`${base}: CONFIRMADO\n`); }
      else { await tx.rollback(); console.log(`${base}: ensayo revertido\n`); }
    } catch (e) { await tx.rollback().catch(() => {}); throw e; }
  }

  try {
    await armar(pro, 'PRO');
    await armar(sbx, 'SBX');
    console.log(MODO === 'real' ? 'LISTO: dbo armado en las dos bases.' : 'ENSAYO OK en las dos bases.');
  } catch (e) { console.error('\nERROR:', e.message); process.exitCode = 1; }
  finally { await pro.close(); await sbx.close(); }
})();
