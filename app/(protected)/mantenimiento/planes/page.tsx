"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/mantenimiento/store";
import { useToast } from "@/components/mantenimiento/local/Toast";
import { Table, Pill, type ColumnaTabla } from "@/components/mantenimiento/local/Table";
import { Drawer } from "@/components/mantenimiento/local/Drawer";
import { EstadoCarga } from "@/components/mantenimiento/local/EstadoCarga";
import { Button } from "@/components/mantenimiento/ds/Button/Button";
import { FormField, CheckBox } from "@/components/mantenimiento/ds/Form/Form";
import { FormSelect, FormTextarea } from "@/components/mantenimiento/local/FormExtras";
import { urgenciaPlan, detalleRestante, ETIQUETAS_URGENCIA, TONOS_URGENCIA, type UrgenciaPlan } from "@/lib/mantenimiento/planUtils";
import { puede } from "@/lib/mantenimiento/permisos";
import type { Equipo, PlanMantenimiento, TipoIntervaloPlan } from "@/lib/mantenimiento/types";

interface FormularioPlan {
  equipoId: string;
  nombre: string;
  tipoIntervalo: TipoIntervaloPlan;
  intervaloHoras: string | number;
  intervaloDias: string | number;
  umbralAvisoHoras: string | number;
  umbralAvisoDias: string | number;
  tareasTexto: string;
  activo: boolean;
}

const PLAN_VACIO: FormularioPlan = {
  equipoId: "",
  nombre: "",
  tipoIntervalo: "horas",
  intervaloHoras: 0,
  intervaloDias: 0,
  umbralAvisoHoras: 0,
  umbralAvisoDias: 0,
  tareasTexto: "",
  activo: true
};

const ORDEN_URGENCIA: Record<UrgenciaPlan, number> = { vencido: 0, proximo: 1, al_dia: 2, inactivo: 3 };

interface FilaPlan extends PlanMantenimiento {
  equipo?: Equipo;
  urgencia: UrgenciaPlan;
  detalle: string;
}

