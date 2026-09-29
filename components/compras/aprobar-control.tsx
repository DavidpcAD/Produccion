'use client';
import { Button } from '@/components/ds/Button/Button';
import { SlideToConfirm } from '@/components/ds/SlideToConfirm/SlideToConfirm';

interface Props {
  onApprove: () => void;
  onReject?: () => void;
  /** Texto del botón de aprobar en PC. */
  approveLabel?: string;
  /** Texto dentro de la perilla del deslizador en celular (corto, va en MAYÚSCULAS). */
  slideLabel?: string;
  rejectLabel?: string;
  busy?: boolean;
  /** Qué está pasando mientras `busy`. Se lee en voz alta (aria-live). */
  busyLabel?: string;
  /** Solo aprobar (el lote): sin rechazar. */
  oneWay?: boolean;
}

// Aprobar es irreversible: la orden se crea y se lanza en Business Central y le
// llega al proveedor. Por eso el control no es un botón suelto en ningún tamaño.
//  · PC      → botones del DS (Rechazar en blanco, Aprobar en verde).
//  · Celular → SlideToConfirm del DS: hay que DESLIZAR la perilla verde hasta el
//    final. Un roce no aprueba nada, y no tapa la pantalla con un menú flotante:
//    la orden que estás aprobando sigue a la vista mientras deslizás.
// Rechazar queda como acción secundaria (abre el modal que pide el motivo, así
// que ya tiene su propia confirmación).
export function AprobarControl({
  onApprove,
  onReject,
  approveLabel = 'Aprobar y lanzar',
  slideLabel = 'APROBAR',
  rejectLabel = 'Rechazar',
  busy = false,
  busyLabel = 'Lanzando en Business Central…',
  oneWay = false,
}: Props) {
  const twoWay = !oneWay && !!onReject;

  // Mientras BC contesta: decir en qué va. Antes era un spinner mudo dentro del
  // botón y el lanzamiento se siente eterno sin saber qué está esperando.
  if (busy) {
    return (
      <div className="oc-aprobar__espera" role="status" aria-live="polite">
        <span className="oc-aprobar__spinner" aria-hidden />
        <span>{busyLabel}</span>
      </div>
    );
  }

  return (
    <div className="oc-aprobar">
      <div className="oc-aprobar__pc">
        {twoWay && <Button color="white" size="sm" label={rejectLabel} onClick={onReject} />}
        <Button color="green" size="sm" layout="icon-left" icon="check" label={approveLabel} onClick={onApprove} />
      </div>

      <div className="oc-aprobar__movil">
        <SlideToConfirm
          label={slideLabel}
          onConfirm={onApprove}
          height={52}
          knobWidth={150}
          cornerRadius={26}
          successHoldMs={450}
        />
        {twoWay && (
          <button type="button" className="oc-aprobar__rechazar" onClick={onReject}>
            {rejectLabel}
          </button>
        )}
      </div>
    </div>
  );
}
