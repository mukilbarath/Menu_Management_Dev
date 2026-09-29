import { NextResponse } from 'next/server';
import { authenticatedClient, HttpError, apiError } from '@/lib/server';
import { parseMenuCsv } from '@/lib/csv';
export async function POST(request: Request) {
  try {
    const { client, user } = await authenticatedClient(request);
    const { data: profile } = await client.from('staff_profiles').select('role').eq('id', user.id).single();
    if (!profile || !['owner','manager'].includes(profile.role)) throw new HttpError('Only managers can import menus.', 403);
    if (Number(request.headers.get('content-length')) > 1100000) throw new HttpError('Maximum upload size is 1 MB', 413);
    const form = await request.formData(); const file = form.get('file');
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.csv')) throw new HttpError('Upload a CSV file');
    if (file.size > 1000000) throw new HttpError('Maximum upload size is 1 MB', 413);
    let rows;
    try { rows = parseMenuCsv(await file.text()); } catch (err) { throw new HttpError(err instanceof Error ? err.message : 'Invalid CSV'); }
    const { data, error } = await client.rpc('import_menu', { p_rows: rows });
    if (error) throw error;
    return NextResponse.json({ success: true, ...data });
  } catch (error) { return apiError(error); }
}
