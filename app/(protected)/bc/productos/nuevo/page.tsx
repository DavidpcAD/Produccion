'use client';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { Button } from '@/components/ui/Button';
import { Combobox, type ComboOption } from '@/components/ui/Combobox';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { OptionLabel } from '@/components/ds/Form/Form';
import { Icon } from '@/components/ds/Icon/Icon';
import { indiceParecidos, type Parecido } from '@/lib/utilidades/parecidos';
import {
  GRUPO_INVENTARIO_DEFECTO, GRUPO_PRODUCTO_POR_TIPO, MAX_DESCRIPCION, MAX_NUMERO, TIPOS_PRODUCTO,
  normalizarNumero, prefijoDe, primerNumero, raizDeCategoria, validarNuevoProducto,
  type CategoriaBc, type OpcionesProducto, type TipoProducto,
} from '@/lib/bc/productos';

// Business Central → Crear producto. El presupuestista da de alta un artículo en
// BC sin entrar a BC: Nº, descripción, tipo, categoría, unidad base, grupos
// contables y precio de venta. Mientras escribe la descripción se le muestran
// los productos PARECIDOS que ya existen, para no duplicar el catálogo.

interface Item { code: string; descripcion: string; unidad: string; tipo: TipoProducto; categoria?: string }
type Opciones = OpcionesProducto & { siguientes: Record<string, string> };

const TIPO_LABEL: Record<TipoProducto, string> = { inventario: 'Inventario', servicio: 'Servicio', 'no-inventario': 'Fuera de inventario' };
const TIPO_BADGE: Record<TipoProducto, string> = {
  inventario: 'bg-ds-green-soft text-ds-green-ink',
  servicio: 'bg-ds-yellow-soft text-ds-yellow-ink',
  'no-inventario': 'bg-ds-gray-100 text-ds-gray-500',
};

/** A partir de este puntaje el parecido se trata como "probablemente es el mismo". */
const CASI_IGUAL = 0.95;
const PARECIDOS_VISIBLES = 12;

