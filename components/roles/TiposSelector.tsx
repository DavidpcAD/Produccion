'use client';
import { Combobox } from '@/components/ui/Combobox';

export interface RolConTipos {
  IDRol: number;
  NombreRol: string;
  tipos?: { idTipoRol: number; nombre: string }[];
}

// Debajo del selector de roles: por cada rol SELECCIONADO que tenga tipos,
// muestra un dropdown para elegir el subtipo. El valor guardado es el nombre
// del tipo (se persiste en dbo.UsuarioRol.esTipo). Vacío = 'Indefinido'.
export function TiposSelector({ roles, selectedRoles, tiposByRol, onChange }: {
  roles: RolConTipos[];
  selectedRoles: number[];
  tiposByRol: Record<number, string>;
  onChange: (idRol: number, tipo: string) => void;
}) {
  const conTipos = roles.filter(r => selectedRoles.includes(r.IDRol) && (r.tipos?.length ?? 0) > 0);
  if (conTipos.length === 0) return null;
  return (
    <div className="rounded-ds-lg border border-ds-gray-200 p-3.5 space-y-2.5">
      <div>
        <label className="text-sm font-bold text-black">Tipo de rol</label>
        <p className="text-xs text-ds-gray-400">Estos roles se ramifican en subtipos. Elegí el que corresponde.</p>
      </div>
      <div className="space-y-2">
        {conTipos.map(r => (
          <div key={r.IDRol} className="flex items-center gap-3">
            <span className="text-sm font-semibold text-black w-36 sm:w-44 shrink-0 truncate">{r.NombreRol}</span>
            <div className="flex-1 min-w-0">
              <Combobox value={tiposByRol[r.IDRol] ?? ''} onChange={v => onChange(r.IDRol, v)}
                placeholder="Sin tipo"
                options={[{ value: '', label: 'Sin tipo' }, ...(r.tipos ?? []).map(t => ({ value: t.nombre, label: t.nombre }))]} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
