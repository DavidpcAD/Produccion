"use client";

// Historial de fallas. Una falla es una OT correctiva, o cualquier OT a la que
// Mantenimiento le asignó un tipo de falla (ver esFalla en lib/fallas.ts).
// Arriba: filtro por equipo, números del rango, gráfico de fallas por día y
// ranking de equipos. Abajo: el historial (donde se clasifica cada OT) y la
// lista editable de tipos de falla.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/mantenimiento/store";
import { puede } from "@/lib/mantenimiento/permisos";
import { esFalla, nombreTipo, seriesDeFallas, useTiposFalla } from "@/lib/mantenimiento/fallas";
import { apiPatch, apiPost } from "@/lib/mantenimiento/api";
import { StatTile } from "@/components/mantenimiento/local/StatTile";
import { EstadoCarga } from "@/components/mantenimiento/local/EstadoCarga";
import { FormSelect } from "@/components/mantenimiento/local/FormExtras";
import { FilterChips } from "@/components/mantenimiento/local/FilterChips";
import { Table, Pill, type ColumnaTabla } from "@/components/mantenimiento/local/Table";
import { FallasPorDia, desdeDeRango, type RangoFallas } from "@/components/mantenimiento/local/FallasPorDia";
import { SelectorTipoFalla } from "@/components/mantenimiento/local/SelectorTipoFalla";
import { useToast } from "@/components/mantenimiento/local/Toast";
import { Button } from "@/components/mantenimiento/ds/Button/Button";
import { FormField } from "@/components/mantenimiento/ds/Form/Form";
import type { EstadoOt, OrdenTrabajo, TipoFalla } from "@/lib/mantenimiento/types";
import type { TonoPill } from "@/lib/mantenimiento/planUtils";

const ESTADO_LABEL: Record<EstadoOt, string> = { abierta: "Abierta", en_proceso: "En proceso", finalizada: "Finalizada", cancelada: "Cancelada" };
const ESTADO_TONO: Record<EstadoOt, TonoPill> = { abierta: "yellow", en_proceso: "black", finalizada: "green", cancelada: "red" };
const TOP_RANKING = 8;

const TARJETA = {
  background: "var(--ds-surface)",
  borderRadius: "var(--ds-radius-lg)",
  boxShadow: "var(--ds-shadow-01)",
  padding: "var(--ds-space-5)"
} as const;

