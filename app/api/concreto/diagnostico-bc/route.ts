import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getBCToken, bcConfigured } from '@/lib/bc-client';

// Diagnóstico de la integración Business Central. SOLO ADMIN (nivelAdmin >= 4).
//   GET /api/concreto/diagnostico-bc?test=config     → env presentes
//   GET /api/concreto/diagnostico-bc?test=token      → token OAuth + claims JWT
//   GET /api/concreto/diagnostico-bc?test=companies  → lista companies (S2S)
//   GET /api/concreto/diagnostico-bc?test=assembly   → AssemblyOrder top 1
//
// Portado de `diagnostico-bc.ts`. Reúsa getBCToken/bcConfigured de bc-client.

function bcRoot(): string {
  return (
    process.env.BC_BASE_URL ??
    `https://api.businesscentral.dynamics.com/v2.0/${process.env.BC_TENANT_ID}/${process.env.BC_ENVIRONMENT}`
  );
}

function urlEmpresaBC(): string | null {
  const company = process.env.BC_COMPANY;
  if (!company) return null;
  return `${bcRoot()}/ODataV4/Company('${encodeURIComponent(company)}')`;
}

async function fetchBC(url: string): Promise<Record<string, unknown>> {
  const token = await getBCToken();
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  const txt = await r.text().catch(() => '');
  let body: unknown = txt;
  try {
    body = JSON.parse(txt);
  } catch {
    /* no JSON */
  }
  if (!r.ok) {
    return {
      ok: false,
      status: r.status,
      endpoint: url,
      body_bc: body,
    };
  }
  return { ok: true, endpoint: url, sample: body };
}

function decodeB64Url(s: string): string {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Buffer.from(padded, 'base64').toString('utf-8');
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.nivelAdmin < 4) return NextResponse.json({ error: 'Prohibido (solo admin)' }, { status: 403 });

  const test = req.nextUrl.searchParams.get('test') ?? 'config';

  try {
    if (test === 'config') {
      const secret = process.env.BC_CLIENT_SECRET ?? '';
      return NextResponse.json({
        configurado: bcConfigured(),
        BC_TENANT_ID: process.env.BC_TENANT_ID ?? '',
        BC_CLIENT_ID: process.env.BC_CLIENT_ID ?? '',
        BC_CLIENT_SECRET_present: secret.length > 0,
        BC_CLIENT_SECRET_length: secret.length,
        BC_ENVIRONMENT: process.env.BC_ENVIRONMENT ?? '',
        BC_BASE_URL: process.env.BC_BASE_URL ?? '',
        BC_COMPANY: process.env.BC_COMPANY ?? '',
        BC_COMPANY_ID: process.env.BC_COMPANY_ID ?? '',
        urlEmpresaBC: urlEmpresaBC(),
      });
    }

    if (test === 'token') {
      const tenant = process.env.BC_TENANT_ID ?? '';
      const params = new URLSearchParams();
      params.set('client_id', process.env.BC_CLIENT_ID ?? '');
      params.set('client_secret', process.env.BC_CLIENT_SECRET ?? '');
      params.set('scope', 'https://api.businesscentral.dynamics.com/.default');
      params.set('grant_type', 'client_credentials');

      const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        return NextResponse.json({ ok: false, stage: 'token_request', status: r.status, body });
      }
      const json = (await r.json()) as { access_token: string; expires_in: number; token_type: string };
      const partes = json.access_token.split('.');
      let jwt_payload: unknown = null;
      try {
        if (partes[1]) jwt_payload = JSON.parse(decodeB64Url(partes[1]));
      } catch {
        /* no se pudo decodificar */
      }
      return NextResponse.json({
        ok: true,
        token_type: json.token_type,
        expires_in: json.expires_in,
        access_token_length: json.access_token.length,
        jwt_payload,
      });
    }

    if (test === 'companies') {
      const url = `${bcRoot()}/api/v2.0/companies`;
      return NextResponse.json(await fetchBC(url));
    }

    if (test === 'assembly') {
      const base = urlEmpresaBC();
      if (!base) {
        return NextResponse.json({ ok: false, error: 'Falta BC_COMPANY (nombre de la empresa).' });
      }
      return NextResponse.json(await fetchBC(`${base}/AssemblyOrder?$top=1`));
    }

    return NextResponse.json({ error: `test inválido: "${test}". Use config|token|companies|assembly.` }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/diagnostico-bc GET error:', err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
