'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getStaff } from '@/lib/staff';
import { isDemo } from '@/lib/config';
type Call = { id: string; table_id: string; request_type: string; table_number: string };
export default function ServiceCalls() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (isDemo) return;
    let active = true;
    const refresh = async () => {
      try {
        const staff = await getStaff();
        const { data, error } = await supabase.from('service_calls').select('id,table_id,request_type,tables(table_number)').eq('restaurant_id', staff.restaurant_id).eq('status','pending').order('created_at');
        if (error) throw error;
        if (active) setCalls((data ?? []).map(c=>({ ...c, table_number:(Array.isArray(c.tables)?c.tables[0]:c.tables)?.table_number ?? 'Table' })));
      } catch { if (active) setError('Unable to load service requests.'); }
    };
    void refresh();
    const channel = supabase.channel('staff_service_calls').on('postgres_changes',{event:'*',schema:'public',table:'service_calls'},()=>{void refresh();}).subscribe();
    const timer = setInterval(refresh, 10000);
    return () => { active=false; clearInterval(timer); void supabase.removeChannel(channel); };
  }, []);
  return <section className="mb-6 space-y-2">{error && <p role="alert" className="text-red-700">{error}</p>}{calls.map(c=><div key={c.id} className="flex justify-between gap-4 rounded-xl border border-orange-200 bg-orange-50 p-4"><span>{c.table_number}: {c.request_type.replaceAll('_',' ')}</span><button onClick={async()=>{
    const { error } = await supabase.from('service_calls').update({status:'resolved'}).eq('id',c.id);
    if(error) setError('Unable to resolve request. Your role may not allow this action.');
    else setCalls(prev=>prev.filter(item=>item.id!==c.id));
  }} className="font-bold">Resolve</button></div>)}</section>;
}
