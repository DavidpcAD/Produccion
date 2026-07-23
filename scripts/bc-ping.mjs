#!/usr/bin/env node
// Diagnóstico directo contra Business Central (sin pasar por la app).
// Prueba el token OAuth y las acciones OData V4 del web service AdelanteObra.
//
// Uso:
//   node scripts/bc-ping.mjs                 # prueba GetDimensionValues AC y CC
//   node scripts/bc-ping.mjs AC              # solo AC
//
// Requiere las mismas env que la app: BC_TENANT_ID, BC_ENVIRONMENT,
// BC_COMPANY_ID, BC_CLIENT_ID, BC_CLIENT_SECRET.
// Las toma de process.env; si existe un .env.local en la raíz, también lo lee.

import { readFileSync } from 'node:fs';

// Carga simple de .env.local (si existe) sin dependencias externas.
try {
  const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch { /* sin .env.local: se usan las env del entorno */ }

const { BC_TENANT_ID, BC_ENVIRONMENT, BC_COMPANY_ID, BC_CLIENT_ID, BC_CLIENT_SECRET } = process.env;

// Para listar compañías y obtener el BC_COMPANY_ID basta con estas 4:
const missing = ['BC_TENANT_ID', 'BC_ENVIRONMENT', 'BC_CLIENT_ID', 'BC_CLIENT_SECRET']
  .filter((k) => !process.env[k]);
if (missing.length) {
  console.error('❌ Faltan env:', missing.join(', '));
  process.exit(1);
}

async function getToken() {
  const url = `https://login.microsoftonline.com/${BC_TENANT_ID}/oauth2/v2.0/token`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: BC_CLIENT_ID,
      client_secret: BC_CLIENT_SECRET,
      scope: 'https://api.businesscentral.dynamics.com/.default',
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Auth falló: ${data.error_description ?? data.error ?? res.status}`);
  }
  return data.access_token;
}

async function callAction(token, action, body) {
  const url = `https://api.businesscentral.dynamics.com/v2.0/${BC_TENANT_ID}/${BC_ENVIRONMENT}/ODataV4/${action}?company=${BC_COMPANY_ID}`;
  console.log(`\n→ POST ${action}`);
  console.log(`  ${url}`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`  HTTP ${res.status} ${res.statusText}`);
  console.log(`  ${text.slice(0, 800)}`);
  if (res.status === 404) {
    console.log('  ⚠️  404 → la acción no existe: falta publicar la extensión AdelanteObra.');
  }
}

async function listCompanies(token) {
  const url = `https://api.businesscentral.dynamics.com/v2.0/${BC_TENANT_ID}/${BC_ENVIRONMENT}/api/v2.0/companies`;
  console.log(`\n→ GET companies (para obtener BC_COMPANY_ID)`);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  console.log(`  HTTP ${res.status} ${res.statusText}`);
  if (res.status === 401 || res.status === 403) {
    console.log('  ⚠️  Auth OK pero SIN acceso: la App Registration no está habilitada dentro de BC (Entra Applications).');
    return;
  }
  for (const c of data.value ?? []) {
    console.log(`  • ${c.name}  →  BC_COMPANY_ID=${c.id}`);
  }
}

console.log('🔑 Pidiendo token OAuth…');
const token = await getToken();
console.log('✅ Token OK (auth y credenciales funcionan).');

await listCompanies(token);

if (!BC_COMPANY_ID) {
  console.log('\n(Definí BC_COMPANY_ID con el GUID de arriba y volvé a correr para probar las acciones de AdelanteObra.)');
} else {
  const codes = process.argv[2] ? [process.argv[2]] : ['AC', 'CC'];
  for (const code of codes) {
    await callAction(token, 'AdelanteObra_GetDimensionValues', { dimensionCode: code });
  }
  console.log('\nListo. HTTP 200 con [{code,name}] → BC responde y la app funcionará.');
  console.log('HTTP 404 → publicá la extensión AdelanteObra en el sandbox.');
}
