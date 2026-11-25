// Teléfonos con la app de maquinaria: el registro que manda la app al abrir, la
// lista que pinta Mantenimiento → App móvil, la ubicación de cada envío y el
// aviso (push) de versión nueva.
//
// Quién ve qué en la web:
//   · Super Admin de Producción → todo, y es el único que reparte versiones.
//   · Rol Mantenimiento (Steven) → la lista de teléfonos, quién los usa y cuándo
//     se conectaron. Sin ubicaciones ni botones.
import { NextResponse } from 'next/server';
import { getSession, type JWTPayload } from '@/lib/auth';
import { getDb, sql } from '@/lib/db';
import { listarPublicaciones } from './updates';

export const PLATAFORMA = 'android';

// ─── Quién mira la pantalla ─────────────────────────────────────────────────

export interface VisorWeb {
  sesion: JWTPayload;
  /** Super Admin: reparte versiones, marca teléfonos de prueba y ve ubicaciones. */
  puedeRepartir: boolean;
}

/**
 * Sesión web (cookie) de quien abre la pantalla. /api/movil/* no pasa por el
 * proxy, así que el chequeo va acá. El módulo 'admin' solo lo da el comodín del
 * Super Admin de Producción (ningún otro rol lo trae), así que es la marca exacta
 * de "superadmin"; nivelAdmin 4 no sirve porque también lo da un "Administrador"
 * de otra app.
 */
export async function visorWeb(): Promise<{ visor: VisorWeb; error?: undefined } | { visor?: undefined; error: NextResponse }> {
  const s = await getSession();
  if (!s || !s.idUsuario) return { error: NextResponse.json({ error: 'Sin sesión' }, { status: 401 }) };
  const modulos = s.modules ?? [];
  const puedeRepartir = modulos.includes('admin');
  if (!puedeRepartir && !modulos.includes('mantenimiento')) {
    return { error: NextResponse.json({ error: 'Esta pantalla es de Mantenimiento.' }, { status: 403 }) };
  }
  return { visor: { sesion: s, puedeRepartir } };
}

// ─── Registro que manda la app ──────────────────────────────────────────────

export type EstadoPermiso = 'concedido' | 'negado' | 'sin-preguntar';

export interface Ubicacion {
  latitud: number;
  longitud: number;
  precisionM: number | null;
  capturadaUtc: string;
}

export interface RegistroTelefono {
  identificador: string;
  marca: string | null;
  modelo: string | null;
  nombreEquipo: string | null;
  versionSO: string | null;
  versionApp: string | null;
  compilacion: string | null;
  publicacion: string | null;
  runtimeVersion: string | null;
  pushToken: string | null;
  permisos: { ubicacion: EstadoPermiso | null; camara: EstadoPermiso | null; notificaciones: EstadoPermiso | null };
  ubicacion: Ubicacion | null;
}

const texto = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

const permiso = (v: unknown): EstadoPermiso | null =>
  v === 'concedido' || v === 'negado' || v === 'sin-preguntar' ? v : null;

/** Ubicación que manda la app, o null si no viene o no tiene sentido. */
export function leerUbicacion(v: unknown): Ubicacion | null {
  const o = v as { latitud?: unknown; longitud?: unknown; precisionM?: unknown; capturadaUtc?: unknown } | null;
  if (!o || typeof o !== 'object') return null;
  const lat = Number(o.latitud);
  const lng = Number(o.longitud);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  const prec = Number(o.precisionM);
  const fecha = typeof o.capturadaUtc === 'string' ? new Date(o.capturadaUtc) : null;
  // Una fecha del futuro o de hace más de un día no es de este envío: se usa la de ahora.
  const ahora = Date.now();
  const valida = fecha && !Number.isNaN(fecha.getTime()) && fecha.getTime() <= ahora + 5 * 60_000 && ahora - fecha.getTime() < 86_400_000;
  return {
    latitud: Math.round(lat * 1e6) / 1e6,
    longitud: Math.round(lng * 1e6) / 1e6,
    precisionM: Number.isFinite(prec) && prec >= 0 ? Math.min(Math.round(prec), 1_000_000) : null,
    capturadaUtc: (valida ? fecha! : new Date(ahora)).toISOString(),
  };
}

