'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { useToast } from '@/components/ui/Toast';
import { Icon } from '@/components/ds/Icon/Icon';

interface ZonaEstado {
  idZona: number;
  zona: string;
  ubicacion: string | null;
  pin: string;
  estado: 'sin_dispositivos' | 'esperando_biometria' | 'redistribuyendo' | 'lista';
  equiposCompatibles: number;
  equiposConCara: number;
  equiposConHuella: number;
  equiposConFoto: number;
}

interface ZonaCatalogo { idZona: number; nombre: string; ubicacion: string | null; }

// Estado del enrolamiento en el reloj (esquema h4). Hace polling mientras alguna
// zona no esté "lista" — la biometría "viaja de vuelta" cuando el reloj capta la
// cara del colaborador y H4 la replica al resto de equipos de la zona.
const META: Record<ZonaEstado['estado'], { label: string; variant: React.ComponentProps<typeof Badge>['variant']; hint: string; pulse: boolean }> = {
  lista:               { label: 'Lista',                variant: 'green',  hint: 'La biometría está en todos los relojes de la zona.', pulse: false },
  redistribuyendo:     { label: 'Replicando…',          variant: 'yellow', hint: 'La cara ya está en algunos relojes; replicándose al resto.', pulse: true },
  esperando_biometria: { label: 'Esperando biometría',  variant: 'yellow', hint: 'Ya está dado de alta. Debe pasar la cara por cualquier reloj de la zona.', pulse: true },
  sin_dispositivos:    { label: 'Sin relojes',          variant: 'gray',   hint: 'La zona no tiene relojes compatibles.', pulse: false },
};

