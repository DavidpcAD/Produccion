"use client";

// Store de datos real: habla con /app/api/* de verdad, así que cada acción
// puede fallar (red, validación del servidor, choque de llave única) y tira
// un Error con el mensaje que ya arma el propio endpoint — quien llama debe
// hacer try/catch y mostrar err.message en un toast.
//
// Reglas del backend real que hay que tener presentes:
// - Los repuestos usados y las fotos de una OT en curso NO tienen un PATCH
//   propio: solo se guardan de una vez al finalizar (POST .../finalizar).
//   Mientras la OT está en_proceso, esas dos listas viven en estado local de
//   la pantalla de detalle, no acá.
// - Cancelar una OT vale tanto desde "abierta" como desde "en_proceso".
// - Crear una OT manda "checklistTexto" (un string con \n), no un array.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiGet, apiPost, apiPatch, aplanarDocs, subirArchivo, type RespuestaSubida } from "./api";
import type {
  Equipo,
  Repuesto,
  PlanMantenimiento,
  OrdenTrabajo,
  MovimientoRepuesto,
  LecturaHorometro,
  SolicitudMaterial,
  ChecklistItem,
  RepuestoUsado,
  Usuario
} from "./types";

interface DatosApp {
  equipos: Equipo[];
  repuestos: Repuesto[];
  planes: PlanMantenimiento[];
  ots: OrdenTrabajo[];
  movimientos: MovimientoRepuesto[];
  lecturas: LecturaHorometro[];
  solicitudes: SolicitudMaterial[];
}

const DATOS_VACIOS: DatosApp = { equipos: [], repuestos: [], planes: [], ots: [], movimientos: [], lecturas: [], solicitudes: [] };

interface NuevaOtInput {
  equipoId: string;
  tipo: string;
  prioridad: string;
  titulo: string;
  descripcion?: string;
  fechaProgramada?: string | null;
  responsable?: string;
  horometroApertura: number;
  planId?: string | null;
  checklist?: (ChecklistItem | string)[];
}

interface CierreOtInput {
  trabajoRealizado: string;
  horometroCierre: number;
  costoManoObra: number;
  checklist: ChecklistItem[];
  fotos: string[];
  repuestosUsados: RepuestoUsado[];
  firmaId?: string | null;
  firmaResponsable?: string;
}

interface NuevaSolicitudInput {
  solicitante: string;
  equipoId?: string | null;
  items: { repuestoId: string | null; nombre: string; cantidad: number; unidad: string }[];
  fotos?: string[];
  notas?: string;
}

interface ResultadoCreacion {
  id: string;
  numero: string;
}

export interface DataStore extends DatosApp {
  cargando: boolean;
  errorCarga: string | null;
  ultimaSync: string | null;
  // undefined = todavía comprobando la sesión; null = no hay sesión (mostrar login).
  usuario: Usuario | null | undefined;
  cerrarSesion: () => Promise<void>;
  refrescar: () => Promise<void>;
  guardarEquipo: (data: Partial<Equipo>, id?: string | null) => Promise<void>;
  registrarLectura: (equipoId: string, horometro: number, nota?: string) => Promise<void>;
  guardarRepuesto: (data: Partial<Repuesto>, id?: string | null) => Promise<void>;
  registrarMovimiento: (input: { repuestoId: string; tipo: string; cantidad: number; motivo?: string }) => Promise<void>;
  guardarPlan: (data: Partial<PlanMantenimiento>, id?: string | null) => Promise<void>;
  crearOt: (data: NuevaOtInput) => Promise<ResultadoCreacion>;
  actualizarOt: (id: string, cambios: Partial<OrdenTrabajo>) => Promise<void>;
  iniciarOt: (id: string) => Promise<void>;
  cancelarOt: (id: string, motivo: string) => Promise<void>;
  finalizarOt: (id: string, datosCierre: CierreOtInput) => Promise<void>;
  crearSolicitud: (data: NuevaSolicitudInput) => Promise<ResultadoCreacion>;
  subirArchivo: (archivo: File | Blob, contentType?: string) => Promise<RespuestaSubida>;
}

