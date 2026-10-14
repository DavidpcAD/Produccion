"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAppStore } from "@/lib/mantenimiento/store";
import { useToast } from "@/components/mantenimiento/local/Toast";
import { Table, Pill, type ColumnaTabla } from "@/components/mantenimiento/local/Table";
import { Drawer } from "@/components/mantenimiento/local/Drawer";
import { FilterChips } from "@/components/mantenimiento/local/FilterChips";
import { EstadoCarga } from "@/components/mantenimiento/local/EstadoCarga";
import { Button } from "@/components/mantenimiento/ds/Button/Button";
import { FormField } from "@/components/mantenimiento/ds/Form/Form";
import { FormSelect, FormTextarea } from "@/components/mantenimiento/local/FormExtras";
import { SearchBar } from "@/components/mantenimiento/ds/SearchBar/SearchBar";
import { puede } from "@/lib/mantenimiento/permisos";
import type { MovimientoRepuesto, Repuesto } from "@/lib/mantenimiento/types";

interface FormularioRepuesto {
  codigo: string;
  nombre: string;
  categoria: string;
  unidad: string;
  costoUnitario: string | number;
  stockMinimo: string | number;
  ubicacionBodega: string;
  notas: string;
  equipoId?: string | null;
  stockActual?: number;
}

const REPUESTO_VACIO: FormularioRepuesto = {
  codigo: "",
  nombre: "",
  categoria: "",
  unidad: "unidad",
  costoUnitario: 0,
  stockMinimo: 0,
  ubicacionBodega: "",
  notas: ""
};

export default function RepuestosPage() {
  return (
    <Suspense fallback={<EstadoCarga cargando error={null} />}>
      <RepuestosPageInterna />
    </Suspense>
  );
}

