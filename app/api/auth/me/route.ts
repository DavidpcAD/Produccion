import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json(null, { status: 401 });

  const res = NextResponse.json(session);
  // Sin cache: sesión debe verificarse en cada request para que el logout
  // invalide inmediatamente (evita el bug de Back/Forward con sesión cacheada)
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
