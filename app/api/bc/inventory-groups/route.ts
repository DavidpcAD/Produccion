import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { bcConfigured, getInventoryPostingGroups } from '@/lib/bc-client';

// GET /api/bc/inventory-groups → grupos de registro de inventario para el
// multi-select del wizard. Si BC no está listo, devuelve groups:[] y la UI
// cae a una lista por defecto.
export async function GET() {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (!bcConfigured()) {
    return NextResponse.json({ groups: [], bcReady: false });
  }
  try {
    const groups = await getInventoryPostingGroups();
    return NextResponse.json({ groups, bcReady: true });
  } catch (err) {
    console.error('/api/bc/inventory-groups error:', err);
    return NextResponse.json({ groups: [], bcReady: false });
  }
}