function RepuestosPageInterna() {
  const { equipos, repuestos, movimientos, guardarRepuesto, registrarMovimiento, cargando, errorCarga, usuario } = useAppStore();
  const toast = useToast();
  const searchParams = useSearchParams();
  const puedeEditar = puede(usuario?.rol, "repuestos.editar");
  const puedeMovimiento = puede(usuario?.rol, "repuestos.movimiento");

  // Cada repuesto es de UN equipo (ver sql/003_repuestos_por_equipo.sql) —
  // esta pantalla siempre muestra el repertorio de una sola máquina a la
  // vez, nunca todos los repuestos de todos los equipos mezclados. Si llegan
  // por un link con ?equipo=<id> (ej. desde la ficha del equipo), arranca en
  // ese; si no, en el primero de la lista.
  const [equipoId, setEquipoId] = useState<string | null>(null);
  useEffect(() => {
    if (equipoId || !equipos.length) return;
    const desdeQuery = searchParams.get("equipo");
    setEquipoId(desdeQuery && equipos.some((e) => e.id === desdeQuery) ? desdeQuery : equipos[0].id);
  }, [equipos, equipoId, searchParams]);

  const [busqueda, setBusqueda] = useState("");
  const [soloBajoStock, setSoloBajoStock] = useState("todos");
  const [drawerAbierto, setDrawerAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormularioRepuesto>(REPUESTO_VACIO);
  const [movimientoRepuesto, setMovimientoRepuesto] = useState<Repuesto | null>(null);
  const [movimiento, setMovimiento] = useState({ tipo: "entrada", cantidad: "", motivo: "" });

  const repuestosDelEquipo = useMemo(() => repuestos.filter((r) => r.equipoId === equipoId), [repuestos, equipoId]);

  const filas = useMemo(() => {
    return repuestosDelEquipo.filter((r) => {
      const coincideTexto = `${r.codigo} ${r.nombre}`.toLowerCase().includes(busqueda.toLowerCase());
      const coincideStock = soloBajoStock === "todos" || r.stockActual <= r.stockMinimo;
      return coincideTexto && coincideStock;
    });
  }, [repuestosDelEquipo, busqueda, soloBajoStock]);

  const ultimosMovimientos = useMemo(() => {
    const idsDelEquipo = new Set(repuestosDelEquipo.map((r) => r.id));
    return [...movimientos]
      .filter((m) => idsDelEquipo.has(m.repuestoId))
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      .slice(0, 10)
      .map((m) => ({ ...m, repuesto: repuestos.find((r) => r.id === m.repuestoId) }));
  }, [movimientos, repuestos, repuestosDelEquipo]);

  function abrirNuevo() {
    setEditandoId(null);
    setForm({ ...REPUESTO_VACIO, equipoId });
    setDrawerAbierto(true);
  }

  function abrirEdicion(r: Repuesto) {
    setEditandoId(r.id);
    setForm({ ...REPUESTO_VACIO, ...r });
    setDrawerAbierto(true);
  }

  async function guardar() {
    if (!form.codigo || !form.nombre) {
      toast.error("Código y nombre son obligatorios.");
      return;
    }
    if (!form.equipoId) {
      toast.error("Elegí a qué equipo pertenece este repuesto.");
      return;
    }
    const datos: Partial<Repuesto> = { ...form, costoUnitario: Number(form.costoUnitario), stockMinimo: Number(form.stockMinimo) };
    delete datos.stockActual; // el stock solo se ajusta desde Movimiento
    try {
      await guardarRepuesto(datos, editandoId);
      toast.exito(editandoId ? "Repuesto actualizado." : "Repuesto creado.");
      setDrawerAbierto(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function guardarMovimiento() {
    const cantidad = Number(movimiento.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      toast.error("Ingresá una cantidad válida.");
      return;
    }
    if (!movimiento.motivo || !movimientoRepuesto) {
      toast.error("El motivo es obligatorio.");
      return;
    }
    try {
      await registrarMovimiento({ repuestoId: movimientoRepuesto.id, ...movimiento, cantidad });
      toast.exito("Movimiento registrado.");
      setMovimientoRepuesto(null);
      setMovimiento({ tipo: "entrada", cantidad: "", motivo: "" });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const columnas: ColumnaTabla<Repuesto>[] = [
    { key: "codigo", header: "Código" },
    { key: "nombre", header: "Nombre" },
    { key: "categoria", header: "Categoría" },
    {
      key: "stockActual",
      header: "Stock",
      render: (r) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 90 }}>
          <span>
            {r.stockActual} / mín. {r.stockMinimo} {r.unidad}
          </span>
          <div style={{ height: 6, background: "var(--ds-color-gray-100)", borderRadius: "var(--ds-radius-sm)", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, (r.stockActual / Math.max(1, r.stockMinimo * 2)) * 100)}%`,
                background: r.stockActual <= r.stockMinimo ? "var(--ds-color-red-200)" : "var(--ds-color-green-100)"
              }}
            />
          </div>
        </div>
      )
    },
    { key: "costoUnitario", header: "Costo unitario", render: (r) => `₡${r.costoUnitario.toLocaleString("es-CR")}`, align: "right" },
    { key: "ubicacionBodega", header: "Ubicación" },
    {
      key: "estado",
      header: "Estado",
      sortValue: (r) => (r.stockActual <= r.stockMinimo ? 0 : 1),
      render: (r) => <Pill tone={r.stockActual <= r.stockMinimo ? "red" : "green"}>{r.stockActual <= r.stockMinimo ? "Bajo mínimo" : "OK"}</Pill>
    },
    {
      key: "acciones",
      header: "",
      sticky: true,
      render: (r) => (
        <div style={{ display: "flex", gap: "var(--ds-space-2)" }} onClick={(e) => e.stopPropagation()}>
          {puedeMovimiento && (
            <Button
              label="Movimiento"
              size="sm"
              color="white"
              onClick={() => {
                setMovimientoRepuesto(r);
                setMovimiento({ tipo: "entrada", cantidad: "", motivo: "" });
              }}
            />
          )}
          <Button ariaLabel={puedeEditar ? "Editar repuesto" : "Ver repuesto"} layout="icon" size="sm" color="white" icon={puedeEditar ? "edit" : "info"} onClick={() => abrirEdicion(r)} />
        </div>
      )
    }
  ];

  const columnasMovimientos: ColumnaTabla<MovimientoRepuesto & { repuesto?: Repuesto }>[] = [
    { key: "fecha", header: "Fecha", render: (m) => new Date(m.fecha).toLocaleString("es-CR") },
    { key: "repuesto", header: "Repuesto", render: (m) => m.repuesto?.nombre ?? "—" },
    { key: "tipo", header: "Tipo", render: (m) => <Pill tone={m.tipo === "entrada" ? "green" : "black"}>{m.tipo}</Pill> },
    { key: "cantidad", header: "Cantidad", align: "right" },
    { key: "motivo", header: "Motivo" },
    { key: "responsable", header: "Responsable" }
  ];

  const equipoActual = equipos.find((e) => e.id === equipoId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "var(--ds-font-size-heading)", margin: 0 }}>Repuestos</h1>
        {puedeEditar && <Button label="Nuevo repuesto" color="green" layout="icon-left" icon="plus" onClick={abrirNuevo} state={equipoId ? "standard" : "disabled"} />}
      </div>

      <EstadoCarga cargando={cargando} error={errorCarga} />

      <div style={{ maxWidth: 340 }}>
        <FormSelect
          label="Equipo"
          value={equipoId ?? ""}
          onChange={(e) => setEquipoId(e.target.value)}
          options={equipos.map((e) => ({ value: e.id, label: `${e.codigo} — ${e.nombre}` }))}
        />
      </div>

      {equipoId && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--ds-space-4)", flexWrap: "wrap" }}>
            <div style={{ width: 300 }}>
              <SearchBar layout="label" placeholder="Buscar por código o nombre" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} onClose={busqueda ? () => setBusqueda("") : undefined} />
            </div>
            <FilterChips
              value={soloBajoStock}
              onChange={setSoloBajoStock}
              options={[
                { value: "todos", label: "Todos" },
                { value: "bajo", label: "Solo bajo stock" }
              ]}
            />
          </div>

          <Table
            tablaKey="repuestos"
            columns={columnas}
            rows={filas}
            getRowKey={(r) => r.id}
            onRowClick={abrirEdicion}
            emptyMessage={`${equipoActual?.nombre ?? "Este equipo"} todavía no tiene repuestos registrados.`}
          />

          <div>
            <div style={{ fontWeight: "var(--ds-font-weight-semibold)", marginBottom: "var(--ds-space-3)" }}>Últimos movimientos de {equipoActual?.nombre}</div>
            <Table tablaKey="movimientos-repuesto" columns={columnasMovimientos} rows={ultimosMovimientos} getRowKey={(m) => m.id} emptyMessage="Sin movimientos registrados." />
          </div>
        </>
      )}

      <Drawer
        open={drawerAbierto}
        onClose={() => setDrawerAbierto(false)}
        title={editandoId ? (puedeEditar ? "Editar repuesto" : "Ver repuesto") : "Nuevo repuesto"}
        footer={puedeEditar ? <Button label="Guardar" color="green" onClick={guardar} /> : undefined}
      >
        <fieldset disabled={!puedeEditar} style={{ border: "none", margin: 0, padding: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-4)" }}>
          <FormSelect
            label="Equipo"
            value={form.equipoId ?? ""}
            onChange={(e) => setForm({ ...form, equipoId: e.target.value })}
            placeholder="Seleccioná un equipo"
            options={equipos.map((e) => ({ value: e.id, label: `${e.codigo} — ${e.nombre}` }))}
          />
          <FormField label="Código" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
          <FormField label="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          <FormField label="Categoría" value={form.categoria ?? ""} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
          <FormField label="Unidad" value={form.unidad ?? ""} onChange={(e) => setForm({ ...form, unidad: e.target.value })} />
          <FormField label="Costo unitario" type="number" value={String(form.costoUnitario)} onChange={(e) => setForm({ ...form, costoUnitario: e.target.value })} />
          <FormField label="Stock mínimo" type="number" value={String(form.stockMinimo)} onChange={(e) => setForm({ ...form, stockMinimo: e.target.value })} />
          {editandoId && <FormField label="Stock actual (ajustalo desde Movimiento)" value={String(form.stockActual)} type="number" state="disabled" />}
          <FormField label="Ubicación en bodega" value={form.ubicacionBodega ?? ""} onChange={(e) => setForm({ ...form, ubicacionBodega: e.target.value })} />
          <FormTextarea label="Notas" value={form.notas ?? ""} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
        </div>
        </fieldset>
      </Drawer>

      <Drawer
        open={!!movimientoRepuesto}
        onClose={() => setMovimientoRepuesto(null)}
        title="Registrar movimiento"
        subtitle={movimientoRepuesto ? `${movimientoRepuesto.nombre} — stock actual: ${movimientoRepuesto.stockActual}` : ""}
        footer={<Button label="Guardar movimiento" color="green" onClick={guardarMovimiento} />}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-4)" }}>
          <FormSelect
            label="Tipo"
            value={movimiento.tipo}
            onChange={(e) => setMovimiento({ ...movimiento, tipo: e.target.value })}
            options={[
              { value: "entrada", label: "Entrada" },
              { value: "salida", label: "Salida" }
            ]}
          />
          <FormField label="Cantidad" type="number" value={movimiento.cantidad} onChange={(e) => setMovimiento({ ...movimiento, cantidad: e.target.value })} />
          <FormField label="Motivo" value={movimiento.motivo} onChange={(e) => setMovimiento({ ...movimiento, motivo: e.target.value })} />
        </div>
      </Drawer>
    </div>
  );
}
