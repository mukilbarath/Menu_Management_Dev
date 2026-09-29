'use client';

import { useState, useEffect } from 'react';
import { isDemo } from '@/lib/config';
import { supabase } from '@/lib/supabase';
import { fetchStaffOrders } from '@/lib/staff';
import { ReceiptText, TrendingUp, Users, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { getStaff } from '@/lib/staff';

type Order = {
  id: string;
  table_number: string;
  status: string;
  total_amount: number;
  created_at: string;
};

type BillingSettings = { gst_percent:number; prices_include_gst:boolean; service_charge_percent:number; packaging_charge:number; rounding_increment:number };
type Bill = { id:string; order_id:string; total_amount:number; status:string; bill_splits:{id:string;label:string;amount:number;status:string}[]; orders:{order_items:{id:string;dish_name:string;quantity:number;price_at_time:number}[]}[] };

export default function BillingAnalytics() {
  const [error, setError] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState<BillingSettings | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isDemo) {
      const demoTimer = setTimeout(() => setOrders([
        { id: '1', table_number: 'Table 1', status: 'closed', total_amount: 1500, created_at: new Date().toISOString() },
        { id: '2', table_number: 'Table 3', status: 'closed', total_amount: 850, created_at: new Date(Date.now() - 3600000).toISOString() },
        { id: '3', table_number: 'Table 2', status: 'billed', total_amount: 2200, created_at: new Date().toISOString() },
      ]), 0);
      return () => clearTimeout(demoTimer);
    }

    const fetchOrders = async () => {
      try {
        const staff = await getStaff();
        const [loadedOrders, settingsResult, billsResult] = await Promise.all([
          fetchStaffOrders(),
          supabase.from('restaurant_settings').select('gst_percent,prices_include_gst,service_charge_percent,packaging_charge,rounding_increment').eq('restaurant_id',staff.restaurant_id).single(),
          supabase.from('bills').select('id,order_id,total_amount,status,bill_splits(id,label,amount,status),orders(order_items(id,dish_name,quantity,price_at_time))').eq('restaurant_id',staff.restaurant_id).order('created_at',{ascending:false}).limit(30)
        ]);
        if (settingsResult.error) throw settingsResult.error;
        if (billsResult.error) throw billsResult.error;
        setOrders(loadedOrders); setSettings({ ...settingsResult.data, gst_percent:Number(settingsResult.data.gst_percent), service_charge_percent:Number(settingsResult.data.service_charge_percent), packaging_charge:Number(settingsResult.data.packaging_charge), rounding_increment:Number(settingsResult.data.rounding_increment) });
        setBills((billsResult.data ?? []).map(bill => ({...bill,total_amount:Number(bill.total_amount),bill_splits:bill.bill_splits.map(split=>({...split,amount:Number(split.amount)}))})) as Bill[]); setError('');
      }
      catch (err) { setError(err instanceof Error ? err.message : 'Unable to load orders'); }
    };
    fetchOrders();
    const channel = supabase.channel('billing_orders').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => { void fetchOrders(); }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  const closedOrders = orders.filter(o => o.status === 'closed');
  const totalRevenue = closedOrders.reduce((sum, order) => sum + order.total_amount, 0);
  const avgOrderValue = closedOrders.length > 0 ? (totalRevenue / closedOrders.length).toFixed(2) : 0;

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault(); if (!settings) return; setSaving(true);
    try { const staff=await getStaff(); const {error}=await supabase.from('restaurant_settings').update(settings).eq('restaurant_id',staff.restaurant_id); if(error) throw error; }
    catch(err){setError(err instanceof Error?err.message:'Unable to save billing settings');} finally{setSaving(false);}
  };

  const splitBill = async (bill: Bill, mode: 'equal'|'custom'|'item') => {
    let result;
    if (mode==='equal') { const people=Number(window.prompt('How many people? (2–20)','2')); if(!Number.isInteger(people)) return; result=await supabase.rpc('split_bill_equal',{p_bill:bill.id,p_people:people}); }
    else if (mode==='custom') { const value=window.prompt(`Enter amounts separated by commas. Total must be ₹${bill.total_amount}.`); if(!value)return; result=await supabase.rpc('split_bill_custom',{p_bill:bill.id,p_amounts:value.split(',').map(Number)}); }
    else {
      const items=bill.orders?.[0]?.order_items ?? []; if(items.length<2){setError('At least two order lines are required for an item split.');return;}
      result=await supabase.rpc('split_bill_items',{p_bill:bill.id,p_splits:items.map((item,index)=>({label:`Item ${index+1}: ${item.dish_name}`,items:[{order_item_id:item.id,quantity:item.quantity}]}))});
    }
    if(result.error)setError(result.error.message); else window.location.reload();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col md:flex-row">
      {/* Sidebar (Simplified for demo) */}
      <aside className="w-full md:w-64 bg-slate-900 text-white p-6 flex flex-col shrink-0">
        <h1 className="text-2xl font-black tracking-tight mb-12 text-orange-500">Staff Portal</h1>
        <nav className="space-y-4 flex-1">
          <Link href="/staff/orders" className="flex items-center gap-3 text-slate-400 hover:text-slate-200 hover:bg-slate-800 px-4 py-3 rounded-xl font-medium transition-colors">
            &larr; Back to Orders
          </Link>
          <Link href="/staff/billing" className="flex items-center gap-3 text-slate-200 bg-slate-800 px-4 py-3 rounded-xl font-medium transition-colors">
            <ReceiptText className="w-5 h-5" />
            Billing & Analytics
          </Link>
        </nav>
      </aside>

      <main className="flex-1 p-8 overflow-y-auto">
        {error && <p role="alert" className="p-4 bg-red-50 text-red-700">{error}</p>}
        <header className="mb-8">
          <h2 className="text-3xl font-bold text-slate-800">Billing Overview</h2>
          <p className="text-slate-500 mt-1">Metrics and recent closed bills</p>
        </header>

        {settings && <form onSubmit={saveSettings} className="mb-8 rounded-2xl border border-slate-200 bg-white p-6">
          <h3 className="mb-4 text-lg font-bold">Billing rules</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-sm">GST %<input type="number" min="0" max="100" step="0.01" value={settings.gst_percent} onChange={e=>setSettings({...settings,gst_percent:Number(e.target.value)})} className="mt-1 w-full rounded-lg border p-2" /></label>
            <label className="text-sm">Service charge %<input type="number" min="0" max="100" step="0.01" value={settings.service_charge_percent} onChange={e=>setSettings({...settings,service_charge_percent:Number(e.target.value)})} className="mt-1 w-full rounded-lg border p-2" /></label>
            <label className="text-sm">Takeaway packaging ₹<input type="number" min="0" step="0.01" value={settings.packaging_charge} onChange={e=>setSettings({...settings,packaging_charge:Number(e.target.value)})} className="mt-1 w-full rounded-lg border p-2" /></label>
            <label className="text-sm">Rounding ₹<input type="number" min="0" step="0.01" value={settings.rounding_increment} onChange={e=>setSettings({...settings,rounding_increment:Number(e.target.value)})} className="mt-1 w-full rounded-lg border p-2" /></label>
            <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={settings.prices_include_gst} onChange={e=>setSettings({...settings,prices_include_gst:e.target.checked})} /> Prices include GST</label>
          </div>
          <button disabled={saving} className="mt-4 rounded-xl bg-orange-500 px-5 py-2 font-bold text-white">{saving?'Saving…':'Save billing rules'}</button>
        </form>}

        {bills.some(bill=>bill.status==='open') && <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6">
          <h3 className="mb-4 text-lg font-bold">Open bills and split payments</h3>
          <div className="space-y-4">{bills.filter(bill=>bill.status==='open').map(bill=><div key={bill.id} className="rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><span className="font-mono text-sm">#{bill.order_id.slice(0,8)}</span><strong>₹{bill.total_amount}</strong></div>
            <div className="mt-3 flex flex-wrap gap-2"><button onClick={()=>splitBill(bill,'equal')} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white">Split equally</button><button onClick={()=>splitBill(bill,'item')} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white">Split by item</button><button onClick={()=>splitBill(bill,'custom')} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white">Custom amounts</button></div>
            <div className="mt-3 text-sm text-slate-600">{bill.bill_splits.map(split=><span key={split.id} className="mr-3">{split.label}: ₹{split.amount}</span>)}</div>
          </div>)}</div>
        </section>}

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-slate-500 font-medium">Total Revenue</p>
                <h3 className="text-3xl font-bold text-slate-800 mt-2">₹{totalRevenue}</h3>
              </div>
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                <TrendingUp className="w-6 h-6" />
              </div>
            </div>

          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-slate-500 font-medium">Closed Bills</p>
                <h3 className="text-3xl font-bold text-slate-800 mt-2">{closedOrders.length}</h3>
              </div>
              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-slate-500 font-medium">Avg Order Value</p>
                <h3 className="text-3xl font-bold text-slate-800 mt-2">₹{avgOrderValue}</h3>
              </div>
              <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
                <Users className="w-6 h-6" />
              </div>
            </div>
          </div>
        </div>

        {/* Recent Bills Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-800">Recent Transactions</h3>
            <button onClick={() => {
              const cell = (value: string | number) => '"' + String(value).replace(/^[=+@-]/, "'" + String(value)[0]).replaceAll('"','""') + '"';
              const csv = [['Order ID','Table','Created','Status','Amount'], ...orders.map(o=>[o.id,o.table_number,o.created_at,o.status,o.total_amount])].map(row=>row.map(cell).join(',')).join('\r\n');
              const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
              const a = document.createElement('a'); a.href=url; a.download='bills.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
            }} className="text-sm font-bold text-orange-600 hover:text-orange-700">Export CSV</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 text-slate-500 text-sm">
                  <th className="px-6 py-4 font-medium border-b border-slate-100">Order ID</th>
                  <th className="px-6 py-4 font-medium border-b border-slate-100">Table</th>
                  <th className="px-6 py-4 font-medium border-b border-slate-100">Time</th>
                  <th className="px-6 py-4 font-medium border-b border-slate-100">Status</th>
                  <th className="px-6 py-4 font-medium border-b border-slate-100 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {orders.map(order => (
                  <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 border-b border-slate-100 font-mono text-slate-500">{order.id.substring(0,8)}</td>
                    <td className="px-6 py-4 border-b border-slate-100 font-bold text-slate-800">{order.table_number}</td>
                    <td className="px-6 py-4 border-b border-slate-100 text-slate-600">
                      {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-6 py-4 border-b border-slate-100">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                        order.status === 'closed' ? 'bg-slate-100 text-slate-600' : 'bg-slate-800 text-white'
                      }`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 border-b border-slate-100 text-right font-bold text-slate-800">
                      ₹{order.total_amount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
