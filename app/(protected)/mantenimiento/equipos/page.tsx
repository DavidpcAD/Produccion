"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/mantenimiento/store";
import { useToast } from "@/components/mantenimiento/local/Toast";
import { Table, Pill, marcarFilaParaVolver, type ColumnaTabla } from "@/components/mantenimiento/local/Table";
import { Drawer } from "@/components/mantenimiento/local/Drawer";
import { FilterChips } from "@/components/mantenimiento/local/FilterChips";
import { EstadoCarga } from "@/components/mantenimiento/local/EstadoCarga";
import { Button } from "@/components/mantenimiento/ds/Button/Button";
import { FormField } from "@/components/mantenimiento/ds/Form/Form";
import { FormSelect, FormTextarea } from "@/components/mantenimiento/local/FormExtras";
import { SearchBar } from "@/components/mantenimiento/ds/SearchBar/SearchBar";
import { ESTADOS_EQUIPO } from "@/lib/mantenimiento/mockData";
import { horasRestantesSimple, kilometrosRestantesSimple, toneRestante, diasHastaProximoMantenimiento, toneFechaProxima } from "@/lib/mantenimiento/planUtils";
import { puede, puedeEditarCampoEquipo, estadoCampo } from "@/lib/mantenimiento/permisos";
import type { Equipo, EstadoEquipo } from "@/lib/mantenimiento/types";

const ESTADO_TONO: Record<EstadoEquipo, "green" | "yellow" | "red"> = { operativo: "green", mantenimiento: "yellow", fuera_servicio: "red" };
const ESTADO_LABEL: Record<EstadoEquipo, string> = { operativo: "Operativo", mantenimiento: "Mantenimiento", fuera_servicio: "Fuera de servicio" };

interface FormularioEquipo {
  codigo: string;
  nombre: string;
  tipo: string;
  marca: string;
  modelo: string;
  anio: string;
  numeroSerie: string;
  horometroActual: string | number;
  estado: EstadoEquipo;
  ubicacion: string;
  intervaloHorasPreventivo: string | number;
  intervaloKilometrajePreventivo: string | number;
  notas: string;
  placa: string;
  revisionTecnica: string;
  fechaIngreso: string;
  kilometraje: string | number;
  combustible: string;
  filtroAceite: string;
  filtroDiesel: string;
  filtroAireAcondicionado: string;
  llantasDelanteras: string;
  llantasTraseras: string;
  cilindraje: string;
  ultimaFechaMantenimiento: string;
  proximaFechaMantenimiento: string;
  stockActual?: number;
}

const EQUIPO_VACIO: FormularioEquipo = {
  codigo: "",
  nombre: "",
  tipo: "",
  marca: "",
  modelo: "",
  anio: "",
  numeroSerie: "",
  horometroActual: 0,
  estado: "operativo",
  ubicacion: "",
  intervaloHorasPreventivo: 0,
  intervaloKilometrajePreventivo: "",
  notas: "",
  placa: "",
  revisionTecnica: "",
  fechaIngreso: "",
  kilometraje: "",
  combustible: "",
  filtroAceite: "",
  filtroDiesel: "",
  filtroAireAcondicionado: "",
  llantasDelanteras: "",
  llantasTraseras: "",
  cilindraje: "",
  ultimaFechaMantenimiento: "",
  proximaFechaMantenimiento: ""
};

const OPCIONES_COMBUSTIBLE = ["Diesel", "Gasolina", "Eléctrico", "N/A"];