export default function FallasPage() {
  const router = useRouter();
  const { ots, equipos, usuario, cargando, errorCarga } = useAppStore();
  const { tipos, error: errorTipos, recargar: recargarTipos } = useTiposFalla();
  const puedeClasificar = puede(usuario?.rol, "equipos.editar");

  const [equipoId, setEquipoId] = useState("");
  const [rango, setRango] = useState<RangoFallas>(30);
  const [vista, setVista] = useState<"todas" | "sin">("todas");

  // ?equipo=<id> (enlace desde la ficha del equipo) deja el filtro puesto.
  // Se lee de window y no con useSearchParams para no exigir un Suspense.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("equipo");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- valor inicial que viene de la URL
    if (id) setEquipoId(id);
  }, []);

  const fallasTodas = useMemo(() => ots.filter(esFalla), [ots]);
  // Colores según el histórico completo: cambiar equipo o rango no los repinta.
  const series = useMemo(() => seriesDeFallas(fallasTodas, tipos), [fallasTodas, tipos]);
  const fallas = useMemo(() => (equipoId ? fallasTodas.filter((ot) => ot.equipoId === equipoId) : fallasTodas), [fallasTodas, equipoId]);

  const desde = useMemo(() => desdeDeRango(rango, new Date(new Date().setHours(0, 0, 0, 0))), [rango]);
  const enRango = useMemo(() => fallas.filter((ot) => new Date(ot.fechaApertura) >= desde), [fallas, desde]);
  const sinClasificar = fallas.filter((ot) => !ot.tipoFallaId).length;

  const tipoMasFrecuente = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const ot of enRango) if (ot.tipoFallaId) conteo.set(ot.tipoFallaId, (conteo.get(ot.tipoFallaId) ?? 0) + 1);
    const [id] = [...conteo.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
    return id ? nombreTipo(id, tipos) : "—";
  }, [enRango, tipos]);

  const ranking = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const ot of fallasTodas) if (new Date(ot.fechaApertura) >= desde) conteo.set(ot.equipoId, (conteo.get(ot.equipoId) ?? 0) + 1);
    return [...conteo.entries()]
      .map(([id, n]) => ({ equipo: equipos.find((e) => e.id === id), id, n }))
      .sort((a, b) => b.n - a.n || (a.equipo?.codigo ?? "").localeCompare(b.equipo?.codigo ?? ""))
      .slice(0, TOP_RANKING);
  }, [fallasTodas, desde, equipos]);

  const equipoElegido = equipos.find((e) => e.id === equipoId);
  const nombreRango = rango === "mes" ? "este mes" : `los últimos ${rango} días`;

  const filasHistorial = useMemo(
    () =>
      fallas
        .filter((ot) => vista === "todas" || !ot.tipoFallaId)
        .sort((a, b) => new Date(b.fechaApertura).getTime() - new Date(a.fechaApertura).getTime()),
    [fallas, vista]
  );

  const columnas: ColumnaTabla<OrdenTrabajo>[] = [
    { key: "numero", header: "OT", movil: "titulo", render: (o) => <span style={{ whiteSpace: "nowrap" }}>{o.numero}</span> },
    { key: "titulo", header: "Título", movil: "titulo" },
    {
      key: "fechaApertura",
      header: "Fecha",
      sortValue: (o) => new Date(o.fechaApertura).getTime(),
      render: (o) => new Date(o.fechaApertura).toLocaleDateString("es-CR")
    },
    {
      key: "equipo",
      header: "Equipo",
      sortValue: (o) => equipos.find((e) => e.id === o.equipoId)?.codigo ?? "",
      render: (o) => {
        const eq = equipos.find((e) => e.id === o.equipoId);
        return eq ? `${eq.codigo} — ${eq.nombre}` : "—";
      }
    },
    {
      key: "tipoFallaId",
      header: "Tipo de falla",
      sortValue: (o) => nombreTipo(o.tipoFallaId, tipos),
      render: (o) => <SelectorTipoFalla ot={o} tipos={tipos} editable={puedeClasificar} compacto />
    },
    { key: "estado", header: "Estado", render: (o) => <Pill tone={ESTADO_TONO[o.estado]}>{ESTADO_LABEL[o.estado]}</Pill> }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-5)" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--ds-space-3)" }}>
        <div>
          <h1 style={{ fontSize: "var(--ds-font-size-heading)", margin: 0 }}>Historial de fallas</h1>
          <div style={{ color: "var(--ds-color-gray-500)", marginTop: 4 }}>
            Órdenes correctivas y las que clasificaste como falla.
          </div>
        </div>
        <div style={{ minWidth: 260, flex: "0 1 340px" }}>
          <FormSelect
            label="Equipo"
            value={equipoId}
            onChange={(e) => setEquipoId(e.target.value)}
            placeholder="Todos los equipos"
            options={equipos
              .slice()
              .sort((a, b) => a.codigo.localeCompare(b.codigo))
              .map((e) => ({ value: e.id, label: `${e.codigo} — ${e.nombre}` }))}
          />
        </div>
      </div>
      <EstadoCarga cargando={cargando} error={errorCarga || errorTipos} />

      <div style={{ display: "flex", gap: "var(--ds-space-4)", flexWrap: "wrap" }}>
        <StatTile label={`Fallas en ${nombreRango}`} value={enRango.length} icon="alert" tone="red" />
        <StatTile label="Sin clasificar" value={sinClasificar} icon="pendiente" tone={sinClasificar > 0 ? "yellow" : "black"} />
        <StatTile label="Tipo más frecuente" value={tipoMasFrecuente} icon="list" tone="black" />
      </div>

      <FallasPorDia
        fallas={fallas}
        series={series}
        equipos={equipos}
        rango={rango}
        onRango={setRango}
        subtitulo={equipoElegido ? `${equipoElegido.codigo} — ${equipoElegido.nombre}` : "Todos los equipos · incluye sábados y domingos"}
      />

      {!equipoId && (
        <section className="mnt-fal" aria-labelledby="ranking-titulo">
          <h2 id="ranking-titulo" className="mnt-fal__title">Equipos con más fallas</h2>
          <p className="mnt-fal__sub" style={{ marginBottom: "var(--ds-space-4)" }}>
            En {nombreRango}. Tocá un equipo para ver solo sus fallas.
          </p>
          {ranking.length === 0 ? (
            <div style={{ color: "var(--ds-color-gray-400)" }}>Sin fallas en este rango.</div>
          ) : (
            <ol className="mnt-fal-ranking">
              {ranking.map(({ equipo, id, n }) => (
                <li key={id}>
                  <button type="button" className="mnt-fal-ranking__fila" onClick={() => setEquipoId(id)}>
                    <span className="mnt-fal-ranking__nombre" title={equipo ? `${equipo.codigo} — ${equipo.nombre}` : undefined}>
                      {equipo ? `${equipo.codigo} · ${equipo.nombre}` : "Equipo eliminado"}
                    </span>
                    <span className="mnt-fal-ranking__pista">
                      <span className="mnt-fal-ranking__barra" style={{ width: `${(n / ranking[0].n) * 100}%` }} />
                    </span>
                    <span className="mnt-fal-ranking__valor">{n}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      <section style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-3)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--ds-space-3)" }}>
          <div>
            <h2 style={{ fontSize: "var(--ds-font-size-subtitle)", margin: 0 }}>Historial</h2>
            <div style={{ color: "var(--ds-color-gray-500)", fontSize: "var(--ds-font-size-label)" }}>
              {puedeClasificar ? "Elegí el tipo de falla de cada orden: se guarda al instante." : "Tipo de falla asignado a cada orden."}
            </div>
          </div>
          <FilterChips
            value={vista}
            onChange={(v) => setVista(v as "todas" | "sin")}
            options={[
              { value: "todas", label: "Todas" },
              { value: "sin", label: `Sin clasificar (${sinClasificar})` }
            ]}
          />
        </div>
        <Table
          columns={columnas}
          rows={filasHistorial}
          getRowKey={(o) => o.id}
          onRowClick={(o) => router.push(`/mantenimiento/ordenes/${o.id}`)}
          emptyMessage={vista === "sin" ? "No hay fallas sin clasificar." : "Todavía no hay fallas registradas."}
          tablaKey="fallas"
        />
      </section>

      {puedeClasificar && <TiposFallaEditor tipos={tipos} onCambio={recargarTipos} />}
    </div>
  );
}

// Lista editable de tipos de falla: renombrar (Enter o al salir del campo),
// activar/desactivar y agregar. No se borran: un tipo desactivado deja de
// ofrecerse al clasificar, pero las OTs que ya lo tienen lo siguen mostrando.
function TiposFallaEditor({ tipos, onCambio }: { tipos: TipoFalla[]; onCambio: () => Promise<void> }) {
  const toast = useToast();
  const [abierto, setAbierto] = useState(false);
  const [nuevo, setNuevo] = useState("");
  const [nombres, setNombres] = useState<Record<string, string>>({});

  async function guardar(accion: () => Promise<unknown>, mensaje: string) {
    try {
      await accion();
      await onCambio();
      toast.exito(mensaje);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function renombrar(tipo: TipoFalla) {
    const nombre = (nombres[tipo.id] ?? tipo.nombre).trim();
    if (!nombre || nombre === tipo.nombre) return;
    await guardar(() => apiPatch(`/api/tiposFalla/${tipo.id}`, { nombre }), `Renombrado a "${nombre}".`);
    setNombres((n) => {
      const copia = { ...n };
      delete copia[tipo.id];
      return copia;
    });
  }

  async function agregar() {
    const nombre = nuevo.trim();
    if (!nombre) return;
    await guardar(() => apiPost("/api/tiposFalla", { nombre }), `Tipo "${nombre}" agregado.`);
    setNuevo("");
  }

  return (
    <section style={TARJETA}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--ds-space-3)", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: "var(--ds-font-weight-semibold)" }}>Tipos de falla</div>
          <div style={{ color: "var(--ds-color-gray-500)", fontSize: "var(--ds-font-size-body-sm)" }}>
            {tipos.filter((t) => t.activo).length} activos. Los desactivados no se ofrecen al clasificar, pero no se borran del historial.
          </div>
        </div>
        <Button label={abierto ? "Cerrar" : "Administrar"} color="white" size="sm" onClick={() => setAbierto((a) => !a)} />
      </div>

      {abierto && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-3)", marginTop: "var(--ds-space-4)" }}>
          {/* Dos columnas en computadora, una en celular. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: "var(--ds-space-2)" }}>
          {tipos.map((t) => (
            <div
              key={t.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--ds-space-2)",
                padding: "var(--ds-space-2) var(--ds-space-3)",
                borderRadius: "var(--ds-radius-md)",
                background: "var(--ds-color-gray-100)",
                opacity: t.activo ? 1 : 0.6
              }}
            >
              <input
                className="ds-form-field__input"
                style={{ flex: 1, minWidth: 0, minHeight: 40 }}
                value={nombres[t.id] ?? t.nombre}
                maxLength={60}
                aria-label={`Nombre del tipo ${t.nombre}`}
                onChange={(e) => setNombres((n) => ({ ...n, [t.id]: e.target.value }))}
                onBlur={() => renombrar(t)}
                onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
              />
              <Button
                label={t.activo ? "Desactivar" : "Activar"}
                color="white"
                size="sm"
                onClick={() => guardar(() => apiPatch(`/api/tiposFalla/${t.id}`, { activo: !t.activo }), t.activo ? `"${t.nombre}" desactivado.` : `"${t.nombre}" activado.`)}
              />
            </div>
          ))}
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--ds-space-2)", flexWrap: "wrap", maxWidth: 520 }}>
            <div style={{ flex: "1 1 220px" }}>
              <FormField label="Nuevo tipo de falla" placeholder="Ej.: Sistema de aire" value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
            </div>
            <Button label="Agregar" color="green" layout="icon-left" icon="plus" onClick={agregar} state={nuevo.trim() ? "standard" : "disabled"} />
          </div>
        </div>
      )}
    </section>
  );
}
