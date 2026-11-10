'use client';
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { OptionLabel } from '@/components/ds/Form/Form';
import { Icon } from '@/components/ds/Icon/Icon';
import { BadgeBloqueado, BadgeTipo, combosProducto, cuandoFue } from '@/components/bc/productos-ui';
import {
  GRUPO_INVENTARIO_DEFECTO, GRUPO_PRODUCTO_POR_TIPO, MAX_DESCRIPCION, TIPOS_PRODUCTO,
  type CambiosProducto, type FichaProductoBc, type OpcionesProducto, type TipoProducto,
} from '@/lib/bc/productos';

// Ficha de UN producto de Business Central: se lee en vivo de BC al abrirla (así se
// ve lo que alguien haya cambiado allá) y desde acá se cambia o se bloquea.
// Guardar manda la versión que se abrió: si en el medio alguien lo cambió en BC,
// BC lo rechaza y la ficha se recarga con lo de BC, sin pisar nada.
//
// Uso: <FichaProducto key={code} code={code} onClose={…} onCambio={…} />
// El `key` es para que cada producto arranque de cero.

interface Form {
  descripcion: string;
  tipo: TipoProducto;
  categoria: string;
  unidad: string;
  grupoProducto: string;
  grupoInventario: string;
  precio: string;
}

const formDe = (f: FichaProductoBc): Form => ({
  descripcion: f.descripcion,
  tipo: f.tipo,
  categoria: f.categoria,
  unidad: f.unidad,
  grupoProducto: f.grupoProducto,
  grupoInventario: f.grupoInventario,
  precio: f.precio ? String(f.precio) : '',
});

const num = new Intl.NumberFormat('es-CR', { maximumFractionDigits: 2 });

/** Espacios de más o "raros" (BC tiene descripciones con espacio duro o dobles). */
const sinEspaciosRaros = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Solo lo que cambió respecto de lo que hay en BC. La descripción se compara
 *  normalizada de los DOS lados: si no, un artículo con espacio duro en BC (M01-0001,
 *  medido) salía como "cambiado" apenas se abría la ficha. */
function cambiosDe(form: Form, f: FichaProductoBc): CambiosProducto {
  const c: CambiosProducto = {};
  const desc = sinEspaciosRaros(form.descripcion);
  if (desc !== sinEspaciosRaros(f.descripcion)) c.descripcion = desc;
  if (form.tipo !== f.tipo) c.tipo = form.tipo;
  if (form.categoria !== f.categoria) c.categoria = form.categoria;
  if (form.unidad !== f.unidad) c.unidad = form.unidad;
  if (form.grupoProducto !== f.grupoProducto) c.grupoProducto = form.grupoProducto;
  if (form.grupoInventario !== f.grupoInventario) c.grupoInventario = form.grupoInventario;
  const precio = form.precio.trim() === '' ? 0 : Number(form.precio.replace(',', '.'));
  if (precio !== f.precio) c.precio = precio;
  return c;
}