export function leerRegistro(body: unknown): RegistroTelefono | null {
  const b = body as Record<string, unknown> | null;
  const identificador = texto(b?.identificador, 100);
  if (!b || !identificador || !/^[A-Za-z0-9._-]+$/.test(identificador)) return null;
  const p = (b.permisos ?? {}) as Record<string, unknown>;
  const token = texto(b.pushToken, 200);
  return {
    identificador,
    marca: texto(b.marca, 60),
    modelo: texto(b.modelo, 100),
    nombreEquipo: texto(b.nombreEquipo, 100),
    versionSO: texto(b.versionSO, 30),
    versionApp: texto(b.versionApp, 30),
    compilacion: texto(b.compilacion, 20),
    publicacion: texto(b.publicacion, 20),
    runtimeVersion: texto(b.runtimeVersion, 100),
    // Solo tokens de Expo: el servidor no manda push a nada más.
    pushToken: token && /^Expo(nent)?PushToken\[.+\]$/.test(token) ? token : null,
    permisos: { ubicacion: permiso(p.ubicacion), camara: permiso(p.camara), notificaciones: permiso(p.notificaciones) },
    ubicacion: leerUbicacion(b.ubicacion),
  };
}

/**
 * UPDATE y si no tocó nada, INSERT (MERGE tiene esquinas bajo concurrencia).
 * La ubicación y el token solo se pisan si vienen: abrir la app sin señal de
 * GPS no borra la última ubicación conocida.
 */
export async function registrarTelefono(sesion: { idUsuario: number; usuario: string }, d: RegistroTelefono): Promise<void> {
  const db = await getDb();
  const r = db.request()
    .input('identificador', sql.NVarChar(100), d.identificador)
    .input('idUsuario', sql.Int, sesion.idUsuario)
    .input('usuario', sql.NVarChar(100), sesion.usuario)
    .input('marca', sql.NVarChar(60), d.marca)
    .input('modelo', sql.NVarChar(100), d.modelo)
    .input('nombreEquipo', sql.NVarChar(100), d.nombreEquipo)
    .input('versionSO', sql.NVarChar(30), d.versionSO)
    .input('versionApp', sql.NVarChar(30), d.versionApp)
    .input('compilacion', sql.NVarChar(20), d.compilacion)
    .input('publicacion', sql.NVarChar(20), d.publicacion)
    .input('runtimeVersion', sql.NVarChar(100), d.runtimeVersion)
    .input('pushToken', sql.NVarChar(200), d.pushToken)
    .input('pUbicacion', sql.NVarChar(20), d.permisos.ubicacion)
    .input('pCamara', sql.NVarChar(20), d.permisos.camara)
    .input('pNotif', sql.NVarChar(20), d.permisos.notificaciones)
    .input('lat', sql.Decimal(9, 6), d.ubicacion?.latitud ?? null)
    .input('lng', sql.Decimal(9, 6), d.ubicacion?.longitud ?? null)
    .input('prec', sql.Int, d.ubicacion?.precisionM ?? null)
    .input('ubicUtc', sql.DateTime2, d.ubicacion ? new Date(d.ubicacion.capturadaUtc) : null);
  await r.query(`
    -- Un token es de UN teléfono: si otro lo tenía (reinstalación, cambio de ID), se le quita.
    IF @pushToken IS NOT NULL
      UPDATE mant.DispositivoApp SET pushToken = NULL WHERE pushToken = @pushToken AND identificador <> @identificador;

    UPDATE mant.DispositivoApp
       SET idUsuario = @idUsuario, usuario = @usuario,
           marca = @marca, modelo = @modelo, nombreEquipo = @nombreEquipo, versionSO = @versionSO,
           versionApp = @versionApp, compilacion = @compilacion, publicacion = @publicacion,
           runtimeVersion = @runtimeVersion,
           pushToken = COALESCE(@pushToken, pushToken),
           permisoUbicacion = COALESCE(@pUbicacion, permisoUbicacion),
           permisoCamara = COALESCE(@pCamara, permisoCamara),
           permisoNotificaciones = COALESCE(@pNotif, permisoNotificaciones),
           latitud = COALESCE(@lat, latitud), longitud = COALESCE(@lng, longitud),
           precisionM = CASE WHEN @lat IS NULL THEN precisionM ELSE @prec END,
           ubicacionUtc = COALESCE(@ubicUtc, ubicacionUtc),
           ultimaVezUtc = SYSUTCDATETIME()
     WHERE identificador = @identificador;

    IF @@ROWCOUNT = 0
      INSERT INTO mant.DispositivoApp
        (identificador, idUsuario, usuario, marca, modelo, nombreEquipo, versionSO, versionApp, compilacion,
         publicacion, runtimeVersion, pushToken, permisoUbicacion, permisoCamara, permisoNotificaciones,
         latitud, longitud, precisionM, ubicacionUtc)
      VALUES
        (@identificador, @idUsuario, @usuario, @marca, @modelo, @nombreEquipo, @versionSO, @versionApp, @compilacion,
         @publicacion, @runtimeVersion, @pushToken, @pUbicacion, @pCamara, @pNotif,
         @lat, @lng, @prec, @ubicUtc);`);
}