export function MarcajeEstadoZonas({ idColaborador, canEdit = false }: { idColaborador: number; canEdit?: boolean }) {
  const { toast } = useToast();
  const [zonas, setZonas] = useState<ZonaEstado[] | null>(null);
  const [catalogo, setCatalogo] = useState<ZonaCatalogo[]>([]);
  const [editando, setEditando] = useState(false);
  const [selZona, setSelZona] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [quitando, setQuitando] = useState<number | null>(null);
  const [cargado, setCargado] = useState(false);
  const [version, setVersion] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Devuelve la lista de zonas del colaborador. Ante fallo/timeout resolvemos a []
  // (no a null) para no ocultar la tarjeta para siempre: un editor debe poder
  // enrolarlo igual aunque el estado no se pueda leer en ese momento.
  const load = useCallback(async (): Promise<ZonaEstado[]> => {
    try {
      const r = await fetch(`/api/usuarios/${idColaborador}/marcaje`, { cache: 'no-store' });
      if (!r.ok) { setZonas([]); return []; }
      const d = await r.json();
      const list: ZonaEstado[] = d.zonas ?? [];
      setZonas(list);
      return list;
    } catch {
      setZonas([]);
      return [];
    } finally {
      setCargado(true);
    }
  }, [idColaborador]);

  // Catálogo de zonas disponibles (solo si puede editar).
  useEffect(() => {
    if (!canEdit) return;
    fetch('/api/catalogos')
      .then(r => r.json())
      .then(d => setCatalogo(d.zonas ?? []))
      .catch(() => {});
  }, [canEdit]);

  useEffect(() => {
    let cancelado = false;
    const tick = async () => {
      if (cancelado) return;
      const list = await load();
      // Sigue haciendo polling solo si algo aún se está enrolando/replicando.
      const sigue = (list ?? []).some(z => z.estado === 'esperando_biometria' || z.estado === 'redistribuyendo');
      if (sigue && !cancelado) timer.current = setTimeout(tick, 20000);
    };
    tick();
    return () => { cancelado = true; if (timer.current) clearTimeout(timer.current); };
  }, [load, version]);

  const tieneZonas = (zonas ?? []).length > 0;

  async function handleGuardar() {
    if (!selZona) { toast('Elegí una zona', 'warning'); return; }
    setGuardando(true);
    try {
      const r = await fetch(`/api/usuarios/${idColaborador}/marcaje`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idZona: Number(selZona) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast(d.error || 'No se pudo enrolar en la zona', 'error'); return; }
      const eq = d.enrolamiento?.equipos ?? 0;
      toast(`Enrolado en ${eq} reloj(es). Debe pasar la cara por uno de la zona.`, 'success');
      setEditando(false);
      setSelZona('');
      setVersion(v => v + 1); // recarga y reinicia el polling
    } finally {
      setGuardando(false);
    }
  }

  // Quita al colaborador de una zona (se desactiva la membresía; H4 lo da de baja
  // en los relojes de esa zona). Las demás zonas del colaborador no se tocan.
  async function handleQuitar(idZona: number, nombreZona: string) {
    if (quitando) return;
    setQuitando(idZona);
    try {
      const r = await fetch(`/api/usuarios/${idColaborador}/marcaje?idZona=${idZona}`, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast(d.error || 'No se pudo quitar de la zona', 'error'); return; }
      toast(`Quitado de ${nombreZona}.`, 'success');
      setVersion(v => v + 1);
    } finally {
      setQuitando(null);
    }
  }

  // Aún cargando el estado inicial (evita parpadeo antes de la primera respuesta).
  if (!cargado && !canEdit) return null;
  // Sin enrolamiento y sin permisos de edición: no se muestra la tarjeta.
  if (!tieneZonas && !canEdit) return null;

  return (
    <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-ds bg-black flex items-center justify-center shrink-0">
          <Icon name="user" size="sm" color="currentColor" className="text-brand" />
        </div>
        <h2 className="font-bold text-ds-ink">Dispositivo de marcaje</h2>
        {canEdit && !editando && (
          <Button
            variant="outline" size="sm" className="ml-auto"
            onClick={() => { setEditando(true); setSelZona(''); }}
            icon={<Icon name="plus" size="sm" color="currentColor" />}
          >
            Agregar zona
          </Button>
        )}
      </div>

      {tieneZonas ? (
        <div className="space-y-2">
          {zonas!.map(z => {
            const m = META[z.estado] ?? META.sin_dispositivos;
            return (
              <div key={z.idZona} className="flex items-center gap-3 px-3 py-2.5 rounded-ds border border-ds-gray-200">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ds-ink truncate">{z.zona}</p>
                  <p className="text-xs text-ds-gray-400">
                    PIN {z.pin} · {m.hint}
                    {z.equiposCompatibles > 0 && ` (${z.equiposConCara}/${z.equiposCompatibles} relojes)`}
                  </p>
                </div>
                <Badge variant={m.variant} dot className={m.pulse ? 'animate-pulse' : ''}>{m.label}</Badge>
                {canEdit && (
                  <button onClick={() => handleQuitar(z.idZona, z.zona)} disabled={quitando === z.idZona}
                    title={`Quitar de ${z.zona}`} aria-label={`Quitar de ${z.zona}`}
                    className="p-1.5 rounded-full text-ds-gray-400 hover:text-ds-red-200 hover:bg-ds-gray-100 transition-colors shrink-0 disabled:opacity-40">
                    <Icon name="delete" size="sm" color="currentColor" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        !editando && (
          <p className="text-sm text-ds-gray-400">
            Este colaborador aún no marca en ningún dispositivo. Agregalo a una zona para darlo de alta en sus relojes.
          </p>
        )
      )}

      {editando && (
        <div className="mt-4 rounded-ds border border-ds-gray-200 p-4 bg-ds-gray-100/50 space-y-3">
          <Combobox
            label="Zona de marca"
            value={selZona}
            onChange={setSelZona}
            options={catalogo
              .filter(z => !(zonas ?? []).some(zz => zz.idZona === z.idZona))
              .map(z => ({
                value: String(z.idZona),
                label: z.nombre,
                parts: [{ text: z.nombre, weight: 'bold' as const }, ...(z.ubicacion ? [{ text: z.ubicacion, weight: 'light' as const }] : [])],
                search: z.ubicacion ?? '',
              }))}
            placeholder={catalogo.length ? 'Seleccionar zona' : 'No hay zonas configuradas'}
            emptyText="Ya está en todas las zonas"
          />
          <p className="text-xs text-ds-gray-400">
            Queda dado de alta en todos los relojes de la zona (el PIN es su cédula) y luego debe pasar la cara/huella por <span className="font-semibold">cualquiera</span> de ellos. Puede estar en varias zonas a la vez.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setEditando(false); setSelZona(''); }}>Cancelar</Button>
            <Button size="sm" loading={guardando} onClick={handleGuardar}>Guardar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