function StepHeader({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-7 h-7 rounded-full bg-black text-white text-sm font-bold flex items-center justify-center shrink-0 mt-0.5">{n}</span>
      <div className="min-w-0">
        <h2 className="text-body font-bold text-ds-ink leading-tight">{title}</h2>
        {hint && <p className="text-ds-gray-400 text-xs mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}

function BadgeTipo({ tipo }: { tipo: TipoProducto }) {
  return (
    <span className={`inline-flex items-center rounded-ds px-2 py-0.5 text-label font-medium whitespace-nowrap ${TIPO_BADGE[tipo]}`}>
      {TIPO_LABEL[tipo]}
    </span>
  );
}

const cardCls = 'bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-5 space-y-4';

/** Lo más repetido de una lista (para sugerir categoría y unidad desde los parecidos). */
function masComun(valores: (string | undefined)[]): string | null {
  const cuenta = new Map<string, number>();
  for (const v of valores) if (v) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  let mejor: string | null = null, n = 0;
  for (const [v, c] of cuenta) if (c > n) { mejor = v; n = c; }
  return mejor;
}

function ListaParecidos({ parecidos, total, buscando }: { parecidos: Parecido<Item>[]; total: number; buscando: boolean }) {
  const [verTodos, setVerTodos] = useState(false);
  const visibles = verTodos ? parecidos : parecidos.slice(0, PARECIDOS_VISIBLES);
  if (buscando) return <p className="text-body-sm text-ds-gray-400">Cargando el catálogo de Business Central…</p>;
  if (!parecidos.length) {
    return (
      <div className="flex items-center gap-2 rounded-ds-lg border border-ds-gray-200 bg-ds-gray-100 px-4 py-3 text-body-sm text-ds-gray-500">
        <Icon name="completado" size="sm" color="currentColor" />
        No hay ningún producto parecido en Business Central.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-label uppercase tracking-wide text-ds-gray-500">
          Parecidos que ya existen en BC ({total.toLocaleString('es-CR')})
        </h3>
      </div>
      <ul className="divide-y divide-ds-gray-100 overflow-hidden rounded-ds-lg border border-ds-gray-200">
        {visibles.map(({ item, puntaje }) => (
          <li key={item.code} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-body-sm ${puntaje >= CASI_IGUAL ? 'bg-ds-yellow-soft' : ''}`}>
            <span className="font-mono font-semibold text-ds-ink whitespace-nowrap">{item.code}</span>
            <span className="min-w-0 flex-1 break-words text-ds-ink">{item.descripcion}</span>
            <span className="text-label text-ds-gray-400 whitespace-nowrap">{item.categoria || 'sin categoría'} · {item.unidad || '—'}</span>
            <BadgeTipo tipo={item.tipo} />
          </li>
        ))}
      </ul>
      {parecidos.length > PARECIDOS_VISIBLES && (
        <button type="button" onClick={() => setVerTodos((v) => !v)} className="text-body-sm font-semibold text-ds-ink underline underline-offset-2">
          {verTodos ? 'Ver menos' : `Ver los ${parecidos.length} más parecidos`}
        </button>
      )}
    </div>
  );
}

export default function NuevoProductoPage() {
  const { toast } = useToast();
  const confirmar = useConfirm();

  const [opciones, setOpciones] = useState<Opciones | null>(null);
  const [errorOpciones, setErrorOpciones] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [cargandoItems, setCargandoItems] = useState(true);

  const [descripcion, setDescripcion] = useState('');
  const [tipo, setTipo] = useState<TipoProducto>('inventario');
  const [categoria, setCategoria] = useState('');
  const [numero, setNumero] = useState('');
  const [numeroManual, setNumeroManual] = useState(false);
  const [unidad, setUnidad] = useState('');
  const [grupoProducto, setGrupoProducto] = useState(GRUPO_PRODUCTO_POR_TIPO.inventario);
  const [grupoInventario, setGrupoInventario] = useState(GRUPO_INVENTARIO_DEFECTO);
  const [precio, setPrecio] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [intentoEnviar, setIntentoEnviar] = useState(false);
  const [creado, setCreado] = useState<Item | null>(null);

  // Las listas del formulario. `recargas` sube con "Reintentar" y vuelve a pedirlas.
  const [recargas, setRecargas] = useState(0);
  useEffect(() => {
    let vivo = true;
    fetch('/api/bc/productos', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!vivo) return;
        if (!ok) throw new Error(d?.error || 'No se pudieron cargar las listas de Business Central');
        setOpciones(d as Opciones);
        setErrorOpciones(null);
      })
      .catch((e) => { if (vivo) setErrorOpciones(e instanceof Error ? e.message : 'Error al cargar'); });
    return () => { vivo = false; };
  }, [recargas]);

  useEffect(() => {
    let vivo = true;
    fetch('/api/bc/inventario', { credentials: 'include' })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!vivo) return;
        if (!ok) throw new Error(d?.error || 'No se pudo cargar el catálogo');
        setItems(Array.isArray(d.items) ? d.items : []);
      })
      .catch((e) => { if (vivo) toast(e instanceof Error ? e.message : 'No se pudo cargar el catálogo', 'error'); })
      .finally(() => { if (vivo) setCargandoItems(false); });
    return () => { vivo = false; };
  }, [toast]);

  // ─── Parecidos ───────────────────────────────────────────────────────────
  const buscarParecidos = useMemo(() => indiceParecidos(items, (i) => i.descripcion, (i) => i.code), [items]);
  const consulta = useDeferredValue(descripcion);
  const parecidosTodos = useMemo(() => (consulta.trim().length >= 3 ? buscarParecidos(consulta, { max: 200 }) : []), [buscarParecidos, consulta]);
  const parecidos = useMemo(() => parecidosTodos.slice(0, 50), [parecidosTodos]);
  const casiIgual = parecidos.find((p) => p.puntaje >= CASI_IGUAL) ?? null;

  // Sugerencias sacadas de los más parecidos: si casi todos los "tubos PVC" son
  // TUB_PVC_ACCESOR en UND, lo más probable es que el nuevo también.
  const cercanos = useMemo(() => parecidos.filter((p) => p.puntaje >= 0.7).slice(0, 10).map((p) => p.item), [parecidos]);
  const categoriaSugerida = useMemo(() => {
    const c = masComun(cercanos.map((i) => i.categoria));
    return c && opciones?.categorias.some((x) => x.code === c) ? c : null;
  }, [cercanos, opciones]);
  const unidadSugerida = useMemo(() => {
    const u = masComun(cercanos.map((i) => i.unidad));
    return u && opciones?.unidades.some((x) => x.code === u) ? u : null;
  }, [cercanos, opciones]);

  // ─── Número sugerido ─────────────────────────────────────────────────────
  const categorias = useMemo(() => opciones?.categorias ?? [], [opciones]);
  const prefijo = categoria ? prefijoDe(tipo, categoria, categorias) : null;
  const numeroSugerido = prefijo ? (opciones?.siguientes[prefijo] ?? primerNumero(prefijo)) : '';
  const raiz = categoria ? raizDeCategoria(categoria, categorias) : '';

  // Mientras no lo toquen, el Nº es el sugerido (y sigue a la categoría y al tipo).
  const numeroActual = numeroManual ? numero : numeroSugerido;

  const numeroRepetido = useMemo(() => {
    const n = normalizarNumero(numeroActual);
    return n ? items.find((i) => i.code.toUpperCase() === n) ?? null : null;
  }, [numeroActual, items]);

  const cambiarTipo = (t: TipoProducto) => {
    setTipo(t);
    setGrupoProducto(GRUPO_PRODUCTO_POR_TIPO[t]);
  };

  // ─── Opciones de los combos ──────────────────────────────────────────────
  const opcionesCategoria = useMemo<ComboOption[]>(() => {
    const raices = categorias.filter((c) => !c.padre).sort((a, b) => a.code.localeCompare(b.code, 'es', { numeric: true }));
    const hijos = (code: string) => categorias.filter((c) => c.padre === code).sort((a, b) => a.code.localeCompare(b.code, 'es'));
    const out: ComboOption[] = [];
    const opcion = (c: CategoriaBc, padre: string): ComboOption => ({
      value: c.code,
      label: c.code,
      parts: [
        { text: c.code, weight: 'bold' },
        ...(c.nombre && c.nombre !== c.code ? [{ text: c.nombre, weight: 'normal' as const }] : []),
        { text: padre || 'categoría general', weight: 'light' },
      ],
      search: `${c.code} ${c.nombre} ${padre}`,
    });
    for (const r of raices) {
      for (const h of hijos(r.code)) out.push(opcion(h, r.code));
      out.push(opcion(r, ''));
    }
    // Por si alguna categoría cuelga de un padre que no vino en la lista.
    for (const c of categorias) if (c.padre && !categorias.some((r) => r.code === c.padre)) out.push(opcion(c, c.padre));
    return out;
  }, [categorias]);

  const opcionesUnidad = useMemo<ComboOption[]>(() => (opciones?.unidades ?? []).map((u) => ({
    value: u.code, label: u.code,
    parts: [{ text: u.code, weight: 'bold' }, ...(u.nombre && u.nombre !== u.code ? [{ text: u.nombre, weight: 'light' as const }] : [])],
    search: `${u.code} ${u.nombre}`,
  })), [opciones]);

  const opcionesGrupoProducto = useMemo<ComboOption[]>(() => (opciones?.gruposProducto ?? []).map((g) => ({
    value: g.code, label: g.code,
    parts: [{ text: g.code, weight: 'bold' }, ...(g.nombre && g.nombre !== g.code ? [{ text: g.nombre, weight: 'normal' as const }] : []), ...(g.iva ? [{ text: g.iva, weight: 'light' as const }] : [])],
    search: `${g.code} ${g.nombre} ${g.iva}`,
  })), [opciones]);

  const opcionesGrupoInventario = useMemo<ComboOption[]>(() => (opciones?.gruposInventario ?? []).map((g) => ({
    value: g.code, label: g.code,
    parts: [{ text: g.code, weight: 'bold' }, ...(g.nombre ? [{ text: g.nombre, weight: 'light' as const }] : [])],
    search: `${g.code} ${g.nombre}`,
  })), [opciones]);

  const ivaDelGrupo = opciones?.gruposProducto.find((g) => g.code === grupoProducto)?.iva ?? '';

  // ─── Crear ───────────────────────────────────────────────────────────────
  const precioNum = precio.trim() === '' ? undefined : Number(precio.replace(',', '.'));
  const borrador = {
    numero: normalizarNumero(numeroActual),
    descripcion: descripcion.replace(/\s+/g, ' ').trim(),
    tipo, categoria, unidad, grupoProducto,
    grupoInventario: tipo === 'inventario' ? grupoInventario : undefined,
    precio: precioNum,
  };
  const problema = opciones ? validarNuevoProducto(borrador, opciones) : 'Cargando las listas de Business Central…';
  const faltaDescripcion = intentoEnviar && !borrador.descripcion;

  const crear = async () => {
    setIntentoEnviar(true);
    if (problema) { toast(problema, 'error'); return; }
    if (numeroRepetido) { toast(`El Nº ${borrador.numero} ya es de «${numeroRepetido.descripcion}». Usá otro.`, 'error'); return; }
    const avisoParecido = casiIgual ? ` Ojo: ya existe ${casiIgual.item.code} «${casiIgual.item.descripcion}», que se ve igual.` : '';
    const ok = await confirmar({
      title: 'Crear producto en Business Central',
      message: `Se va a crear ${borrador.numero} «${borrador.descripcion.toUpperCase()}» — ${TIPO_LABEL[tipo]} · ${categoria} · ${unidad} · ${grupoProducto}${tipo === 'inventario' ? ` / ${grupoInventario}` : ''}${precioNum ? ` · precio de venta ₡${precioNum.toLocaleString('es-CR')}` : ''}.${avisoParecido}`,
      confirmLabel: 'Crear producto',
    });
    if (!ok) return;
    setEnviando(true);
    try {
      const res = await fetch('/api/bc/productos', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(borrador),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 && data.sugerido) { setNumero(data.sugerido); setNumeroManual(true); }
        throw new Error(data.error || 'Business Central no creó el producto');
      }
      const item = data.item as Item;
      setCreado(item);
      setItems((prev) => (prev.some((i) => i.code === item.code) ? prev : [...prev, item]));
      // El siguiente de la familia ya no es este.
      const pref = item.code.split('-')[0];
      const m = item.code.match(/^([A-Z]\d{2})-(\d{4})$/);
      if (m) {
        setOpciones((o) => {
          if (!o) return o;
          const actual = o.siguientes[pref];
          if (actual && actual > item.code) return o;
          return { ...o, siguientes: { ...o.siguientes, [pref]: `${pref}-${String(Number(m[2]) + 1).padStart(4, '0')}` } };
        });
      }
      toast(`Producto ${item.code} creado en Business Central`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al crear el producto', 'error');
    } finally {
      setEnviando(false);
    }
  };

  // "Crear otro": se conservan tipo, categoría, unidad y grupos (lo normal es dar
  // de alta varios de la misma familia seguidos) y se limpia lo propio del producto.
  const crearOtro = () => {
    setCreado(null);
    setDescripcion('');
    setPrecio('');
    setNumeroManual(false);
    setIntentoEnviar(false);
  };

  return (
    <PageShell width="narrow">
      <PageHeader
        title="Crear producto"
        subtitle="Da de alta un artículo en Business Central. Mientras escribís la descripción te mostramos los que ya existen parecidos, para no repetirlo."
        actions={<Link href="/bc/inventario" className="text-body-sm font-semibold text-ds-ink underline underline-offset-2">Ver inventario de materiales</Link>}
      />

      {errorOpciones && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-ds-lg border border-ds-red/40 bg-ds-red-soft px-4 py-3">
          <p className="text-body-sm text-ds-red-ink">{errorOpciones}</p>
          <Button variant="outline" size="sm" onClick={() => { setErrorOpciones(null); setRecargas((n) => n + 1); }}>Reintentar</Button>
        </div>
      )}

      {creado && (
        <div className="rounded-ds-lg border border-brand bg-ds-green-soft px-5 py-4 space-y-3">
          <div className="flex items-start gap-3">
            <Icon name="completado" size="md" color="currentColor" />
            <div className="min-w-0">
              <p className="text-body font-bold text-ds-ink">Producto creado en Business Central</p>
              <p className="text-body-sm text-ds-ink">
                <span className="font-mono font-semibold">{creado.code}</span> — {creado.descripcion}
              </p>
              <p className="text-xs text-ds-green-ink mt-1">Ya sale en los buscadores de materiales de la app.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={crearOtro}>Crear otro producto</Button>
          </div>
        </div>
      )}

      {!creado && (
        <>
          {/* Paso 1 — Qué material es (y si ya existe) */}
          <div className={cardCls}>
            <StepHeader n={1} title="¿Qué producto es?" hint="Escribilo como te salga: te traemos los parecidos aunque esté escrito distinto, abreviado o con faltas." />
            <div>
              <Input
                label="Descripción" required maxLength={MAX_DESCRIPCION}
                placeholder="Ej. TUBO PVC SDR 41 4&quot;"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value.toUpperCase())}
                error={faltaDescripcion ? 'Falta la descripción.' : undefined}
                hint={`${descripcion.length}/${MAX_DESCRIPCION} · va a BC en mayúsculas, como el resto del catálogo.`}
              />
            </div>

            {casiIgual && (
              <div className="flex items-start gap-2 rounded-ds-lg border border-ds-yellow/50 bg-ds-yellow-soft px-4 py-3">
                <Icon name="incompleto" size="sm" color="currentColor" />
                <p className="text-body-sm text-ds-ink">
                  Puede que ya exista: <span className="font-mono font-semibold">{casiIgual.item.code}</span> «{casiIgual.item.descripcion}».
                  Revisalo antes de crear otro igual.
                </p>
              </div>
            )}

            {descripcion.trim().length >= 3 && (
              <ListaParecidos key={consulta} parecidos={parecidos} total={parecidosTodos.length} buscando={cargandoItems} />
            )}
          </div>

          {/* Paso 2 — Tipo, categoría y código */}
          <div className={cardCls}>
            <StepHeader n={2} title="Tipo, categoría y código" hint="El Nº sale solo de la categoría (01.METALES → M01-…); si hace falta, lo podés cambiar." />

            <div className="space-y-1">
              <span className="text-sm font-semibold text-ds-ink">Tipo<span className="text-ds-red-ink ml-0.5">*</span></span>
              <div className="flex flex-wrap gap-x-2">
                {TIPOS_PRODUCTO.map((t) => (
                  <OptionLabel key={t.tipo} label={t.label} state={tipo === t.tipo ? 'active' : 'standard'} onClick={() => cambiarTipo(t.tipo)} />
                ))}
              </div>
              <p className="text-xs text-ds-gray-400 pl-1">{TIPOS_PRODUCTO.find((t) => t.tipo === tipo)?.ayuda}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Combobox
                  label="Categoría del producto" required value={categoria} onChange={setCategoria}
                  placeholder={opciones ? 'Seleccionar categoría' : 'Cargando…'} disabled={!opciones}
                  options={opcionesCategoria} emptyText="Ninguna categoría coincide"
                />
                {categoria && raiz && raiz !== categoria && <p className="text-xs text-ds-gray-400 pl-1">Familia {raiz}</p>}
                {!categoria && categoriaSugerida && (
                  <p className="text-xs text-ds-gray-400 pl-1">
                    Los parecidos son de{' '}
                    <button type="button" className="font-semibold text-ds-ink underline underline-offset-2" onClick={() => setCategoria(categoriaSugerida)}>
                      {categoriaSugerida}
                    </button>
                  </p>
                )}
                {intentoEnviar && !categoria && <p className="text-xs text-ds-red-ink font-medium pl-1">Elegí la categoría.</p>}
              </div>

              <div>
                <Input
                  label="Nº" required maxLength={MAX_NUMERO}
                  placeholder={categoria ? 'M01-0001' : 'Elegí primero la categoría'}
                  value={numeroActual}
                  onChange={(e) => { setNumero(e.target.value.toUpperCase().replace(/\s+/g, '')); setNumeroManual(true); }}
                  className="font-mono"
                  error={numeroRepetido ? `Ya existe: ${numeroRepetido.descripcion}` : undefined}
                  hint={numeroSugerido
                    ? (normalizarNumero(numeroActual) === numeroSugerido ? 'El siguiente libre de la familia.' : `El siguiente libre de la familia es ${numeroSugerido}.`)
                    : categoria ? 'Esta categoría no tiene familia numerada: escribí el Nº.' : undefined}
                />
                {numeroManual && numeroSugerido && normalizarNumero(numeroActual) !== numeroSugerido && (
                  <button type="button" className="mt-1 pl-1 text-xs font-semibold text-ds-ink underline underline-offset-2" onClick={() => setNumeroManual(false)}>
                    Usar {numeroSugerido}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Paso 3 — Unidad, registro contable y precio */}
          <div className={cardCls}>
            <StepHeader n={3} title="Unidad, costes y registro" hint="Los grupos ya vienen con lo que usa casi todo el catálogo para este tipo." />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Combobox
                  label="Unidad medida base" required value={unidad} onChange={setUnidad}
                  placeholder={opciones ? 'Seleccionar unidad' : 'Cargando…'} disabled={!opciones}
                  options={opcionesUnidad} emptyText="Ninguna unidad coincide"
                />
                {!unidad && unidadSugerida && (
                  <p className="text-xs text-ds-gray-400 pl-1">
                    Los parecidos van en{' '}
                    <button type="button" className="font-semibold text-ds-ink underline underline-offset-2" onClick={() => setUnidad(unidadSugerida)}>
                      {unidadSugerida}
                    </button>
                  </p>
                )}
                {intentoEnviar && !unidad && <p className="text-xs text-ds-red-ink font-medium pl-1">Elegí la unidad.</p>}
              </div>

              <div className="space-y-1">
                <Combobox
                  label="Grupo contable de producto" required value={grupoProducto} onChange={setGrupoProducto}
                  placeholder={opciones ? 'Seleccionar grupo' : 'Cargando…'} disabled={!opciones}
                  options={opcionesGrupoProducto}
                />
                {ivaDelGrupo && <p className="text-xs text-ds-gray-400 pl-1">El grupo de IVA ({ivaDelGrupo}) lo pone BC solo.</p>}
              </div>

              {tipo === 'inventario' && (
                <div className="space-y-1">
                  <Combobox
                    label="Grupo registro inventario" required value={grupoInventario} onChange={setGrupoInventario}
                    placeholder={opciones ? 'Seleccionar grupo' : 'Cargando…'} disabled={!opciones}
                    options={opcionesGrupoInventario}
                  />
                </div>
              )}

              <div>
                <Input
                  label="Precio de venta" type="number" inputMode="decimal" min={0} step="0.01"
                  placeholder="Opcional" value={precio} onChange={(e) => setPrecio(e.target.value)}
                  hint="Precio unitario de venta en colones. Se puede dejar vacío."
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            {intentoEnviar && problema && <p className="text-body-sm text-ds-red-ink">{problema}</p>}
            <Button variant="primary" onClick={crear} loading={enviando} disabled={!opciones || enviando}>
              Crear producto en BC
            </Button>
          </div>
        </>
      )}
    </PageShell>
  );
}
