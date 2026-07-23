import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSession } from '@/lib/auth';

// Catálogos para los selects del formulario de colaborador.
// codigoDistrito e idPuesto son los FK granulares; el resto (departamento,
// cantón, provincia) se deriva en la vista V_Colaborador.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const db = await getDb();
  const [puestos, distritos, paises, zonas] = await Promise.all([
    db.request().query(`
      SELECT p.idPuesto, p.nombre AS puesto, d.nombre AS departamento
      FROM dbo.Puesto p LEFT JOIN dbo.Departamento d ON d.idDepartamento = p.idDepartamento
      ORDER BY d.nombre, p.nombre
    `),
    db.request().query(`
      SELECT di.codigoINEC AS codigoDistrito, di.nombre AS distrito,
             ca.nombre AS canton, pr.nombre AS provincia
      FROM dbo.Distrito di
      LEFT JOIN dbo.Canton ca ON ca.codigoINEC = di.codigoCanton
      LEFT JOIN dbo.Provincia pr ON pr.codigoINEC = ca.codigoProvincia
      ORDER BY pr.nombre, ca.nombre, di.nombre
    `),
    db.request().query(`SELECT idPais, nombre AS pais FROM dbo.Pais ORDER BY nombre`),
    // Zonas de marca de H4 (lectura directa del esquema h4 en AdelanteSBX).
    db.request().query(`
      SELECT idZona, nombre, ubicacion
      FROM h4.Zona WHERE activo = 1 ORDER BY nombre
    `),
  ]);

  return NextResponse.json({
    puestos: puestos.recordset,
    distritos: distritos.recordset,
    paises: paises.recordset,
    zonas: zonas.recordset,
  });
}
