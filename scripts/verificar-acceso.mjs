// Verifica que el MENÚ y el PROXY digan lo mismo, para TODOS los roles.
//
// Uso:  node scripts/verificar-acceso.mjs
// No toca la base ni la red: evalúa `lib/permissions.ts` en seco.
//
// POR QUÉ EXISTE
// --------------
// La regla de acceso vive en `puedeAbrirRuta` (lib/permissions.ts) y la usan tres
// cosas: el proxy, la pantalla de entrada y el Sidebar. Cuando se desincronizan
// pasa una de dos, y las dos son invisibles hasta que alguien se queja:
//
//   · un enlace del menú que REBOTA al tocarlo (la persona lo ve, no lo abre);
//   · una persona que entra y le sale "tu rol todavía no tiene pantallas
//     asignadas" teniendo módulos — pasó el 2026-10-01 con Contabilidad.
//
// Además, tres de los doce roles de Producción (Bodega, Fábrica Maderas y
// Administracion · Locales) NO tienen ningún usuario en AdelanteSBX, así que no
// hay forma de probarlos entrando a la app. Acá sí.
//
// Qué comprueba, rol por rol:
//   1. Ningún enlace que el Sidebar muestra rebota en el proxy.
//   2. Todo rol cae en alguna pantalla al entrar (`rutaDeEntrada`).
//   3. Toda ruta que se le niega tiene un nombre que decirle (nunca el genérico
//      "esa pantalla", que no le explica nada a nadie).
//
// Si falla, sale con código 1 y dice qué rol y qué ruta.
//
// Necesita esbuild (ya está en node_modules) para leer el TypeScript.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── 1. Los enlaces del menú, sacados del propio Sidebar ─────────────────────
// Se leen del archivo en vez de duplicarlos acá: una lista copiada se queda
// vieja y el verificador pasaría a mentir.
const sidebar = readFileSync('components/layout/Sidebar.tsx', 'utf8');
const ini = sidebar.indexOf('const navItems: NavItemDef[] = [');
const fin = sidebar.indexOf('\n];', ini);
if (ini < 0 || fin < 0) {
  console.error('No se encontró `navItems` en components/layout/Sidebar.tsx. ¿Se renombró?');
  process.exit(1);
}
const MENU = [...new Set([...sidebar.slice(ini, fin).matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1]))];

// ─── 2. Un programa chiquito que usa la regla de verdad ──────────────────────
const dir = mkdtempSync(join(tmpdir(), 'acceso-'));
writeFileSync(join(dir, 'menu.json'), JSON.stringify(MENU));
writeFileSync(join(dir, 'main.ts'), `
import { computeAllowedModules, computeNivelAdmin, rutaDeEntrada, puedeAbrirRuta,
         getRouteLevel, visibleEnMenu, nombreDeRuta } from '@/lib/permissions';
import MENU from './menu.json';

const ROLES: [string, string][] = [
  ['Administracion', 'Super Admin'], ['Administracion', 'Contabilidad'],
  ['Administracion', 'Digitacion'], ['Administracion', 'Locales'],
  ['Bodega', 'General'], ['Fabrica Maderas', 'General'],
  ['Ingenieria', 'Infra'], ['Ingenieria', 'Acabados'], ['Ingenieria', 'Electrico'],
  ['Ingenieria', 'Obra Gris'], ['Ingenieria', 'PostVenta'],
  ['Presupuestista', 'General'],
];

let fallas = 0;
for (const [nombre, tipo] of ROLES) {
  const roles = [{ idRol: 1, nombre, idApp: 10, tipo }];
  const mods = computeAllowedModules(roles) ?? undefined;
  const nivel = computeNivelAdmin(roles);

  // Lo que el Sidebar deja ver: LA MISMA función que usa el Sidebar, no una
  // copia. Si alguien vuelve a escribir la regla a mano dentro del JSX, esto
  // deja de verla y el verificador pasa a mentir.
  const visibles = (MENU as string[]).filter((h) => visibleEnMenu(h, mods, nivel));

  const rebotan = visibles.filter((h) => !puedeAbrirRuta(h, mods, nivel, getRouteLevel(h)));
  const entrada = rutaDeEntrada(mods, nivel);
  const sinNombre = (MENU as string[])
    .filter((h) => !puedeAbrirRuta(h, mods, nivel, getRouteLevel(h)))
    .filter((h) => nombreDeRuta(h) === 'esa pantalla');

  const problemas: string[] = [];
  if (rebotan.length) problemas.push('rebotan del menú: ' + rebotan.join(' '));
  if (!entrada) problemas.push('no entra a ninguna pantalla');
  if (sinNombre.length) problemas.push('se niegan sin nombre: ' + sinNombre.join(' '));

  fallas += problemas.length;
  const estado = problemas.length ? '✗' : '✓';
  console.log(\`\${estado} \${(nombre + ' · ' + tipo).padEnd(32)} menú \${String(visibles.length).padStart(2)}  entra en \${entrada ?? '—'}\`);
  for (const p of problemas) console.log('    ' + p);
}

console.log(fallas === 0
  ? '\\nTodo en orden: el menú y el proxy dicen lo mismo para los 12 roles.'
  : \`\\n\${fallas} problema(s). El menú y el proxy NO dicen lo mismo.\`);
process.exit(fallas === 0 ? 0 : 1);
`);

const salida = join(dir, 'main.cjs');
execFileSync('npx', ['esbuild', join(dir, 'main.ts'), '--bundle', '--platform=node',
  '--format=cjs', `--outfile=${salida}`, '--log-level=error',
  `--alias:@=${process.cwd()}`, '--loader:.json=json'], { stdio: 'inherit' });

try {
  execFileSync('node', [salida], { stdio: 'inherit' });
} catch {
  process.exit(1);
}
