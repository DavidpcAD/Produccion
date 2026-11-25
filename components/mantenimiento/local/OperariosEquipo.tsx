"use client";

// Operarios de un equipo (ficha del equipo): quién lo ve en la app móvil de
// maquinaria. Se asigna a cualquier persona con el rol de Producción
// "Operario Maquinaria"; la API está en /api/mantenimiento/equipos/[id]/operarios.

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/mantenimiento/ds/Button/Button";
import { FormSelect } from "@/components/mantenimiento/local/FormExtras";
import { Pill } from "@/components/mantenimiento/local/Table";
import { useToast } from "@/components/mantenimiento/local/Toast";
import { apiDelete, apiGet, apiPost } from "@/lib/mantenimiento/api";

interface Asignado {
  usuarioId: string;
  nombre: string;
  usuario: string;
  desde: string;
  tieneRol: boolean;
}
interface Disponible {
  idUsuario: number;
  nombre: string;
  usuario: string;
  cedula: string | null;
}

const GRIS = { color: "var(--ds-color-gray-400)", fontSize: "var(--ds-font-size-body-sm)" } as const;

export function OperariosEquipo({ equipoId, soloLectura }: { equipoId: string; soloLectura: boolean }) {
  const toast = useToast();
  const [asignados, setAsignados] = useState<Asignado[] | null>(null);
  const [disponibles, setDisponibles] = useState<Disponible[]>([]);
  const [elegido, setElegido] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await apiGet<{ asignados: Asignado[]; disponibles: Disponible[] }>(`/api/equipos/${equipoId}/operarios`);
      setAsignados(r.asignados);
      setDisponibles(r.disponibles);
    } catch (err) {
      toast.error((err as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipoId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function asignar() {
    if (!elegido) return;
    setOcupado(true);
    try {
      await apiPost(`/api/equipos/${equipoId}/operarios`, { idUsuario: Number(elegido) });
      setElegido("");
      await cargar();
      toast.exito("Operario asignado.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function quitar(a: Asignado) {
    if (!window.confirm(`¿Quitar a ${a.nombre} de este equipo? Deja de verlo en la app.`)) return;
    setOcupado(true);
    try {
      await apiDelete(`/api/equipos/${equipoId}/operarios?usuarioId=${encodeURIComponent(a.usuarioId)}`);
      await cargar();
      toast.exito("Operario quitado.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  if (asignados === null) return <div style={GRIS}>Cargando…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-3)" }}>
      {asignados.length === 0 ? (
        <div style={GRIS}>Nadie tiene asignado este equipo todavía.</div>
      ) : (
        asignados.map((a) => (
          <div
            key={a.usuarioId}
            style={{ display: "flex", alignItems: "center", gap: "var(--ds-space-3)", flexWrap: "wrap", padding: "var(--ds-space-3)", background: "var(--ds-color-gray-100)", borderRadius: "var(--ds-radius-md)" }}
          >
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontWeight: "var(--ds-font-weight-semibold)" }}>{a.nombre}</div>
              <div style={GRIS}>
                {a.usuario} · desde {new Date(a.desde).toLocaleDateString("es-CR")}
              </div>
            </div>
            {!a.tieneRol && <Pill tone="yellow">Sin rol Operario Maquinaria</Pill>}
            {!soloLectura && <Button label="Quitar" color="white" size="sm" state={ocupado ? "disabled" : "standard"} onClick={() => void quitar(a)} />}
          </div>
        ))
      )}

      {!soloLectura &&
        (disponibles.length === 0 ? (
          <div style={GRIS}>
            {asignados.length === 0
              ? "No hay nadie con el rol Operario Maquinaria. Se da en Usuarios, y después aparece acá."
              : "Ya están asignados todos los que tienen el rol Operario Maquinaria."}
          </div>
        ) : (
          <div style={{ display: "flex", gap: "var(--ds-space-3)", alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <FormSelect
                label="Asignar a"
                value={elegido}
                onChange={(e) => setElegido(e.target.value)}
                placeholder="Elegí un operario"
                options={disponibles.map((d) => ({ value: String(d.idUsuario), label: d.cedula ? `${d.nombre} · ${d.cedula}` : d.nombre }))}
              />
            </div>
            <Button label="Asignar" color="green" size="sm" state={ocupado || !elegido ? "disabled" : "standard"} onClick={() => void asignar()} />
          </div>
        ))}
    </div>
  );
}
