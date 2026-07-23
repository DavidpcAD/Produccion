import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { enrolarEnZona, H4Error } from '@/lib/h4';

// Enrolamiento masivo: da de alta en el dispositivo de una zona a varios
// colaboradores ya existentes. El alta va por la API de H4 (server-to-server);
// se hace secuencial para no saturar y para reportar el resultado por colaborador.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const idZona = body?.idZona != null && String(body.idZona).trim() !== '' ? Number(body.idZona) : null;
  const ids: number[] = Array.isArray(body?.idColaboradores)
    ? body.idColaboradores.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)
    : [];
  if (!idZona) return NextResponse.json({ error: 'Debe indicar la zona.' }, { status: 400 });
  if (ids.length === 0) return NextResponse.json({ error: 'Seleccioná al menos un colaborador.' }, { status: 400 });

  const resultados: { idColaborador: number; ok: boolean; error?: string; equipos?: number }[] = [];
  for (const idColaborador of ids) {
    try {
      const r = await enrolarEnZona(idZona, idColaborador, session.cedula ?? null);
      resultados.push({ idColaborador, ok: true, equipos: r.equipos });
    } catch (e) {
      const error = e instanceof H4Error ? e.message : (e instanceof Error ? e.message : String(e));
      resultados.push({ idColaborador, ok: false, error });
    }
  }

  const enrolados = resultados.filter(r => r.ok).length;
  return NextResponse.json({ enrolados, fallidos: resultados.length - enrolados, resultados });
}
