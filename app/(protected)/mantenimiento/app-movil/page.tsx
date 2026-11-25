"use client";

// Mantenimiento → App móvil: los teléfonos con la app de maquinaria y el reparto
// de versiones, igual que Dispositivos en h4.
//
//   · Rol Mantenimiento: ve quién usa cada teléfono, cuándo se conectó, qué
//     versión corre y qué permisos dio. Nada más.
//   · Super Admin: además ve la última ubicación, marca teléfonos de prueba y
//     reparte versiones (enviar una a un teléfono para probarla, distribuirla a
//     todos o volver a una anterior). Las publicaciones se suben desde la Mac;
//     acá solo se elige quién recibe cuál.

import { useCallback, useEffect, useMemo, useState } from "react";
import { StatTile } from "@/components/mantenimiento/local/StatTile";
import { EstadoCarga } from "@/components/mantenimiento/local/EstadoCarga";
import { FormSelect } from "@/components/mantenimiento/local/FormExtras";
import { Table, Pill, type ColumnaTabla } from "@/components/mantenimiento/local/Table";
import { useToast } from "@/components/mantenimiento/local/Toast";
import { Button } from "@/components/mantenimiento/ds/Button/Button";
import type { TonoPill } from "@/lib/mantenimiento/planUtils";

type Permiso = "concedido" | "negado" | "sin-preguntar" | null;

interface Telefono {
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
  permisos: { ubicacion: Permiso; camara: Permiso; notificaciones: Permiso };
  ubicacion: { latitud: number; longitud: number; precisionM: number | null; capturadaUtc: string } | null;
  esPrueba: boolean;
  primeraVezUtc: string;
  ultimaVezUtc: string;
}

interface Publicacion {
  updateId: string;
  runtimeVersion: string;
  publicacion: string | null;
  publicadaUtc: string;
}

interface Reparto {
  publicaciones: Publicacion[];
  estable: Record<string, { updateId: string; publicacion: string | null }>;
  asignados: Record<string, { updateId: string; runtimeVersion: string; publicacion: string | null }>;
}

interface Respuesta {
  puedeRepartir: boolean;
  sinTabla: boolean;
  telefonos: Telefono[];
  reparto: Reparto | null;
}

const TARJETA = {
  background: "var(--ds-surface)",
  borderRadius: "var(--ds-radius-lg)",
  boxShadow: "var(--ds-shadow-01)",
  padding: "var(--ds-space-5)",
} as const;

const GRIS = { color: "var(--ds-color-gray-500)", fontSize: "var(--ds-font-size-body-sm)" } as const;