export default function PlanesPage() {
  const { equipos, planes, guardarPlan, crearOt, cargando, errorCarga, usuario } = useAppStore();
  const toast = useToast();
  const router = useRouter();
  const puedeEditar = puede(usuario?.rol, "planes.editar");

  const [drawerAbierto, setDrawerAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormularioPlan>(PLAN_VACIO);

  const filas = useMemo<FilaPlan[]>(() => {
    return planes
      .map((p) => {
        const equipo = equipos.find((e) => e.id === p.equipoId);
        return { ...p, equipo, urgencia: urgenciaPlan(p, equipo), detalle: detalleRestante(p, equipo) };
      })
      .sort((a, b) => ORDEN_URGENCIA[a.urgencia] - ORDEN_URGENCIA[b.urgencia]);
  }, [planes, equipos]);

  function abrirNuevo() {
    setEditandoId(null);
    setForm(PLAN_VACIO);
    setDrawerAbierto(true);
  }

  function abrirEdicion(p: FilaPlan) {
    setEditandoId(p.id);
    setForm({ ...PLAN_VACIO, ...p, tareasTexto: (p.tareas || []).join("\n") });
    setDrawerAbierto(true);
  }

  async function guardar() {
    if (!form.equipoId || !form.nombre) {
      toast.error("Equipo y nombre son obligatorios.");
      return;
    }
    try {
      await guardarPlan(
        {
          equipoId: form.equipoId,
          nombre: form.nombre,
          tipoIntervalo: form.tipoIntervalo,
          intervaloHoras: Number(form.intervaloHoras) || 0,
          intervaloDias: Number(form.intervaloDias) || 0,
          umbralAvisoHoras: Number(form.umbralAvisoHoras) || 0,
          umbralAvisoDias: Number(form.umbralAvisoDias) || 0,
          tareas: form.tareasTexto.split("\n").map((t) => t.trim()).filter(Boolean),
          activo: form.activo
        },
        editandoId
      );
      toast.exito(editandoId ? "Plan actualizado." : "Plan creado.");
      setDrawerAbierto(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function generarOt(fila: FilaPlan) {
    const prioridad = fila.urgencia === "vencido" ? "urgente" : fila.urgencia === "proximo" ? "alta" : "media";
    try {
      const ot = await crearOt({
        equipoId: fila.equipoId,
        tipo: "preventivo",
        prioridad,
        titulo: fila.nombre,
        descripcion: `Generada desde el plan de mantenimiento "${fila.nombre}".`,
        responsable: "",
        horometroApertura: fila.equipo?.horometroActual ?? 0,
        planId: fila.id,
        checklist: (fila.tareas || []).map((t) => ({ texto: t, hecho: false }))
      });
      toast.exito(`${ot.numero} generada desde el plan.`);
      router.push(`/mantenimiento/ordenes/${ot.id}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const columnas: ColumnaTabla<FilaPlan>[] = [
    { key: "nombre", header: "Plan" },
    { key: "equipo", header: "Equipo", sortValue: (p) => p.equipo?.nombre ?? "", render: (p) => p.equipo?.nombre ?? "—" },
    {
      key: "intervalo",
      header: "Intervalo",
      render: (p) => (p.tipoIntervalo === "horas" ? `${p.intervaloHoras} h` : p.tipoIntervalo === "dias" ? `${p.intervaloDias} d` : `${p.intervaloHoras} h / ${p.intervaloDias} d`)
    },
    { key: "detalle", header: "Restante" },
    { key: "urgencia", header: "Estado", sortValue: (p) => ORDEN_URGENCIA[p.urgencia], render: (p) => <Pill tone={TONOS_URGENCIA[p.urgencia]}>{ETIQUETAS_URGENCIA[p.urgencia]}</Pill> },
    { key: "activo", header: "Activo", render: (p) => (p.activo ? "Sí" : "No") },
    {
      key: "acciones",
      header: "",
      sticky: true,
      render: (p) => (
        <div style={{ display: "flex", gap: "var(--ds-space-2)" }} onClick={(e) => e.stopPropagation()}>
          {puedeEditar && (p.urgencia === "vencido" || p.urgencia === "proximo") && <Button label="Generar OT" size="sm" color="green" onClick={() => generarOt(p)} />}
          <Button ariaLabel={puedeEditar ? "Editar plan" : "Ver plan"} layout="icon" size="sm" color="white" icon={puedeEditar ? "edit" : "info"} onClick={() => abrirEdicion(p)} />
        </div>
      )
    }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "var(--ds-font-size-heading)", margin: 0 }}>Preventivo</h1>
        {puedeEditar && <Button label="Nuevo plan" color="green" layout="icon-left" icon="plus" onClick={abrirNuevo} />}
      </div>

      <EstadoCarga cargando={cargando} error={errorCarga} />

      <Table tablaKey="planes" columns={columnas} rows={filas} getRowKey={(p) => p.id} onRowClick={abrirEdicion} emptyMessage="No hay planes de mantenimiento." />

      <Drawer
        open={drawerAbierto}
        onClose={() => setDrawerAbierto(false)}
        title={editandoId ? (puedeEditar ? "Editar plan" : "Ver plan") : "Nuevo plan de mantenimiento"}
        footer={puedeEditar ? <Button label="Guardar" color="green" onClick={guardar} /> : undefined}
      >
        <fieldset disabled={!puedeEditar} style={{ border: "none", margin: 0, padding: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-4)" }}>
          <FormSelect
            label="Equipo"
            value={form.equipoId}
            onChange={(e) => setForm({ ...form, equipoId: e.target.value })}
            placeholder="Seleccioná un equipo"
            options={equipos.map((e) => ({ value: e.id, label: `${e.codigo} — ${e.nombre}` }))}
          />
          <FormField label="Nombre del plan" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          <FormSelect
            label="Tipo de intervalo"
            value={form.tipoIntervalo}
            onChange={(e) => setForm({ ...form, tipoIntervalo: e.target.value as TipoIntervaloPlan })}
            options={[
              { value: "horas", label: "Horas" },
              { value: "dias", label: "Días" },
              { value: "ambos", label: "Ambos (lo que ocurra primero)" }
            ]}
          />
          {form.tipoIntervalo !== "dias" && (
            <>
              <FormField label="Intervalo (horas)" type="number" value={String(form.intervaloHoras)} onChange={(e) => setForm({ ...form, intervaloHoras: e.target.value })} />
              <FormField label="Aviso con anticipación (horas)" type="number" value={String(form.umbralAvisoHoras)} onChange={(e) => setForm({ ...form, umbralAvisoHoras: e.target.value })} />
            </>
          )}
          {form.tipoIntervalo !== "horas" && (
            <>
              <FormField label="Intervalo (días)" type="number" value={String(form.intervaloDias)} onChange={(e) => setForm({ ...form, intervaloDias: e.target.value })} />
              <FormField label="Aviso con anticipación (días)" type="number" value={String(form.umbralAvisoDias)} onChange={(e) => setForm({ ...form, umbralAvisoDias: e.target.value })} />
            </>
          )}
          <FormTextarea label="Tareas del checklist (una por línea)" value={form.tareasTexto} onChange={(e) => setForm({ ...form, tareasTexto: e.target.value })} rows={5} />
          <CheckBox label="Plan activo" state={puedeEditar ? "standard" : "disabled"} checked={form.activo} onChange={(v) => setForm({ ...form, activo: v })} />
        </div>
        </fieldset>
      </Drawer>
    </div>
  );
}