/** Al cerrar sesión el teléfono deja de recibir avisos a nombre de esa persona. */
export async function olvidarToken(identificador: string): Promise<void> {
  const db = await getDb();
  await db.request()
    .input('identificador', sql.NVarChar(100), identificador)
    .query('UPDATE mant.DispositivoApp SET pushToken = NULL WHERE identificador = @identificador');
}

/**
 * Guarda dónde estaba el operario cuando mandó algo. Best-effort: el envío ya
 * quedó guardado, que falle esto no lo deshace.
 */
export async function guardarUbicacion(args: {
  tipo: 'checklist' | 'averia' | 'material';
  referenciaId: string;
  equipoId: string;
  usuario: string;
  identificador: string | null;
  ubicacion: Ubicacion | null;
}): Promise<void> {
  if (!args.ubicacion) return;
  try {
    const db = await getDb();
    await db.request()
      .input('tipo', sql.NVarChar(20), args.tipo)
      .input('referenciaId', sql.NVarChar(50), args.referenciaId)
      .input('equipoId', sql.UniqueIdentifier, args.equipoId)
      .input('usuario', sql.NVarChar(100), args.usuario)
      .input('identificador', sql.NVarChar(100), args.identificador)
      .input('lat', sql.Decimal(9, 6), args.ubicacion.latitud)
      .input('lng', sql.Decimal(9, 6), args.ubicacion.longitud)
      .input('prec', sql.Int, args.ubicacion.precisionM)
      .input('capt', sql.DateTime2, new Date(args.ubicacion.capturadaUtc))
      .query(`
        INSERT INTO mant.UbicacionApp (tipo, referenciaId, equipoId, usuario, identificador, latitud, longitud, precisionM, capturadaUtc)
        VALUES (@tipo, @referenciaId, @equipoId, @usuario, @identificador, @lat, @lng, @prec, @capt)`);
  } catch (err) {
    console.error('[maquinaria] no se pudo guardar la ubicación:', err);
  }
}

// ─── Lista para la pantalla ─────────────────────────────────────────────────

