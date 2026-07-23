import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getJobTasks } from '@/lib/bc-client';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const jobNo = new URL(req.url).searchParams.get('jobNo');
  if (!jobNo) return NextResponse.json({ error: 'jobNo requerido' }, { status: 400 });

  try {
    const data = await getJobTasks(jobNo);
    return NextResponse.json({ tasks: data.value ?? [] });
  } catch (err) {
    console.error('BC tasks error:', err);
    return NextResponse.json({ error: 'Error conectando con Business Central' }, { status: 502 });
  }
}
