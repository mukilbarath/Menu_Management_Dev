'use client';

import { useState, useEffect } from 'react';
import { isDemo } from '@/lib/config';
import { getStaff } from '@/lib/staff';
import { supabase } from '@/lib/supabase';
import { ChefHat, Utensils, ReceiptText, QrCode, Printer } from 'lucide-react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';

const DEMO_TABLES = [
  { id: '22222222-2222-2222-2222-222222222221', table_number: 'Table 1', restaurant_id: '11111111-1111-1111-1111-111111111111', public_token: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' },
  { id: '22222222-2222-2222-2222-222222222222', table_number: 'Table 2', restaurant_id: '11111111-1111-1111-1111-111111111111', public_token: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2' },
  { id: '22222222-2222-2222-2222-222222222223', table_number: 'Table 3', restaurant_id: '11111111-1111-1111-1111-111111111111', public_token: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3' },
];

export default function TablesManagement() {
  const [tables, setTables] = useState(isDemo ? DEMO_TABLES : []);
  const [origin, setOrigin] = useState('');
  const [newTableNumber, setNewTableNumber] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '');
    const timer = setTimeout(() => setOrigin(configuredOrigin || window.location.origin), 0);
    if (!isDemo) {
      const fetchTables = async () => {
        const staff = await getStaff();
        const { data, error } = await supabase.from('tables').select('id,restaurant_id,table_number,public_token').eq('restaurant_id', staff.restaurant_id).eq('is_active',true).order('table_number');
        if (error) throw error;
        if (data) setTables(data);
      };
      fetchTables().catch(err => alert(err.message));
    }
    return () => clearTimeout(timer);
  }, []);

  const addTable = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newTableNumber.trim() || isDemo) return;
    setBusy('add');
    const { error } = await supabase.rpc('add_restaurant_table', { p_number: newTableNumber.trim() });
    if (error) alert(error.message); else window.location.reload();
    setBusy(null);
  };

  const resetQr = async (tableId: string) => {
    if (isDemo) return alert('QR reset is disabled in demo mode.');
    setBusy(tableId);
    const { data, error } = await supabase.rpc('reset_table_qr', { p_table: tableId });
    if (error) alert(error.message);
    else setTables(current => current.map(table => table.id === tableId ? { ...table, public_token: data } : table));
    setBusy(null);
  };

  const handlePrint = (tableId: string) => {
    const printContent = document.getElementById(`qr-${tableId}`);
    if (printContent) {
      const windowPrint = window.open('', '', 'width=800,height=600');
      windowPrint?.document.write(`
        <html>
          <head>
            <title>Print QR Code</title>
            <style>
              body { display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; font-family: sans-serif; }
              .card { text-align: center; border: 2px solid #000; padding: 40px; border-radius: 20px; }
              h1 { font-size: 32px; margin-bottom: 20px; }
              p { font-size: 20px; color: #555; }
            </style>
          </head>
          <body>
            ${printContent.outerHTML}
          </body>
        </html>
      `);
      windowPrint?.document.close();
      windowPrint?.focus();
      setTimeout(() => {
        windowPrint?.print();
        windowPrint?.close();
      }, 500);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-slate-900 text-white p-6 flex flex-col">
        <h1 className="text-2xl font-black tracking-tight mb-12 text-orange-500">Staff Portal</h1>
        
        <nav className="space-y-4 flex-1">
          <Link href="/staff/orders" className="flex items-center gap-3 text-slate-400 hover:text-slate-200 hover:bg-slate-800 px-4 py-3 rounded-xl font-medium transition-colors">
            <Utensils className="w-5 h-5" />
            Active Orders
          </Link>
          <Link href="/staff/tables" className="flex items-center gap-3 text-slate-200 bg-slate-800 px-4 py-3 rounded-xl font-medium">
            <QrCode className="w-5 h-5" />
            Tables & QR
          </Link>
          <Link href="/staff/kitchen" className="flex items-center gap-3 text-slate-400 hover:text-slate-200 hover:bg-slate-800 px-4 py-3 rounded-xl font-medium transition-colors">
            <ChefHat className="w-5 h-5" />
            Kitchen Display
          </Link>
          <Link href="/staff/billing" className="flex items-center gap-3 text-slate-400 hover:text-slate-200 hover:bg-slate-800 px-4 py-3 rounded-xl font-medium transition-colors">
            <ReceiptText className="w-5 h-5" />
            Billing & History
          </Link>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8">
        <header className="mb-8">
          <h2 className="text-3xl font-bold text-slate-800">Tables & QR Codes</h2>
          <p className="text-slate-500 mt-1">Manage tables and print table QR codes</p>
        </header>
        {!isDemo && <form onSubmit={addTable} className="mb-8 flex max-w-md gap-3">
          <input value={newTableNumber} onChange={event => setNewTableNumber(event.target.value)} maxLength={30} required placeholder="Table number or name" className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3" />
          <button disabled={busy==='add'} className="rounded-xl bg-orange-500 px-5 font-bold text-white">{busy==='add'?'Adding…':'Add table'}</button>
        </form>}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          {origin && tables.map(table => {
            const qrUrl = `${origin}/q/${table.public_token}`;
            
            return (
              <div key={table.id} className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8 flex flex-col items-center">
                <div id={`qr-${table.id}`} className="card flex flex-col items-center">
                  <h3 className="text-2xl font-bold text-slate-900 mb-6">{table.table_number}</h3>
                  <div className="bg-white p-4 rounded-2xl border-4 border-slate-900">
                    <QRCodeSVG 
                      value={qrUrl} 
                      size={200}
                      level="H"
                      includeMargin={false}
                    />
                  </div>
                  <p className="text-sm text-slate-500 mt-6 max-w-[200px] text-center font-medium">
                    Scan to view menu & order for this table
                  </p>
                </div>
                
                <div className="w-full h-px bg-slate-100 my-8"></div>
                
                <button 
                  onClick={() => handlePrint(table.id)}
                  className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-6 rounded-xl transition-all"
                >
                  <Printer className="w-5 h-5" />
                  Print QR Sticker
                </button>
                <button disabled={busy===table.id} onClick={() => resetQr(table.id)} className="mt-3 w-full rounded-xl border border-red-200 py-3 font-bold text-red-700 disabled:opacity-50">
                  {busy===table.id ? 'Resetting…' : 'Reset QR'}
                </button>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
