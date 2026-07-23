import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getJobs } from '@/lib/bc-client';
import { getDb, sql } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const bcData = await getJobs();
    const jobs = bcData.value ?? [];

    // Sync to local DB
    const toDate = (val: string | undefined) => {
      if (!val || val.startsWith('0001') || val.startsWith('1753')) return null;
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    };

    const db = await getDb();

    // Verificar que el usuario existe en Colaboradores
    const userCheck = await db.request()
      .input('idCol', sql.Int, session.idCol)
      .query('SELECT IDCol FROM Colaboradores WHERE IDCol = @idCol');
    const creadoPor = userCheck.recordset.length > 0 ? session.idCol : null;

    for (const job of jobs) {
      try {
        await db.request()
          .input('codigoBC', sql.NVarChar, job.no)
          .input('nombre', sql.NVarChar, job.description)
          .input('estado', sql.NVarChar, job.status ?? 'Activo')
          .input('fechaInicio', sql.Date, toDate(job.startingDate))
          .input('fechaFin', sql.Date, toDate(job.endingDate))
          .input('creadoPor', sql.Int, creadoPor)
          .query(`
            MERGE Proyectos AS target
            USING (VALUES (@codigoBC)) AS src(CodigoBC)
            ON target.CodigoBC = src.CodigoBC
            WHEN MATCHED THEN UPDATE SET Nombre = @nombre, Estado = @estado
            WHEN NOT MATCHED THEN
              INSERT (CodigoBC, Nombre, Estado, FechaInicio, FechaFinEstimada, CreadoPor)
              VALUES (@codigoBC, @nombre, @estado, @fechaInicio, @fechaFin, @creadoPor);
          `);
      } catch (jobErr) {
        console.error(`BC sync error for job ${job.no}:`, jobErr);
      }
    }

    return NextResponse.json({ jobs });
  } catch (err) {
    console.error('BC jobs error:', err);
    return NextResponse.json({ error: 'Error conectando con Business Central' }, { status: 502 });
  }
}
