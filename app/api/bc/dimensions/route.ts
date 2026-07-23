import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { bcConfigured, getDimensionValues } from '@/lib/bc-client';

// GET /api/bc/dimensions?code=AC  → valores permitidos de la dimensión.
// Si BC no está configurado o falla, devuelve values:[] para que la UI
// degrade a entrada de texto libre sin romperse.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const code = new URL(req.url).searchParams.get('code');
  if (!code) return NextResponse.json({ error: 'code requerido' }, { status: 400 });

  if (!bcConfigured()) {
    return NextResponse.json({ values: [], bcReady: false });
  }

  try {
    const values = await getDimensionValues(code);
    return NextResponse.json({ values, bcReady: true });
  } catch (err) {
    console.error(`/api/bc/dimensions?code=${code} error:`, err);
    return NextResponse.json({ values: [], bcReady: false });
  }
}
