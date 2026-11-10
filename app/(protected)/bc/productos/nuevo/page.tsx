'use client';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { OptionLabel } from '@/components/ds/Form/Form';
import { Icon } from '@/components/ds/Icon/Icon';
import { indiceParecidos, type Parecido } from '@/lib/utilidades/parecidos';
import { BadgeBloqueado, BadgeTipo, TIPO_LABEL, combosProducto } from '@/components/bc/productos-ui';
import { FichaProducto } from '@/components/bc/ficha-producto';
import {
  GRUPO_INVENTARIO_DEFECTO, GRUPO_PRODUCTO_POR_TIPO, MAX_DESCRIPCION, MAX_NUMERO, TIPOS_PRODUCTO,
  normalizarNumero, prefijoDe, primerNumero, raizDeCategoria, siguientesNumeros, validarNuevoProducto,
  type FichaProductoBc, type OpcionesProducto, type ProductoBc, type TipoProducto,
} from '@/lib/bc/productos';

// Business Central → Productos. El presupuestista da de alta un artículo en BC sin
// entrar a BC: Nº, descripción, tipo, categoría, unidad base, grupos contables y
// precio de venta. Mientras escribe la descripción se le muestran los productos
// PARECIDOS que ya existen, para no duplicar el catálogo; tocando uno se abre su
// ficha, leída en vivo de BC, para cambiarlo o bloquearlo (components/bc/ficha-producto).
// El catálogo de esta pantalla se lee de BC cada vez que se abre (bloqueados
// incluidos), así que lo que se cambie en BC se ve acá sin esperar cachés.

type Item = ProductoBc;

/** Lo que devuelve la API v2.0 al crear, completado con lo que se mandó. */
const productoDeCreado = (i: { code: string; descripcion: string; unidad: string; tipo: TipoProducto; categoria?: string }, extra: Partial<ProductoBc>): ProductoBc => ({
  code: i.code, descripcion: i.descripcion, unidad: i.unidad, tipo: i.tipo, categoria: i.categoria ?? '',
  grupoProducto: extra.grupoProducto ?? '', grupoInventario: extra.grupoInventario ?? '', precio: extra.precio ?? 0,
  bloqueado: false, modificado: new Date().toISOString(),
});

const deFicha = (f: FichaProductoBc): ProductoBc => ({
  code: f.code, descripcion: f.descripcion, tipo: f.tipo, categoria: f.categoria, unidad: f.unidad,
  grupoProducto: f.grupoProducto, grupoInventario: f.grupoInventario, precio: f.precio, bloqueado: f.bloqueado, modificado: f.modificado,
});

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

const cardCls = 'bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-5 space-y-4';

/** Lo más repetido de una lista (para sugerir categoría y unidad desde los parecidos). */
function masComun(valores: (string | undefined)[]): string | null {
  const cuenta = new Map<string, number>();
  for (const v of valores) if (v) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  let mejor: string | null = null, n = 0;
  for (const [v, c] of cuenta) if (c > n) { mejor = v; n = c; }
  return mejor;
}