export function FichaProducto({ code, onClose, onCambio }: {
  code: string;
  onClose: () => void;
  /** Se llama con la ficha como quedó en BC después de guardar o (des)bloquear. */
  onCambio?: (f: FichaProductoBc) => void;
}) {
  const { toast } = useToast();
  const confirmar = useConfirm();
  const [ficha, setFicha] = useState<FichaProductoBc | null>(null);
  const [opciones, setOpciones] = useState<OpcionesProducto | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<'guardar' | 'bloqueo' | null>(null);
  const [recargas, setRecargas] = useState(0);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/bc/productos/${encodeURIComponent(code)}`, { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!vivo) return;
        if (!ok) throw new Error(d?.error || 'No se pudo leer el producto de Business Central');
        setFicha(d.item as FichaProductoBc);
        setOpciones(d.opciones as OpcionesProducto);
        setForm(formDe(d.item as FichaProductoBc));
        setError(null);
      })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'Error al leer el producto'); });
    return () => { vivo = false; };
  }, [code, recargas]);

  const combos = useMemo(() => combosProducto(opciones), [opciones]);
  const cambios = ficha && form ? cambiosDe(form, ficha) : {};
  const hayCambios = Object.keys(cambios).length > 0;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const cambiarTipo = (t: TipoProducto) => setForm((f) => f && ({
    ...f,
    tipo: t,
    grupoProducto: GRUPO_PRODUCTO_POR_TIPO[t],
    // El grupo de inventario solo lo llevan los de inventario.
    grupoInventario: t === 'inventario' ? (f.grupoInventario || ficha?.grupoInventario || GRUPO_INVENTARIO_DEFECTO) : '',
  }));

  const problema = (() => {
    if (!form) return null;
    if (!form.descripcion.trim()) return 'La descripción no puede quedar vacía.';
    if (!form.unidad) return 'Elegí la unidad base.';
    if (!form.grupoProducto) return 'Elegí el grupo contable de producto.';
    if (form.tipo === 'inventario' && !form.grupoInventario) return 'Elegí el grupo de registro de inventario.';
    const p = form.precio.trim() === '' ? 0 : Number(form.precio.replace(',', '.'));
    if (!Number.isFinite(p) || p < 0) return 'El precio de venta tiene que ser un número mayor o igual a cero.';
    return null;
  })();

  async function mandar(cuerpo: CambiosProducto, que: 'guardar' | 'bloqueo'): Promise<FichaProductoBc | null> {
    if (!ficha) return null;
    setGuardando(que);
    setAviso(null);
    try {
      const res = await fetch(`/api/bc/productos/${encodeURIComponent(code)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ etag: ficha.etag, ...cuerpo }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 409 && d.actual) {
        // Alguien lo cambió en BC: se muestra lo de BC y se descarta lo que estaba sin guardar.
        setFicha(d.actual as FichaProductoBc);
        setForm(formDe(d.actual as FichaProductoBc));
        setAviso(d.error);
        onCambio?.(d.actual as FichaProductoBc);
        return null;
      }
      if (!res.ok) throw new Error(d.error || 'Business Central no guardó el cambio');
      const item = d.item as FichaProductoBc;
      setFicha(item);
      // Si se bloqueó con cambios sin guardar, esos cambios se conservan en el formulario.
      setForm((f) => (que === 'bloqueo' && f ? f : formDe(item)));
      onCambio?.(item);
      return item;
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al guardar en Business Central', 'error');
      return null;
    } finally {
      setGuardando(null);
    }
  }

  const guardar = async () => {
    if (problema) { toast(problema, 'error'); return; }
    const item = await mandar(cambios, 'guardar');
    if (item) toast(`${item.code} actualizado en Business Central`, 'success');
  };

  const alternarBloqueo = async () => {
    if (!ficha) return;
    const bloquear = !ficha.bloqueado;
    const ok = await confirmar(bloquear
      ? {
          title: `Bloquear ${ficha.code}`,
          message: `«${ficha.descripcion}» deja de salir en los buscadores de pedidos de la app y Business Central no deja usarlo en documentos nuevos. Se puede desbloquear después.`,
          confirmLabel: 'Bloquear',
          danger: true,
        }
      : {
          title: `Desbloquear ${ficha.code}`,
          message: `«${ficha.descripcion}» vuelve a quedar disponible en Business Central y en los pedidos de la app.`,
          confirmLabel: 'Desbloquear',
        });
    if (!ok) return;
    const item = await mandar({ bloqueado: bloquear }, 'bloqueo');
    if (item) toast(item.bloqueado ? `${item.code} bloqueado en Business Central` : `${item.code} desbloqueado en Business Central`, 'success');
  };

  const cerrar = async () => {
    if (hayCambios && !(await confirmar({ title: 'Cambios sin guardar', message: 'Cerrás la ficha sin guardar los cambios en Business Central.', confirmLabel: 'Cerrar sin guardar', danger: true }))) return;
    onClose();
  };

  return (
    <Modal
      open
      onClose={cerrar}
      title={code}
      size="lg"
      footer={ficha && form ? (
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <Button variant={ficha.bloqueado ? 'outline' : 'danger'} onClick={alternarBloqueo} loading={guardando === 'bloqueo'} disabled={!!guardando}>
            {ficha.bloqueado ? 'Desbloquear producto' : 'Bloquear producto'}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={cerrar} disabled={!!guardando}>Cerrar</Button>
            <Button variant="primary" onClick={guardar} loading={guardando === 'guardar'} disabled={!hayCambios || !!guardando}>
              Guardar en BC
            </Button>
          </div>
        </div>
      ) : undefined}
    >
      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-ds-lg border border-ds-red/40 bg-ds-red-soft px-4 py-3">
          <p className="text-body-sm text-ds-red-ink">{error}</p>
          <Button variant="outline" size="sm" onClick={() => { setError(null); setRecargas((n) => n + 1); }}>Reintentar</Button>
        </div>
      )}
      {!error && (!ficha || !form) && <p className="text-body-sm text-ds-gray-400">Leyendo el producto de Business Central…</p>}

      {ficha && form && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <BadgeTipo tipo={ficha.tipo} />
            {ficha.bloqueado && <BadgeBloqueado />}
            <span className="text-xs text-ds-gray-400">
              Leído de BC ahora · modificado en BC {cuandoFue(ficha.modificado) || '—'}
              {ficha.tipo === 'inventario' && <> · existencia {num.format(ficha.existencia)} {ficha.unidad}</>}
            </span>
            <button type="button" className="text-xs font-semibold text-ds-ink underline underline-offset-2" onClick={() => setRecargas((n) => n + 1)}>
              Volver a leer de BC
            </button>
          </div>

          {aviso && (
            <div className="flex items-start gap-2 rounded-ds-lg border border-ds-yellow/50 bg-ds-yellow-soft px-4 py-3">
              <Icon name="incompleto" size="sm" color="currentColor" />
              <p className="text-body-sm text-ds-ink">{aviso}</p>
            </div>
          )}

          {ficha.bloqueado && (
            <div className="rounded-ds-lg border border-ds-red/40 bg-ds-red-soft px-4 py-3">
              <p className="text-body-sm text-ds-red-ink">
                Bloqueado en Business Central: no sale en los buscadores de pedidos ni se puede usar en documentos nuevos.
              </p>
            </div>
          )}

          <Input
            label="Descripción" required maxLength={MAX_DESCRIPCION}
            value={form.descripcion}
            onChange={(e) => set('descripcion', e.target.value.toUpperCase())}
            hint={`${form.descripcion.length}/${MAX_DESCRIPCION}`}
          />

          <div className="space-y-1">
            <span className="text-sm font-semibold text-ds-ink">Tipo<span className="text-ds-red-ink ml-0.5">*</span></span>
            <div className="flex flex-wrap gap-x-2">
              {TIPOS_PRODUCTO.map((t) => (
                <OptionLabel key={t.tipo} label={t.label} state={form.tipo === t.tipo ? 'active' : 'standard'} onClick={() => cambiarTipo(t.tipo)} />
              ))}
            </div>
            <p className="text-xs text-ds-gray-400 pl-1">BC no deja cambiar el tipo ni la unidad base si el producto ya tiene movimientos.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Combobox label="Categoría del producto" value={form.categoria} onChange={(v) => set('categoria', v)} placeholder="Sin categoría" options={combos.categoria} emptyText="Ninguna categoría coincide" />
            <Combobox label="Unidad medida base" required value={form.unidad} onChange={(v) => set('unidad', v)} placeholder="Seleccionar unidad" options={combos.unidad} emptyText="Ninguna unidad coincide" />
            <Combobox label="Grupo contable de producto" required value={form.grupoProducto} onChange={(v) => set('grupoProducto', v)} placeholder="Seleccionar grupo" options={combos.grupoProducto} />
            {form.tipo === 'inventario' && (
              <Combobox label="Grupo registro inventario" required value={form.grupoInventario} onChange={(v) => set('grupoInventario', v)} placeholder="Seleccionar grupo" options={combos.grupoInventario} />
            )}
            <Input
              label="Precio de venta" type="number" inputMode="decimal" min={0} step="0.01"
              placeholder="Sin precio" value={form.precio} onChange={(e) => set('precio', e.target.value)}
            />
          </div>

          {hayCambios && problema && <p className="text-body-sm text-ds-red-ink">{problema}</p>}
        </div>
      )}
    </Modal>
  );
}
