'use client';
import { useEffect, useMemo, useState } from 'react';
import { Combobox } from '@/components/ui/Combobox';

export interface Partida { idPartida: number; codigo: string; nombre: string; }
export interface SubPartida { idSubPartida: number; codigo: string; nombre: string; idPartida: number; }

interface Props {
  partidas: Partida[];
  subpartidas: SubPartida[];
  /** idSubPartida seleccionado (la partida se deriva de la subpartida). */
  value: number | null;
  onChange: (idSubPartida: number | null) => void;
  required?: boolean;
}

// Selector de tarea de BC. La cuadrilla se amarra a una SUBPARTIDA (FK real);
// la partida solo sirve para filtrar y se deriva de la subpartida elegida.
export function TaskBCSelector({ partidas, subpartidas, value, onChange, required }: Props) {
  const sub = useMemo(
    () => (value != null ? subpartidas.find(s => s.idSubPartida === value) ?? null : null),
    [subpartidas, value],
  );

  // Partida elegida (filtro). Se inicializa desde la subpartida guardada.
  const [partidaId, setPartidaId] = useState<string>(sub ? String(sub.idPartida) : '');
  useEffect(() => {
    if (sub) setPartidaId(String(sub.idPartida));
  }, [sub]);

  const partidaActual = partidas.find(p => String(p.idPartida) === partidaId) ?? null;
  const subsDeLaPartida = useMemo(
    () => (partidaActual ? subpartidas.filter(s => s.idPartida === partidaActual.idPartida) : []),
    [subpartidas, partidaActual],
  );

  return (
    <div className="space-y-4">
      <Combobox
        label="Partida (BC)"
        required={required}
        value={partidaId}
        onChange={v => {
          setPartidaId(v);
          onChange(null); // al cambiar de partida, se re-elige la subpartida
        }}
        placeholder="Seleccionar partida"
        options={partidas.map(p => ({
          value: String(p.idPartida),
          label: `${p.codigo} ${p.nombre}`,
          parts: [{ text: p.codigo, weight: 'bold' as const }, { text: p.nombre, weight: 'light' as const }],
        }))}
      />
      <Combobox
        label="Subpartida (BC)"
        required={required}
        value={sub ? String(sub.idSubPartida) : ''}
        onChange={v => {
          const s = subpartidas.find(x => String(x.idSubPartida) === v);
          onChange(s ? s.idSubPartida : null);
        }}
        disabled={!partidaActual}
        placeholder={!partidaActual ? 'Elige una partida primero' : subsDeLaPartida.length ? 'Seleccionar subpartida' : 'Sin subpartidas'}
        emptyText="Sin subpartidas"
        options={subsDeLaPartida.map(s => ({
          value: String(s.idSubPartida),
          label: `${s.codigo} ${s.nombre}`,
          parts: [{ text: s.codigo, weight: 'bold' as const }, { text: s.nombre, weight: 'light' as const }],
        }))}
      />
      {sub && (
        <p className="text-xs text-ds-gray-400">
          Tarea BC: <span className="font-semibold text-black">{sub.codigo} · {sub.nombre}</span>
        </p>
      )}
    </div>
  );
}