const fmt = new Intl.DateTimeFormat("es-CR", {
  timeZone: "America/Costa_Rica",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

function haceCuanto(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

function tonoConexion(iso: string): TonoPill {
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (h < 24) return "green";
  if (h < 24 * 7) return "yellow";
  return "gray";
}

function PillPermiso({ nombre, estado }: { nombre: string; estado: Permiso }) {
  const tono: TonoPill = estado === "concedido" ? "green" : estado === "negado" ? "red" : "gray";
  const marca = estado === "concedido" ? "✓" : estado === "negado" ? "✕" : "?";
  const titulo = estado === "concedido" ? "Lo dio" : estado === "negado" ? "Dijo que no" : "Todavía no se le preguntó";
  return (
    <span title={`${nombre}: ${titulo}`}>
      <Pill tone={tono}>
        {marca} {nombre}
      </Pill>
    </span>
  );
}

function nombrePublicacion(p: Publicacion): string {
  return `${p.publicacion ? `Versión ${p.publicacion}` : p.updateId.slice(0, 8)} · ${fmt.format(new Date(p.publicadaUtc))}`;
}

export default function AppMovilPage() {
  const toast = useToast();
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [updateId, setUpdateId] = useState("");
  const [equipo, setEquipo] = useState("");

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/movil/maquinaria/telefonos", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || "No se pudieron cargar los teléfonos.");
      setDatos(j as Respuesta);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const reparto = datos?.reparto ?? null;
  const puedeRepartir = !!datos?.puedeRepartir;
  const flota = useMemo(() => (datos?.telefonos ?? []).filter((t) => !t.esPrueba), [datos]);
  const deprueba = useMemo(() => (datos?.telefonos ?? []).filter((t) => t.esPrueba), [datos]);

  // Por defecto, la publicación más nueva.
  useEffect(() => {
    if (!updateId && reparto?.publicaciones.length) setUpdateId(reparto.publicaciones[0].updateId);
  }, [reparto, updateId]);

  const accion = useCallback(
    async (cuerpo: { accion: "enviar" | "quitar" | "distribuir"; equipo?: string; updateId?: string }) => {
      setOcupado(true);
      try {
        const r = await fetch("/api/movil/maquinaria/reparto", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cuerpo),
        });
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(j?.error || "No se pudo mover el reparto.");
        toast.exito(j.mensaje);
        await cargar();
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setOcupado(false);
      }
    },
    [cargar, toast],
  );

  const marcarPrueba = useCallback(
    async (t: Telefono) => {
      try {
        const r = await fetch("/api/movil/maquinaria/telefonos", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identificador: t.identificador, esPrueba: !t.esPrueba }),
        });
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(j?.error || "No se pudo marcar el teléfono.");
        await cargar();
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    [cargar, toast],
  );

  const pubElegida = reparto?.publicaciones.find((p) => p.updateId === updateId) ?? null;

  const distribuir = () => {
    if (!pubElegida) return;
    const nombre = pubElegida.publicacion ? `la versión ${pubElegida.publicacion}` : "esta publicación";
    if (!window.confirm(`¿Mandar ${nombre} a TODOS los teléfonos? Los que tenían otra para probar también pasan a esta.`)) return;
    void accion({ accion: "distribuir", updateId });
  };

  const columnas = useMemo<ColumnaTabla<Telefono>[]>(() => {
    const cols: ColumnaTabla<Telefono>[] = [
      {
        key: "nombre",
        header: "Persona",
        movil: "titulo",
        sortValue: (t) => (t.nombre ?? t.usuario ?? "").toLowerCase(),
        render: (t) => (
          <div>
            <div style={{ fontWeight: 600 }}>{t.nombre ?? t.usuario ?? "—"}</div>
            {t.usuario && <div style={GRIS}>{t.usuario}</div>}
          </div>
        ),
      },
      {
        key: "telefono",
        header: "Teléfono",
        sortValue: (t) => `${t.marca ?? ""} ${t.modelo ?? ""}`,
        render: (t) => (
          <div>
            <div>{t.nombreEquipo || [t.marca, t.modelo].filter(Boolean).join(" ") || "—"}</div>
            <div style={GRIS}>
              {[t.nombreEquipo ? [t.marca, t.modelo].filter(Boolean).join(" ") : null, t.versionSO ? `Android ${t.versionSO}` : null]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
        ),
      },
      {
        key: "version",
        header: "Versión",
        sortValue: (t) => t.publicacion ?? "",
        render: (t) => {
          const asignada = reparto?.asignados[t.identificador];
          const deTodos = t.runtimeVersion ? reparto?.estable[t.runtimeVersion] : undefined;
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
              <span>{t.publicacion ? `Versión ${t.publicacion}` : "La del APK"}</span>
              <span style={GRIS}>APK {t.versionApp ?? "?"}{t.compilacion ? ` (${t.compilacion})` : ""}</span>
              {asignada && asignada.publicacion !== t.publicacion && (
                <Pill tone="yellow">Probando la {asignada.publicacion ?? "nueva"}</Pill>
              )}
              {asignada && asignada.publicacion === t.publicacion && <Pill tone="yellow">En prueba</Pill>}
              {puedeRepartir && t.runtimeVersion && !deTodos && !asignada && (
                <span style={GRIS}>APK sin versiones repartidas</span>
              )}
            </div>
          );
        },
      },
      {
        key: "permisos",
        header: "Permisos",
        render: (t) => (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            <PillPermiso nombre="Ubicación" estado={t.permisos.ubicacion} />
            <PillPermiso nombre="Cámara" estado={t.permisos.camara} />
            <PillPermiso nombre="Avisos" estado={t.permisos.notificaciones} />
          </div>
        ),
      },
      {
        key: "ultimaVezUtc",
        header: "Última conexión",
        sortValue: (t) => t.ultimaVezUtc,
        render: (t) => (
          <div>
            <Pill tone={tonoConexion(t.ultimaVezUtc)}>{haceCuanto(t.ultimaVezUtc)}</Pill>
            <div style={{ ...GRIS, marginTop: 4 }}>{fmt.format(new Date(t.ultimaVezUtc))}</div>
          </div>
        ),
      },
    ];
    if (puedeRepartir) {
      cols.push(
        {
          key: "ubicacion",
          header: "Última ubicación",
          render: (t) =>
            t.ubicacion ? (
              <div>
                <a
                  href={`https://www.google.com/maps?q=${t.ubicacion.latitud},${t.ubicacion.longitud}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--ds-text)", textDecoration: "underline" }}
                >
                  Ver en el mapa
                </a>
                <div style={GRIS}>
                  {haceCuanto(t.ubicacion.capturadaUtc)}
                  {t.ubicacion.precisionM != null ? ` · ±${t.ubicacion.precisionM} m` : ""}
                </div>
              </div>
            ) : (
              <span style={GRIS}>Sin ubicación</span>
            ),
        },
        {
          key: "acciones",
          header: "",
          sticky: true,
          render: (t) => (
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              {reparto?.asignados[t.identificador] && (
                <Button
                  size="sm"
                  color="white"
                  label="Volver a la de todos"
                  state={ocupado ? "disabled" : "standard"}
                  onClick={() => void accion({ accion: "quitar", equipo: t.identificador })}
                />
              )}
              <Button
                size="sm"
                color="white"
                label={t.esPrueba ? "Quitar de prueba" : "Es de prueba"}
                onClick={() => void marcarPrueba(t)}
              />
            </div>
          ),
        },
      );
    }
    return cols;
  }, [accion, marcarPrueba, ocupado, puedeRepartir, reparto]);

  const hoy = flota.filter((t) => Date.now() - new Date(t.ultimaVezUtc).getTime() < 86_400_000).length;
  const sinUbicacion = flota.filter((t) => t.permisos.ubicacion !== "concedido").length;
  const estables = Object.values(reparto?.estable ?? {});

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-5)" }}>
      <div>
        <h1 style={{ fontSize: "var(--ds-font-size-heading)", margin: 0 }}>App móvil</h1>
        <div style={{ color: "var(--ds-color-gray-500)", marginTop: 4 }}>
          Teléfonos con la app de maquinaria{puedeRepartir ? " y las versiones que recibe cada uno" : ""}.
        </div>
      </div>

      <EstadoCarga cargando={cargando} error={error} />

      {datos?.sinTabla && (
        <div style={{ ...TARJETA, color: "var(--ds-color-gray-500)" }}>
          Todavía no se registró ningún teléfono: falta la migración de la tabla de teléfonos en esta base.
        </div>
      )}

      {datos && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "var(--ds-space-4)" }}>
          <StatTile label="Teléfonos" value={flota.length} icon="user" />
          <StatTile label="Se conectaron hoy" value={hoy} tone="green" />
          <StatTile label="Sin permiso de ubicación" value={sinUbicacion} tone={sinUbicacion ? "yellow" : "black"} />
          {puedeRepartir && (
            <StatTile
              label="Versión de todos"
              value={estables.length ? estables.map((e) => e.publicacion ?? "?").join(" · ") : "La del APK"}
            />
          )}
        </div>
      )}

      {puedeRepartir && reparto && (
        <div style={{ ...TARJETA, display: "flex", flexDirection: "column", gap: "var(--ds-space-4)" }}>
          <div>
            <div style={{ fontWeight: 700 }}>Repartir una versión</div>
            <div style={GRIS}>
              Mandala primero a un teléfono para probarla; cuando ande, distribuila a todos. Elegir una anterior y
              distribuirla es volver atrás.
            </div>
          </div>
          {reparto.publicaciones.length === 0 ? (
            <div style={GRIS}>Todavía no hay versiones subidas. Se publican desde la Mac.</div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--ds-space-4)" }}>
                <FormSelect
                  label="Versión"
                  value={updateId}
                  onChange={(e) => setUpdateId(e.target.value)}
                  options={reparto.publicaciones.map((p) => ({ value: p.updateId, label: nombrePublicacion(p) }))}
                />
                <FormSelect
                  label="Teléfono para probar"
                  value={equipo}
                  onChange={(e) => setEquipo(e.target.value)}
                  placeholder="Elegí un teléfono"
                  options={(datos?.telefonos ?? []).map((t) => ({
                    value: t.identificador,
                    label: `${t.nombre ?? t.usuario ?? "?"} · ${t.nombreEquipo || t.modelo || t.identificador}${t.esPrueba ? " (prueba)" : ""}`,
                  }))}
                />
              </div>
              <div style={{ display: "flex", gap: "var(--ds-space-3)", flexWrap: "wrap" }}>
                <Button
                  label="Enviar para probar"
                  color="green"
                  state={ocupado || !equipo || !updateId ? "disabled" : "standard"}
                  onClick={() => void accion({ accion: "enviar", equipo, updateId })}
                />
                <Button
                  label="Distribuir a todos"
                  color="black"
                  state={ocupado || !updateId ? "disabled" : "standard"}
                  onClick={distribuir}
                />
              </div>
            </>
          )}
        </div>
      )}

      {datos && (
        <Table
          tablaKey="app-movil-telefonos"
          columns={columnas}
          rows={flota}
          getRowKey={(t) => t.identificador}
          emptyMessage="Ningún operario abrió la app todavía."
        />
      )}

      {datos && deprueba.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-3)" }}>
          <div style={{ fontWeight: 700 }}>Teléfonos de prueba</div>
          <Table tablaKey="app-movil-prueba" columns={columnas} rows={deprueba} getRowKey={(t) => t.identificador} />
        </div>
      )}
    </div>
  );
}
