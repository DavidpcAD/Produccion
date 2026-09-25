'use client';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ds/Icon/Icon';

// ─── Selector de archivo ─────────────────────────────────────────────────────
// Un <input type="file"> pelado pinta su propio texto —"Sin archivos
// seleccionados"— con la tipografía del NAVEGADOR, no la del DS, y cada navegador
// e idioma dice otra cosa ("Ningún archivo seleccionado", "No file chosen"). Al
// lado de los botones del sistema se ve prestado, y nada de eso se puede estilar.
//
// Acá el input va escondido y afuera quedan un botón del DS y el nombre del
// archivo elegido. El nombre se muestra ENTERO, bajando de línea: un Excel se
// llama "Presupuesto Valle Ilios REESTUDIO 3 - final.xlsx" y cortarlo deja
// justamente la parte que lo distingue afuera.
//
// El `ref` sigue apuntando al input de verdad, así que quien ya leía
// `ref.current?.files?.[0]` no cambia nada.

export interface FileInputProps {
  /** Extensiones que acepta, igual que el atributo nativo (".xlsx,.xls"). */
  accept?: string;
  /** Texto del botón cuando todavía no hay archivo. */
  label?: string;
  /** Se avisa al elegir (o al limpiar) para quien necesite reaccionar. */
  onFile?: (archivo: File | null) => void;
  disabled?: boolean;
  id?: string;
}

export const FileInput = forwardRef<HTMLInputElement, FileInputProps>(
  ({ accept, label = 'Seleccionar archivo', onFile, disabled, id }, ref) => {
    const interno = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => interno.current as HTMLInputElement, []);
    const [archivo, setArchivo] = useState<File | null>(null);

    function elegido(f: File | null) {
      setArchivo(f);
      onFile?.(f);
    }

    function limpiar() {
      if (interno.current) interno.current.value = '';
      elegido(null);
    }

    return (
      <div className="space-y-2">
        <input
          ref={interno}
          id={id}
          type="file"
          accept={accept}
          disabled={disabled}
          className="sr-only"
          onChange={(e) => elegido(e.target.files?.[0] ?? null)}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => interno.current?.click()}
            icon={<Icon name="open" size="sm" color="currentColor" />}
          >
            {archivo ? 'Cambiar archivo' : label}
          </Button>
          {archivo && (
            // `break-all` y no `break-words`: los nombres de archivo vienen con
            // guiones y puntos y sin espacios donde cortar.
            <span className="text-sm text-ds-ink font-mono break-all min-w-0">
              {archivo.name}
            </span>
          )}
        </div>
        {archivo ? (
          <button
            type="button"
            onClick={limpiar}
            className="text-xs font-semibold text-ds-gray-400 hover:text-ds-ink transition-colors"
          >
            Quitar
          </button>
        ) : (
          <p className="text-xs text-ds-gray-400">Ningún archivo elegido todavía.</p>
        )}
      </div>
    );
  },
);
FileInput.displayName = 'FileInput';