export default function EquiposPage() {
  const { equipos, guardarEquipo, registrarLectura, cargando, errorCarga, usuario } = useAppStore();
  const toast = useToast();
  const router = useRouter();

  const rol = usuario?.rol;
  const puedeEditar = puede(rol, "equipos.editar");
  const puedeRegistrarLectura = puede(rol, "equipos.registrarLectura");

  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [drawerAbierto, setDrawerAbierto] = useState(false);
  const [drawerLectura, setDrawerLectura] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormularioEquipo>(EQUIPO_VACIO);
  const [lectura, setLectura] = useState({ horometro: "", nota: "" });

  const filas = useMemo(() => {
    return equipos.filter((eq) => {
      const coincideTexto = `${eq.codigo} ${eq.nombre} ${eq.marca ?? ""}`.toLowerCase().includes(busqueda.toLowerCase());
      const coincideEstado = filtroEstado === "todos" || eq.estado === filtroEstado;
      return coincideTexto && coincideEstado;
    });
  }, [equipos, busqueda, filtroEstado]);

  function abrirNuevo() {
    setEditandoId(null);
    setForm(EQUIPO_VACIO);
    setDrawerAbierto(true);
  }

  function abrirEdicion(eq: Equipo) {
    setEditandoId(eq.id);
    setForm({ ...EQUIPO_VACIO, ...eq, anio: eq.anio == null ? "" : String(eq.anio) } as unknown as FormularioEquipo);
    setDrawerAbierto(true);
  }

  async function guardar() {
    if (!form.codigo || !form.nombre) {
      toast.error("Código y nombre son obligatorios.");
      return;
    }
    try {
      await guardarEquipo(
        {
          ...form,
          anio: form.anio ? Number(form.anio) : null,
          horometroActual: Number(form.horometroActual),
          intervaloHorasPreventivo: Number(form.intervaloHorasPreventivo),
          intervaloKilometrajePreventivo: form.intervaloKilometrajePreventivo === "" ? null : Number(form.intervaloKilometrajePreventivo),
          kilometraje: form.kilometraje === "" ? null : Number(form.kilometraje)
        },
        editandoId
      );
      toast.exito(editandoId ? "Equipo actualizado." : "Equipo creado.");
      setDrawerAbierto(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function guardarLectura() {
    const valor = Number(lectura.horometro);
    if (!Number.isFinite(valor) || !drawerLectura) {
      toast.error("Ingresá un horómetro válido.");
      return;
    }
    try {
      await registrarLectura(drawerLectura, valor, lectura.nota);
      toast.exito("Lectura registrada.");
      setDrawerLectura(null);
      setLectura({ horometro: "", nota: "" });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function verHistorial(eq: Equipo) {
    marcarFilaParaVolver("equipos", eq.id);
    router.push(`/mantenimiento/equipos/${eq.id}`);
  }

  const columnas: ColumnaTabla<Equipo>[] = [
    { key: "codigo", header: "Código", movil: "titulo" },
    { key: "nombre", header: "Nombre", movil: "titulo" },
    { key: "placa", header: "Placa", render: (eq) => eq.placa || "—" },
    { key: "horometroActual", header: "Horómetro", render: (eq) => `${eq.horometroActual.toLocaleString("es-CR")} h`, align: "right" },
    { key: "estado", header: "Estado", render: (eq) => <Pill tone={ESTADO_TONO[eq.estado]}>{ESTADO_LABEL[eq.estado]}</Pill>, sortValue: (eq) => eq.estado },
    {
      key: "proximoMantenimiento",
      header: "Próx. mantenimiento",
      sortValue: (eq) => horasRestantesSimple(eq) ?? kilometrosRestantesSimple(eq) ?? diasHastaProximoMantenimiento(eq) ?? Infinity,
      render: (eq) => {
        const horasRestantes = horasRestantesSimple(eq);
        const kmRestantes = kilometrosRestantesSimple(eq);
        const diasProxima = diasHastaProximoMantenimiento(eq);
        if (horasRestantes == null && kmRestantes == null && diasProxima == null) {
          return <span style={{ color: "var(--ds-color-gray-300)" }}>Sin intervalo cargado</span>;
        }
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-1)" }}>
            {horasRestantes != null && (
              <Pill tone={toneRestante(horasRestantes, eq.intervaloHorasPreventivo)}>{horasRestantes.toFixed(0)} h</Pill>
            )}
            {kmRestantes != null && (
              <Pill tone={toneRestante(kmRestantes, eq.intervaloKilometrajePreventivo ?? 0)}>{kmRestantes.toFixed(0)} km</Pill>
            )}
            {diasProxima != null && (
              <Pill tone={toneFechaProxima(diasProxima)}>
                {diasProxima <= 0 ? `Vencido (${eq.proximaFechaMantenimiento})` : `${eq.proximaFechaMantenimiento} (${diasProxima}d)`}
              </Pill>
            )}
          </div>
        );
      }
    },
    {
      key: "kilometraje",
      header: "Kilometraje",
      align: "right",
      // En celular se omite para que la tarjeta sea más corta (está en la ficha).
      movil: "oculto",
      sortValue: (eq) => eq.kilometraje ?? -1,
      render: (eq) => (eq.kilometraje != null ? `${eq.kilometraje.toLocaleString("es-CR")} km` : "—")
    },
    {
      key: "acciones",
      header: "",
      sticky: true,
      render: (eq) => (
        <div style={{ display: "flex", gap: "var(--ds-space-2)" }} onClick={(e) => e.stopPropagation()}>
          {puedeRegistrarLectura && (
            <Button
              ariaLabel="Registrar lectura"
              layout="icon"
              size="sm"
              color="white"
              icon="info"
              onClick={() => {
                setDrawerLectura(eq.id);
                setLectura({ horometro: String(eq.horometroActual), nota: "" });
              }}
            />
          )}
          <Button ariaLabel="Ver historial de repuestos" layout="icon" size="sm" color="white" icon="list" onClick={() => verHistorial(eq)} />
          {puedeEditar && (
            <Button
              ariaLabel="Checklist diario"
              layout="icon"
              size="sm"
              color="white"
              icon="completado"
              onClick={() => router.push(`/mantenimiento/equipos/${eq.id}#checklist`)}
            />
          )}
          <Button ariaLabel={puedeEditar ? "Editar equipo" : "Ver equipo"} layout="icon" size="sm" color="white" icon={puedeEditar ? "edit" : "info"} onClick={() => abrirEdicion(eq)} />
        </div>
      )
    }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--ds-space-3)" }}>
        <h1 style={{ fontSize: "var(--ds-font-size-heading)", margin: 0 }}>Equipos</h1>
        {puedeEditar && <Button label="Nuevo equipo" color="green" layout="icon-left" icon="plus" onClick={abrirNuevo} />}
      </div>

      <EstadoCarga cargando={cargando} error={errorCarga} />

      <div style={{ display: "flex", alignItems: "center", gap: "var(--ds-space-4)", flexWrap: "wrap" }}>
        <div style={{ width: 300 }}>
          <SearchBar
            layout="label"
            placeholder="Buscar por código, nombre o marca"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onClose={busqueda ? () => setBusqueda("") : undefined}
          />
        </div>
        <FilterChips
          value={filtroEstado}
          onChange={setFiltroEstado}
          options={[{ value: "todos", label: "Todos" }, ...ESTADOS_EQUIPO.map((estado) => ({ value: estado, label: ESTADO_LABEL[estado] }))]}
        />
      </div>

      <Table tablaKey="equipos" columns={columnas} rows={filas} getRowKey={(eq) => eq.id} onRowClick={abrirEdicion} emptyMessage="No hay equipos que coincidan con el filtro." />

      <Drawer
        open={drawerAbierto}
        onClose={() => setDrawerAbierto(false)}
        title={editandoId ? (puedeEditar ? "Editar equipo" : "Ver equipo") : "Nuevo equipo"}
        subtitle={!puedeEditar ? "Tu rol solo puede consultar esta ficha." : undefined}
        footer={puedeEditar ? <Button label="Guardar" color="green" onClick={guardar} /> : undefined}
      >
        <fieldset disabled={!puedeEditar} style={{ border: "none", margin: 0, padding: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-4)" }}>
          <FormField label="Código" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
          <FormField label="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          <FormField label="Tipo" value={form.tipo ?? ""} onChange={(e) => setForm({ ...form, tipo: e.target.value })} />
          <FormField label="Marca" value={form.marca ?? ""} onChange={(e) => setForm({ ...form, marca: e.target.value })} />
          <FormField label="Modelo" value={form.modelo ?? ""} onChange={(e) => setForm({ ...form, modelo: e.target.value })} />
          <FormField label="Año" type="number" value={String(form.anio ?? "")} onChange={(e) => setForm({ ...form, anio: e.target.value })} />
          <FormField
            label="N° de serie"
            value={form.numeroSerie ?? ""}
            onChange={(e) => setForm({ ...form, numeroSerie: e.target.value })}
            state={estadoCampo(puedeEditarCampoEquipo(rol, "numeroSerie"))}
            helperText={!puedeEditarCampoEquipo(rol, "numeroSerie") && puedeEditar ? "Solo el administrador puede corregir este dato." : undefined}
          />
          <FormField
            label="Placa"
            value={form.placa ?? ""}
            onChange={(e) => setForm({ ...form, placa: e.target.value })}
            state={estadoCampo(puedeEditarCampoEquipo(rol, "placa"))}
            helperText={!puedeEditarCampoEquipo(rol, "placa") && puedeEditar ? "Solo el administrador puede corregir este dato." : undefined}
          />
          <FormField
            label="Revisión técnica"
            placeholder="ej. oct-26"
            value={form.revisionTecnica ?? ""}
            onChange={(e) => setForm({ ...form, revisionTecnica: e.target.value })}
            state={estadoCampo(puedeEditarCampoEquipo(rol, "revisionTecnica"))}
            helperText={!puedeEditarCampoEquipo(rol, "revisionTecnica") && puedeEditar ? "Solo el administrador puede corregir este dato." : undefined}
          />
          <FormField
            label="Fecha de ingreso a la compañía"
            placeholder="ej. 2023 o jul-2027"
            value={form.fechaIngreso ?? ""}
            onChange={(e) => setForm({ ...form, fechaIngreso: e.target.value })}
          />
          <FormField label="Kilometraje" type="number" value={String(form.kilometraje ?? "")} onChange={(e) => setForm({ ...form, kilometraje: e.target.value })} />
          <FormSelect
            label="Combustible"
            value={form.combustible ?? ""}
            onChange={(e) => setForm({ ...form, combustible: e.target.value })}
            placeholder="Sin especificar"
            options={OPCIONES_COMBUSTIBLE.map((c) => ({ value: c, label: c }))}
          />
          <FormField
            label="Modelo filtro de aceite"
            placeholder="ej. HY379006097A"
            value={form.filtroAceite ?? ""}
            onChange={(e) => setForm({ ...form, filtroAceite: e.target.value })}
          />
          <FormField
            label="Modelo filtro de diésel"
            placeholder="ej. HY349004017"
            value={form.filtroDiesel ?? ""}
            onChange={(e) => setForm({ ...form, filtroDiesel: e.target.value })}
          />
          <FormField
            label="Modelo filtro de aire acondicionado"
            placeholder="ej. H906244500"
            value={form.filtroAireAcondicionado ?? ""}
            onChange={(e) => setForm({ ...form, filtroAireAcondicionado: e.target.value })}
          />
          <FormField
            label="Llantas delanteras"
            placeholder="ej. 385/65R22.5"
            value={form.llantasDelanteras ?? ""}
            onChange={(e) => setForm({ ...form, llantasDelanteras: e.target.value })}
          />
          <FormField
            label="Llantas traseras"
            placeholder="ej. 315/80R22.5"
            value={form.llantasTraseras ?? ""}
            onChange={(e) => setForm({ ...form, llantasTraseras: e.target.value })}
          />
          <FormField
            label="Cilindraje"
            placeholder="ej. 2.2L / 4400cc / 112 hp"
            value={form.cilindraje ?? ""}
            onChange={(e) => setForm({ ...form, cilindraje: e.target.value })}
          />
          <FormField
            label="Fecha del último mantenimiento"
            placeholder="ej. 2026-09-15"
            value={form.ultimaFechaMantenimiento ?? ""}
            onChange={(e) => setForm({ ...form, ultimaFechaMantenimiento: e.target.value })}
          />
          <FormField
            label="Fecha del próximo mantenimiento"
            placeholder="ej. 2026-12-15"
            value={form.proximaFechaMantenimiento ?? ""}
            onChange={(e) => setForm({ ...form, proximaFechaMantenimiento: e.target.value })}
          />
          <FormField label="Horómetro actual" type="number" value={String(form.horometroActual)} onChange={(e) => setForm({ ...form, horometroActual: e.target.value })} />
          <FormSelect
            label="Estado"
            value={form.estado}
            onChange={(e) => setForm({ ...form, estado: e.target.value as EstadoEquipo })}
            options={ESTADOS_EQUIPO.map((e) => ({ value: e, label: ESTADO_LABEL[e] }))}
          />
          <FormField label="Ubicación" value={form.ubicacion ?? ""} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} />
          <FormField
            label="Intervalo preventivo por horas (equipo con horómetro)"
            type="number"
            value={String(form.intervaloHorasPreventivo)}
            onChange={(e) => setForm({ ...form, intervaloHorasPreventivo: e.target.value })}
          />
          <FormField
            label="Intervalo preventivo por kilometraje (vehículos de carretera)"
            type="number"
            value={String(form.intervaloKilometrajePreventivo ?? "")}
            onChange={(e) => setForm({ ...form, intervaloKilometrajePreventivo: e.target.value })}
          />
          <FormTextarea label="Notas" value={form.notas ?? ""} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
        </div>
        </fieldset>
      </Drawer>

      <Drawer
        open={!!drawerLectura}
        onClose={() => setDrawerLectura(null)}
        title="Registrar lectura de horómetro"
        footer={<Button label="Guardar lectura" color="green" onClick={guardarLectura} />}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-4)" }}>
          <FormField label="Horómetro" type="number" value={lectura.horometro} onChange={(e) => setLectura({ ...lectura, horometro: e.target.value })} />
          <FormTextarea label="Nota (opcional)" value={lectura.nota} onChange={(e) => setLectura({ ...lectura, nota: e.target.value })} />
        </div>
      </Drawer>
    </div>
  );
}