export interface TelefonoListado {
  identificador: string;
  usuario: string | null;
  nombre: string | null;
  marca: string | null;
  modelo: string | null;
  nombreEquipo: string | null;
  versionSO: string | null;
  versionApp: string | null;
  compilacion: string | null;
  publicacion: string | null;
  runtimeVersion: string | null;
  tienePush: boolean;
  permisos: { ubicacion: string | null; camara: string | null; notificaciones: string | null };
  /** Solo para quien reparte (Super Admin). */
  ubicacion: { latitud: number; longitud: number; precisionM: number | null; capturadaUtc: string } | null;
  esPrueba: boolean;
  primeraVezUtc: string;
  ultimaVezUtc: string;
}

/** true si la migración de las tablas todavía no corrió (208: "Invalid object name"). */
export function faltaTabla(e: unknown): boolean {
  const err = e as { number?: number; message?: string } | null;
  return err?.number === 208 && /DispositivoApp|UbicacionApp/i.test(err.message ?? '');
}

export async function listarTelefonos(conUbicacion: boolean): Promise<TelefonoListado[]> {
  const db = await getDb();
  const r = await db.request().query<{
    identificador: string; usuario: string | null; nombre: string | null; marca: string | null; modelo: string | null;
    nombreEquipo: string | null; versionSO: string | null; versionApp: string | null; compilacion: string | null;
    publicacion: string | null; runtimeVersion: string | null; tienePush: boolean;
    permisoUbicacion: string | null; permisoCamara: string | null; permisoNotificaciones: string | null;
    latitud: number | null; longitud: number | null; precisionM: number | null; ubicacionUtc: Date | null;
    esPrueba: boolean; primeraVezUtc: Date; ultimaVezUtc: Date;
  }>(`
    SELECT d.identificador, d.usuario,
           -- El nombre de la persona sale de la ficha (dbo.Usuario solo tiene credenciales).
           COALESCE(col.calcNombreCompleto, mu.nombre) AS nombre,
           d.marca, d.modelo, d.nombreEquipo, d.versionSO, d.versionApp, d.compilacion, d.publicacion,
           d.runtimeVersion, CAST(CASE WHEN d.pushToken IS NULL THEN 0 ELSE 1 END AS BIT) AS tienePush,
           d.permisoUbicacion, d.permisoCamara, d.permisoNotificaciones,
           d.latitud, d.longitud, d.precisionM, d.ubicacionUtc, d.esPrueba, d.primeraVezUtc, d.ultimaVezUtc
      FROM mant.DispositivoApp d
      LEFT JOIN dbo.Usuario u ON u.idUsuario = d.idUsuario
      LEFT JOIN dbo.Colaborador col ON col.idColaborador = u.idColaborador
      LEFT JOIN mant.Usuarios mu ON mu.usuario = d.usuario
     ORDER BY d.ultimaVezUtc DESC`);
  return r.recordset.map((x) => ({
    identificador: x.identificador,
    usuario: x.usuario,
    nombre: x.nombre,
    marca: x.marca,
    modelo: x.modelo,
    nombreEquipo: x.nombreEquipo,
    versionSO: x.versionSO,
    versionApp: x.versionApp,
    compilacion: x.compilacion,
    publicacion: x.publicacion,
    runtimeVersion: x.runtimeVersion,
    tienePush: !!x.tienePush,
    permisos: { ubicacion: x.permisoUbicacion, camara: x.permisoCamara, notificaciones: x.permisoNotificaciones },
    ubicacion:
      conUbicacion && x.latitud != null && x.longitud != null && x.ubicacionUtc
        ? { latitud: Number(x.latitud), longitud: Number(x.longitud), precisionM: x.precisionM, capturadaUtc: x.ubicacionUtc.toISOString() }
        : null,
    esPrueba: !!x.esPrueba,
    primeraVezUtc: x.primeraVezUtc.toISOString(),
    ultimaVezUtc: x.ultimaVezUtc.toISOString(),
  }));
}

export async function runtimeVersionDe(identificador: string): Promise<string | null> {
  const db = await getDb();
  const r = await db.request()
    .input('identificador', sql.NVarChar(100), identificador)
    .query<{ runtimeVersion: string | null }>('SELECT runtimeVersion FROM mant.DispositivoApp WHERE identificador = @identificador');
  return r.recordset[0]?.runtimeVersion ?? null;
}

