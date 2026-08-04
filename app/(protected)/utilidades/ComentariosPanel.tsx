'use client';
import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { Icon } from '@/components/ds/Icon/Icon';

// Panel de comentarios del reporte, anclados a (anio, mes). Cubre el caso
// básico del scope "ejecutivo" (nota general del mes) + el scope "seccion"
// para las dos secciones del dashboard. Los comentarios a nivel de celda
// (3ª capa) quedan como TODO(utilidades).

interface Comentario {
  id_comentario: number;
  anio: number;
  mes: number;
  scope: 'ejecutivo' | 'seccion' | 'celda';
  seccion_id: string | null;
  contenido_markdown: string;
  autor_nombre: string;
  autor_rol: string;
  estado: string;
  creado_en: string;
  editado_en: string | null;
}

export function ComentariosPanel({
  anio,
  mes,
  scope = 'ejecutivo',
  seccionId = null,
  titulo = 'Comentarios',
}: {
  anio: number;
  mes: number;
  scope?: 'ejecutivo' | 'seccion';
  seccionId?: string | null;
  titulo?: string;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [loading, setLoading] = useState(true);
  const [texto, setTexto] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const d = await fetch(`/api/utilidades/comentarios?anio=${anio}&mes=${mes}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    setComentarios(d?.comentarios ?? []);
    setLoading(false);
  }, [anio, mes]);

  useEffect(() => {
    load();
  }, [load]);

  const propios = comentarios.filter(
    (c) => c.scope === scope && (c.seccion_id ?? null) === (seccionId ?? null),
  );

  async function guardar() {
    const contenido = texto.trim();
    if (!contenido) {
      toast('Escribí un comentario', 'warning');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/utilidades/comentarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anio, mes, scope, seccion_id: seccionId, contenido_markdown: contenido }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || 'No se pudo guardar', 'error');
        return;
      }
      toast('Comentario guardado', 'success');
      setTexto('');
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function eliminar(id: number) {
    if (!(await confirm({ message: '¿Eliminar este comentario?', danger: true }))) return;
    const res = await fetch(`/api/utilidades/comentarios/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast('No se pudo eliminar', 'error');
      return;
    }
    toast('Comentario eliminado', 'success');
    await load();
  }

  return (
    <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Icon name="edit" size="sm" color="currentColor" />
        <h3 className="font-bold text-ds-ink text-sm">{titulo}</h3>
      </div>

      <div className="space-y-2">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          maxLength={10000}
          placeholder="Agregar un comentario para este período…"
          className="w-full rounded-ds border border-ds-gray-200 px-3 py-2 text-sm text-ds-ink focus:outline-none focus:border-black resize-y"
        />
        <div className="flex justify-end">
          <Button size="sm" loading={saving} onClick={guardar}>
            Guardar comentario
          </Button>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-16 w-full" />
      ) : propios.length === 0 ? (
        <p className="text-xs text-ds-gray-300">Sin comentarios para este período.</p>
      ) : (
        <ul className="divide-y divide-ds-gray-100">
          {propios.map((c) => (
            <li key={c.id_comentario} className="py-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-ds-ink whitespace-pre-wrap break-words">{c.contenido_markdown}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-ds-gray-400">
                  <span className="font-semibold text-ds-gray-500">{c.autor_nombre || 'Anónimo'}</span>
                  <Badge variant="gray">{c.autor_rol}</Badge>
                  {c.estado && <span className="uppercase tracking-wide">{c.estado}</span>}
                </div>
              </div>
              <button
                onClick={() => eliminar(c.id_comentario)}
                className="text-ds-gray-400 hover:text-ds-red shrink-0"
                title="Eliminar"
              >
                <Icon name="delete" size="sm" color="currentColor" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
