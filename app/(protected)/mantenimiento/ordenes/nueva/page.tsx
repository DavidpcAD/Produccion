"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/mantenimiento/store";
import { useToast } from "@/components/mantenimiento/local/Toast";
import { Button } from "@/components/mantenimiento/ds/Button/Button";
import { FormField } from "@/components/mantenimiento/ds/Form/Form";
import { FormSelect, FormTextarea, FormDate } from "@/components/mantenimiento/local/FormExtras";
import { TIPOS_OT, PRIORIDADES_OT } from "@/lib/mantenimiento/mockData";
import type { PrioridadOt, TipoOt } from "@/lib/mantenimiento/types";

const TIPO_LABEL: Record<TipoOt, string> = { preventivo: "Preventivo", correctivo: "Correctivo", predictivo: "Predictivo" };
const PRIORIDAD_LABEL: Record<PrioridadOt, string> = { baja: "Baja", media: "Media", alta: "Alta", urgente: "Urgente" };

export default function NuevaOtPage() {
  const { equipos, crearOt } = useAppStore();
  const toast = useToast();
  const router = useRouter();

  const [form, setForm] = useState({
    equipoId: "",
    tipo: "correctivo" as TipoOt,
    prioridad: "media" as PrioridadOt,
    titulo: "",
    descripcion: "",
    fechaProgramada: "",
    responsable: "",
    horometroApertura: "",
    checklistTexto: ""
  });

  function seleccionarEquipo(equipoId: string) {
    const equipo = equipos.find((e) => e.id === equipoId);
    setForm({ ...form, equipoId, horometroApertura: equipo ? String(equipo.horometroActual) : "" });
  }

  async function crear() {
    if (!form.equipoId || !form.titulo) {
      toast.error("Equipo y título son obligatorios.");
      return;
    }
    try {
      const ot = await crearOt({
        equipoId: form.equipoId,
        tipo: form.tipo,
        prioridad: form.prioridad,
        titulo: form.titulo,
        descripcion: form.descripcion,
        fechaProgramada: form.fechaProgramada ? new Date(form.fechaProgramada).toISOString() : null,
        responsable: form.responsable,
        horometroApertura: Number(form.horometroApertura) || 0,
        planId: null,
        checklist: form.checklistTexto
          .split("\n")
          .map((t) => t.trim())
          .filter(Boolean)
          .map((texto) => ({ texto, hecho: false }))
      });
      toast.exito(`${ot.numero} creada.`);
      router.push(`/mantenimiento/ordenes/${ot.id}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-5)", maxWidth: 480 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "var(--ds-font-size-heading)", margin: 0 }}>Nueva orden de trabajo</h1>
        <Button label="Volver" color="white" onClick={() => router.push("/mantenimiento/ordenes")} />
      </div>

      <FormSelect
        label="Equipo"
        value={form.equipoId}
        onChange={(e) => seleccionarEquipo(e.target.value)}
        placeholder="Seleccioná un equipo"
        options={equipos.map((e) => ({ value: e.id, label: `${e.codigo} — ${e.nombre}` }))}
      />
      <FormSelect label="Tipo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoOt })} options={TIPOS_OT.map((t) => ({ value: t, label: TIPO_LABEL[t] }))} />
      <FormSelect
        label="Prioridad"
        value={form.prioridad}
        onChange={(e) => setForm({ ...form, prioridad: e.target.value as PrioridadOt })}
        options={PRIORIDADES_OT.map((p) => ({ value: p, label: PRIORIDAD_LABEL[p] }))}
      />
      <FormField label="Título" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
      <FormTextarea label="Descripción" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
      <FormDate label="Fecha programada (opcional)" value={form.fechaProgramada} onChange={(e) => setForm({ ...form, fechaProgramada: e.target.value })} />
      <FormField label="Horómetro de apertura" type="number" value={form.horometroApertura} onChange={(e) => setForm({ ...form, horometroApertura: e.target.value })} />
      <FormField label="Responsable" value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })} />
      <FormTextarea label="Checklist sugerido (una tarea por línea, opcional)" value={form.checklistTexto} onChange={(e) => setForm({ ...form, checklistTexto: e.target.value })} rows={5} />

      <Button label="Crear orden de trabajo" color="green" onClick={crear} />
    </div>
  );
}
