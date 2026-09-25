'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { Icon } from '@/components/ds/Icon/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { listStagger, listItem } from '@/components/ui/Motion';
import { motion } from 'motion/react';
import { PageShell, PageHeader } from '@/components/layout/Page';

interface Proyecto {
  IDProyecto: number;
  CodigoBC: string;
  Nombre: string;
  Estado: string;
  Ubicacion: string;
  TotalPersonas: number;
  FechaInicio: string;
  FechaFinEstimada: string;
  Activo: boolean;
  EsProductivo: boolean;
}

export default function ProyectosPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [loading, setLoading] = useState(true);
  // Filtro: por defecto solo activos; "Todos" incluye inactivos.
  const [verTodos, setVerTodos] = useState(false);
  // Filtro por proyecto productivo (pertenece a Producción). Se filtra en cliente
  // sobre lo ya cargado, igual que en Obras.
  const [filtroProd, setFiltroProd] = useState<'todos' | 'produccion'>('todos');

  const load = useCallback((incluirInactivos: boolean) => {
    setLoading(true);
    fetch(`/api/proyectos${incluirInactivos ? '?incluirInactivos=1' : ''}`)
      .then(r => r.json())
      .then(d => setProyectos(d.data ?? []))
      .catch(() => toast('Error cargando proyectos', 'error'))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => { load(verTodos); }, [load, verTodos]);

  const estadoVariant = (e: string): 'green' | 'gray' =>
    e === 'Activo' || e === 'Open' ? 'green' : 'gray';

  const visibles = filtroProd === 'produccion' ? proyectos.filter(p => p.EsProductivo) : proyectos;
  const activosCount = visibles.filter(p => p.Activo).length;

  return (
    <PageShell>
      <PageHeader
        title="Proyectos"
        subtitle={loading ? 'Cargando…' : `${activosCount} proyectos activos${filtroProd === 'produccion' ? ' de Producción' : ''}${verTodos && visibles.length > activosCount ? ` · ${visibles.length - activosCount} inactivos` : ''}`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex rounded-ds border border-ds-gray-200 p-0.5 bg-ds-surface">
              {([['Todos', 'todos'], ['Producción', 'produccion']] as const).map(([label, val]) => (
                <button key={val} onClick={() => setFiltroProd(val)}
                  className={'px-3 py-1.5 rounded-ds text-sm font-semibold transition ' + (filtroProd === val ? 'bg-black text-white' : 'text-ds-gray-500 hover:text-ds-ink')}>
                  {label}
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-ds border border-ds-gray-200 p-0.5 bg-ds-surface">
              {([['Activos', false], ['Todos', true]] as const).map(([label, val]) => (
                <button key={label} onClick={() => setVerTodos(val)}
                  className={'px-3 py-1.5 rounded-ds text-sm font-semibold transition ' + (verTodos === val ? 'bg-black text-white' : 'text-ds-gray-500 hover:text-ds-ink')}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 p-5 space-y-3">
              <Skeleton className="h-4 w-3/4" rounded="rounded-full" />
              <Skeleton className="h-3 w-1/2" rounded="rounded-full" />
            </div>
          ))}
        </div>
      ) : visibles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-ds-gray-300">
          <Icon name="boleta" size="lg" color="currentColor" className="mb-4" />
          <p className="text-body font-semibold text-ds-ink">Sin proyectos</p>
          <p className="text-sm mt-1 text-ds-gray-400">
            {filtroProd === 'produccion' ? 'Ningún proyecto está marcado como de Producción' : 'Aún no hay proyectos registrados'}
          </p>
        </div>
      ) : (
        <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          initial="hidden" animate="show" variants={listStagger}>
          {visibles.map(p => (
            <motion.button
              key={p.IDProyecto}
              variants={listItem}
              onClick={() => router.push(`/proyectos/${p.IDProyecto}`)}
              className={'group bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-5 text-left flex flex-col h-full hover:border-black hover:shadow-ds-03 transition-all duration-200 hover:-translate-y-0.5 ' + (p.Activo ? '' : 'opacity-60')}
            >
              {/* Las etiquetas iban arriba a la derecha, al lado del ícono. Con el
                  menú abierto la tarjeta se angosta, "Producción" y "Ciudad del Valle"
                  se apilan en dos renglones y empujan el título hacia abajo: en la
                  misma fila unas tarjetas tenían el nombre seis píxeles más abajo que
                  otras. Ahora el ícono y el nombre mandan la altura de arriba (siempre
                  la misma) y las etiquetas bajan a su propio renglón, donde pueden
                  envolverse sin mover nada. El pie queda clavado abajo con mt-auto, así
                  que las tarjetas de una fila cierran parejas aunque el nombre ocupe
                  dos líneas. */}
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-ds bg-black flex items-center justify-center shrink-0 shadow-ds-02">
                  <Icon name="folder" size="md" color="currentColor" className="text-brand" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-ds-ink break-words text-label">{p.Nombre}</h3>
                  <p className="text-xs text-ds-gray-400 font-mono">{p.CodigoBC}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mb-4 empty:mb-0">
                {p.EsProductivo && <Badge variant="green">Producción</Badge>}
                {!p.Activo && <Badge variant="red">Inactivo</Badge>}
                {p.Estado && <Badge variant={estadoVariant(p.Estado)}>{p.Estado}</Badge>}
              </div>
              <div className="flex items-center justify-between mt-auto">
                <div className="flex items-center gap-1.5 text-xs text-ds-gray-400 font-medium">
                  <Icon name="user" size="sm" color="currentColor" />
                  {p.TotalPersonas} personas
                </div>
                <Icon name="arrow-right" size="sm" color="currentColor" className="text-ds-gray-300 group-hover:text-ds-ink transition-colors" />
              </div>
            </motion.button>
          ))}
        </motion.div>
      )}
    </PageShell>
  );
}
