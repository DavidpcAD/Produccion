"use client";

// NOT-IN-DS: captura de firma a mano alzada con <canvas> + Pointer Events,
// igual que en public/app.html. El DS no tiene (ni tendría por qué tener) un
// componente de firma; solo el botón "Limpiar" usa Button del DS. El fondo
// del canvas queda blanco literal a propósito, en los dos temas: es "papel"
// para firmar con tinta oscura, no una superficie que deba oscurecerse.

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/mantenimiento/ds/Button/Button";

export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const [vacio, setVacio] = useState(true);

  function posicion(e: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    dibujando.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = posicion(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    canvasRef.current!.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = posicion(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111111";
    ctx.lineTo(x, y);
    ctx.stroke();
    if (vacio) setVacio(false);
  }

  function terminar() {
    dibujando.current = false;
    if (!vacio) onChange(canvasRef.current!.toDataURL("image/png"));
  }

  function limpiar() {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setVacio(true);
    onChange(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-2)" }}>
      <canvas
        ref={canvasRef}
        width={400}
        height={160}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={terminar}
        onPointerLeave={terminar}
        style={{
          width: "100%",
          maxWidth: 400,
          height: 160,
          borderRadius: "var(--ds-radius-md)",
          background: "var(--ds-color-white)",
          boxShadow: "var(--ds-shadow-01)",
          touchAction: "none",
          cursor: "crosshair"
        }}
      />
      <div>
        <Button label="Limpiar firma" color="white" size="sm" onClick={limpiar} />
      </div>
    </div>
  );
}
