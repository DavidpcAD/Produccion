import { NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/auth';

// Se usa un Location RELATIVO ('/login') para que el navegador resuelva contra
// el dominio actual (usuarios.adelante.cr) y no salte al host interno de Azure
// (usuarios-ad.azurewebsites.net).
function logoutResponse() {
  const res = new NextResponse(null, { status: 303, headers: { Location: '/login' } });
  res.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/', httpOnly: true });
  return res;
}

export async function POST() {
  return logoutResponse();
}

export async function GET() {
  return logoutResponse();
}