const DataStoreContext = createContext<DataStore | null>(null);

const INTERVALO_REFRESCO_MS = 5000;

async function cargarTodo(): Promise<DatosApp> {
  const [equipos, repuestos, planes, ots, movimientos, lecturas, solicitudes] = await Promise.all([
    apiGet("/api/equipos"),
    apiGet("/api/repuestos"),
    apiGet("/api/planesMantenimiento"),
    apiGet("/api/ots"),
    apiGet("/api/movimientosRepuestos"),
    apiGet("/api/lecturasHorometro"),
    apiGet("/api/solicitudesMateriales")
  ]);
  return {
    equipos: aplanarDocs<Equipo>(equipos),
    repuestos: aplanarDocs<Repuesto>(repuestos),
    planes: aplanarDocs<PlanMantenimiento>(planes),
    ots: aplanarDocs<OrdenTrabajo>(ots),
    movimientos: aplanarDocs<MovimientoRepuesto>(movimientos),
    lecturas: aplanarDocs<LecturaHorometro>(lecturas),
    solicitudes: aplanarDocs<SolicitudMaterial>(solicitudes)
  };
}

export function DataStoreProvider({ children }: { children: ReactNode }) {
  const [datos, setDatos] = useState<DatosApp>(DATOS_VACIOS);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [ultimaSync, setUltimaSync] = useState<string | null>(null);
  const [usuario, setUsuario] = useState<Usuario | null | undefined>(undefined);
  const montado = useRef(true);

  const refrescar = useCallback(async () => {
    try {
      const nuevo = await cargarTodo();
      if (montado.current) {
        setDatos(nuevo);
        setErrorCarga(null);
        setUltimaSync(new Date().toISOString());
      }
    } catch (err) {
      if (montado.current) setErrorCarga((err as Error).message);
    }
  }, []);

  const cerrarSesion = useCallback(async () => {
    try {
      await apiPost("/api/auth/logout");
    } finally {
      // Recarga completa: más simple y confiable que desarmar a mano el
      // intervalo de refresco y todo el estado cacheado.
      window.location.assign("/login");
    }
  }, []);

  // No tiene sentido pedir /api/equipos, /api/ots, etc. (y mucho menos
  // sondearlos cada 5s) si todavía no sabemos si hay una sesión válida — cada
  // una de esas rutas ahora exige requerirUsuario() igual, así que sin sesión
  // solo lograríamos 401 en cascada.
  useEffect(() => {
    montado.current = true;
    let intervalo: ReturnType<typeof setInterval> | undefined;

    (async () => {
      try {
        const respuesta = await apiGet<{ usuario: Usuario }>("/api/auth/me");
        if (!montado.current) return;
        setUsuario(respuesta.usuario);
        await refrescar();
        if (montado.current) setCargando(false);
        intervalo = setInterval(refrescar, INTERVALO_REFRESCO_MS);
      } catch {
        if (montado.current) {
          setUsuario(null);
          setCargando(false);
        }
      }
    })();

    return () => {
      montado.current = false;
      if (intervalo) clearInterval(intervalo);
    };
  }, [refrescar]);

  // ---- Equipos ----
  const guardarEquipo = useCallback(
    async (data: Partial<Equipo>, id?: string | null) => {
      if (id) await apiPatch(`/api/equipos/${id}`, data);
      else await apiPost("/api/equipos", data);
      await refrescar();
    },
    [refrescar]
  );

  const registrarLectura = useCallback(
    async (equipoId: string, horometro: number, nota?: string) => {
      await apiPost("/api/lecturasHorometro", { equipoId, horometro, nota, fuente: "manual" });
      await apiPatch(`/api/equipos/${equipoId}`, { horometroActual: horometro });
      await refrescar();
    },
    [refrescar]
  );

  // ---- Repuestos ----
  const guardarRepuesto = useCallback(
    async (data: Partial<Repuesto>, id?: string | null) => {
      if (id) await apiPatch(`/api/repuestos/${id}`, data);
      else await apiPost("/api/repuestos", data);
      await refrescar();
    },
    [refrescar]
  );

  const registrarMovimiento = useCallback(
    async ({ repuestoId, tipo, cantidad, motivo }: { repuestoId: string; tipo: string; cantidad: number; motivo?: string }) => {
      await apiPost("/api/movimientos/registrar", { repuestoId, tipo, cantidad, motivo });
      await refrescar();
    },
    [refrescar]
  );

  // ---- Planes de mantenimiento ----
  const guardarPlan = useCallback(
    async (data: Partial<PlanMantenimiento>, id?: string | null) => {
      if (id) await apiPatch(`/api/planesMantenimiento/${id}`, data);
      else await apiPost("/api/planesMantenimiento", data);
      await refrescar();
    },
    [refrescar]
  );

  // ---- Órdenes de trabajo ----
  const crearOt = useCallback(
    async (data: NuevaOtInput): Promise<ResultadoCreacion> => {
      const { checklist, ...resto } = data;
      const checklistTexto = (checklist || []).map((t) => (typeof t === "string" ? t : t.texto)).join("\n");
      const resultado = await apiPost<ResultadoCreacion>("/api/ots", { ...resto, checklistTexto });
      await refrescar();
      return resultado;
    },
    [refrescar]
  );

  const actualizarOt = useCallback(
    async (id: string, cambios: Partial<OrdenTrabajo>) => {
      await apiPatch(`/api/ots/${id}`, cambios);
      await refrescar();
    },
    [refrescar]
  );

  const iniciarOt = useCallback(
    async (id: string) => {
      await apiPost(`/api/ots/${id}/iniciar`);
      await refrescar();
    },
    [refrescar]
  );

  const cancelarOt = useCallback(
    async (id: string, motivo: string) => {
      await apiPost(`/api/ots/${id}/cancelar`, { motivo });
      await refrescar();
    },
    [refrescar]
  );

  const finalizarOt = useCallback(
    async (id: string, datosCierre: CierreOtInput) => {
      await apiPost(`/api/ots/${id}/finalizar`, datosCierre);
      await refrescar();
    },
    [refrescar]
  );

  // ---- Solicitudes de materiales ----
  const crearSolicitud = useCallback(
    async (data: NuevaSolicitudInput): Promise<ResultadoCreacion> => {
      const resultado = await apiPost<ResultadoCreacion>("/api/solicitudesMateriales", data);
      await refrescar();
      return resultado;
    },
    [refrescar]
  );

  const value = useMemo<DataStore>(
    () => ({
      ...datos,
      cargando,
      errorCarga,
      ultimaSync,
      usuario,
      cerrarSesion,
      refrescar,
      guardarEquipo,
      registrarLectura,
      guardarRepuesto,
      registrarMovimiento,
      guardarPlan,
      crearOt,
      actualizarOt,
      iniciarOt,
      cancelarOt,
      finalizarOt,
      crearSolicitud,
      subirArchivo
    }),
    [
      datos,
      cargando,
      errorCarga,
      ultimaSync,
      usuario,
      cerrarSesion,
      refrescar,
      guardarEquipo,
      registrarLectura,
      guardarRepuesto,
      registrarMovimiento,
      guardarPlan,
      crearOt,
      actualizarOt,
      iniciarOt,
      cancelarOt,
      finalizarOt,
      crearSolicitud
    ]
  );

  return <DataStoreContext.Provider value={value}>{children}</DataStoreContext.Provider>;
}

export function useAppStore(): DataStore {
  const ctx = useContext(DataStoreContext);
  if (!ctx) throw new Error("useAppStore debe usarse dentro de <DataStoreProvider>");
  return ctx;
}