export async function marcarPrueba(identificador: string, esPrueba: boolean): Promise<boolean> {
  const db = await getDb();
  const r = await db.request()
    .input('identificador', sql.NVarChar(100), identificador)
    .input('esPrueba', sql.Bit, esPrueba ? 1 : 0)
    .query('UPDATE mant.DispositivoApp SET esPrueba = @esPrueba WHERE identificador = @identificador');
  return r.rowsAffected[0] > 0;
}

// ─── Aviso de versión nueva ─────────────────────────────────────────────────

/** Un teléfono que no se conecta hace más que esto ya no está en uso: no se le avisa. */
const DIAS_EN_USO = 60;
const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

/**
 * Avisa por push a quienes les acaba de quedar `updateId`: el teléfono al que se
 * le envió para probar, o todos los del mismo APK que todavía no la tienen, al
 * distribuirla. Tocar el aviso en el teléfono baja la versión y reinicia la app.
 * Devuelve a cuántos les llegó. Nunca lanza: el reparto ya quedó hecho.
 */
export async function avisarVersionNueva(
  accion: 'enviar' | 'distribuir',
  opts: { updateId: string; equipo?: string | null },
): Promise<number> {
  try {
    const pub = (await listarPublicaciones()).find((p) => p.updateId === opts.updateId);
    if (!pub?.publicacion) return 0;
    const db = await getDb();
    const r = await db.request()
      .input('equipo', sql.NVarChar(100), accion === 'enviar' ? (opts.equipo ?? '') : null)
      .input('rv', sql.NVarChar(100), pub.runtimeVersion)
      .input('pub', sql.NVarChar(20), pub.publicacion)
      .input('dias', sql.Int, DIAS_EN_USO)
      .query<{ identificador: string; pushToken: string }>(`
        SELECT identificador, pushToken
          FROM mant.DispositivoApp
         WHERE pushToken IS NOT NULL
           AND runtimeVersion = @rv
           AND ultimaVezUtc >= DATEADD(DAY, -@dias, SYSUTCDATETIME())
           AND (@equipo IS NOT NULL AND identificador = @equipo
                OR @equipo IS NULL AND esPrueba = 0 AND ISNULL(publicacion, '') <> @pub)`);
    if (!r.recordset.length) return 0;

    const mensajes = r.recordset.map((d) => ({
      to: d.pushToken,
      title: 'Nueva versión de la app',
      body: `Tocá para actualizar a la ${pub.publicacion}.`,
      sound: 'default',
      channelId: 'default',
      data: { tipo: 'VersionNueva', publicacion: pub.publicacion },
    }));
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;

    let enviados = 0;
    const muertos: string[] = [];
    // Expo acepta hasta 100 mensajes por pedido.
    for (let i = 0; i < mensajes.length; i += 100) {
      const lote = mensajes.slice(i, i + 100);
      const res = await fetch(EXPO_PUSH, { method: 'POST', headers, body: JSON.stringify(lote) });
      if (!res.ok) {
        console.error('[maquinaria] push de versión: Expo respondió', res.status, await res.text().catch(() => ''));
        continue;
      }
      const json = (await res.json().catch(() => null)) as { data?: Array<{ status?: string; details?: { error?: string } }> } | null;
      (json?.data ?? []).forEach((t, j) => {
        if (t.status === 'ok') enviados++;
        else if (t.details?.error === 'DeviceNotRegistered') muertos.push(lote[j].to);
      });
    }
    // Un token que Expo ya no reconoce (app desinstalada) no se vuelve a usar.
    for (const token of muertos) {
      await db.request().input('t', sql.NVarChar(200), token).query('UPDATE mant.DispositivoApp SET pushToken = NULL WHERE pushToken = @t');
    }
    return enviados;
  } catch (err) {
    console.error('[maquinaria] no se pudo mandar el aviso de versión:', err);
    return 0;
  }
}