function ListaParecidos({ parecidos, total, buscando, onAbrir }: { parecidos: Parecido<Item>[]; total: number; buscando: boolean; onAbrir: (code: string) => void }) {
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
        <span className="text-xs text-ds-gray-400">Tocá uno para verlo, cambiarlo o bloquearlo</span>
      </div>
      <ul className="divide-y divide-ds-gray-100 overflow-hidden rounded-ds-lg border border-ds-gray-200">
        {visibles.map(({ item, puntaje }) => (
          <li key={item.code}>
            <button
              type="button"
              onClick={() => onAbrir(item.code)}
              className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-body-sm transition-colors hover:bg-ds-gray-100 ${puntaje >= CASI_IGUAL ? 'bg-ds-yellow-soft' : ''}`}
            >
              <span className={`font-mono font-semibold whitespace-nowrap ${item.bloqueado ? 'text-ds-gray-400 line-through' : 'text-ds-ink'}`}>{item.code}</span>
              <span className={`min-w-0 flex-1 break-words ${item.bloqueado ? 'text-ds-gray-400' : 'text-ds-ink'}`}>{item.descripcion}</span>
              <span className="text-label text-ds-gray-400 whitespace-nowrap">{item.categoria || 'sin categoría'} · {item.unidad || '—'}</span>
              <BadgeTipo tipo={item.tipo} />
              {item.bloqueado && <BadgeBloqueado />}
            </button>
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

  const [opciones, setOpciones] = useState<OpcionesProducto | null>(null);
  const [errorOpciones, setErrorOpciones] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [cargandoItems, setCargandoItems] = useState(true);
  const [leidoEn, setLeidoEn] = useState('');
  const [fichaCode, setFichaCode] = useState<string | null>(null);

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

  // Listas del formulario + TODO el catálogo, leído de BC en este momento (bloqueados
  // incluidos). `recargas` sube con "Volver a leer de BC" / "Reintentar".
  const [recargas, setRecargas] = useState(0);
  useEffect(() => {
    let vivo = true;
    fetch('/api/bc/productos', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!vivo) return;
        if (!ok) throw new Error(d?.error || 'No se pudo leer el catálogo de Business Central');
        const { items: lista, leidoEn: cuando, ...resto } = d as OpcionesProducto & { items: Item[]; leidoEn: string };
        setOpciones(resto);
        setItems(Array.isArray(lista) ? lista : []);
        setLeidoEn(cuando ?? '');
        setErrorOpciones(null);
      })
      .catch((e) => { if (vivo) setErrorOpciones(e instanceof Error ? e.message : 'Error al cargar'); })
      .finally(() => { if (vivo) setCargandoItems(false); });
    return () => { vivo = false; };
  }, [recargas]);

  // Lo que se cambió o bloqueó en la ficha se refleja en la lista sin volver a leer todo.
  const alCambiarEnFicha = (f: FichaProductoBc) => {
    setItems((prev) => prev.map((i) => (i.code === f.code ? deFicha(f) : i)));
    setCreado((c) => (c && c.code === f.code ? deFicha(f) : c));
  };

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
  // El siguiente libre de cada familia, sacado del catálogo recién leído de BC
  // (bloqueados incluidos: también ocupan su número).
  const siguientes = useMemo(() => siguientesNumeros(items.map((i) => i.code)), [items]);
  const numeroSugerido = prefijo ? (siguientes[prefijo] ?? primerNumero(prefijo)) : '';
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
  const combos = useMemo(() => combosProducto(opciones), [opciones]);
  const opcionesCategoria = combos.categoria;
  const opcionesUnidad = combos.unidad;
  const opcionesGrupoProducto = combos.grupoProducto;
  const opcionesGrupoInventario = combos.grupoInventario;

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
      const item = productoDeCreado(data.item, { grupoProducto, grupoInventario: borrador.grupoInventario, precio: precioNum });
      setCreado(item);
      // Al sumarlo al catálogo, el siguiente Nº de la familia ya no es este.
      setItems((prev) => (prev.some((i) => i.code === item.code) ? prev : [...prev, item]));
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
        title="Productos de Business Central"
        subtitle="Creá un producto nuevo, o buscá uno que ya existe para cambiarlo o bloquearlo. Todo se lee y se guarda directo en BC."
        actions={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-xs text-ds-gray-400">
              {cargandoItems ? 'Leyendo el catálogo de BC…' : leidoEn ? `Catálogo leído de BC a las ${new Date(leidoEn).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}` : ''}
            </span>
            <button type="button" disabled={cargandoItems} onClick={() => { setCargandoItems(true); setRecargas((n) => n + 1); }} className="text-body-sm font-semibold text-ds-ink underline underline-offset-2 disabled:text-ds-gray-400">
              Volver a leer de BC
            </button>
            <Link href="/bc/inventario" className="text-body-sm font-semibold text-ds-ink underline underline-offset-2">Inventario de materiales</Link>
          </div>
        }
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
            <Button variant="outline" onClick={() => setFichaCode(creado.code)}>Ver o cambiar en BC</Button>
          </div>
        </div>
      )}

      {!creado && (
        <>
          {/* Paso 1 — Qué material es (y si ya existe) */}
          <div className={cardCls}>
            <StepHeader n={1} title="¿Qué producto es?" hint="Escribilo como te salga (o su Nº, ej. M10-0042): te traemos los parecidos aunque esté escrito distinto, abreviado o con faltas." />
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
                  Puede que ya exista: <span className="font-mono font-semibold">{casiIgual.item.code}</span> «{casiIgual.item.descripcion}»
                  {casiIgual.item.bloqueado ? ', y está bloqueado: si es el mismo, desbloquealo en vez de crear otro.' : '. Revisalo antes de crear otro igual.'}{' '}
                  <button type="button" className="font-semibold underline underline-offset-2" onClick={() => setFichaCode(casiIgual.item.code)}>Abrir ficha</button>
                </p>
              </div>
            )}

            {descripcion.trim().length >= 3 && (
              <ListaParecidos key={consulta} parecidos={parecidos} total={parecidosTodos.length} buscando={cargandoItems} onAbrir={setFichaCode} />
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
      {fichaCode && (
        <FichaProducto key={fichaCode} code={fichaCode} onClose={() => setFichaCode(null)} onCambio={alCambiarEnFicha} />
      )}
    </PageShell>
  );
}
