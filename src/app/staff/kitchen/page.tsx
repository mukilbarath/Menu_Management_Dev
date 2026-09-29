'use client';

import { useState, useEffect } from 'react';
import { isDemo } from '@/lib/config';
import { supabase } from '@/lib/supabase';
import { fetchStaffOrders, changeOrderStatus } from '@/lib/staff';
import { ChefHat, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import Link from 'next/link';

type OrderItem = {
  id: string;
  dish_name: string;
  quantity: number;
  notes: string;
};

type Order = {
  id: string;
  table_number: string;
  status: string;
  items: OrderItem[];
  created_at: string;
};

export default function KitchenDisplaySystem() {
  const [error, setError] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    if (isDemo) {
      const demoTimer = setTimeout(() => setOrders([
        {
          id: 'demo-123',
          table_number: 'Table 1',
          status: 'accepted',
          created_at: new Date().toISOString(),
          items: [
            { id: '1', dish_name: 'Paneer Tikka', quantity: 1, notes: 'Less spicy' },
            { id: '2', dish_name: 'Dal Makhani', quantity: 2, notes: '' }
          ]
        },
        {
          id: 'demo-124',
          table_number: 'Table 2',
          status: 'preparing',
          created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // 15 mins ago
          items: [
            { id: '3', dish_name: 'Margherita Pizza', quantity: 1, notes: 'Extra cheese' }
          ]
        }
      ]), 0);
      return () => clearTimeout(demoTimer);
    }

    const fetchOrders = async () => {
      try { setOrders(await fetchStaffOrders()); setError(''); }
      catch (err) { setError(err instanceof Error ? err.message : 'Unable to load orders'); }
    };
    fetchOrders();

    const channel = supabase
      .channel('kds_orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => { void fetchOrders(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const updateStatus = async (orderId: string, newStatus: string) => {
    if (isDemo) {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      return;
    }
    try { await changeOrderStatus(orderId, newStatus); setOrders(await fetchStaffOrders()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Status update failed'); }
  };

  const [, setClock] = useState(0);
  useEffect(() => { const timer = setInterval(() => setClock(value => value + 1), 30000); return () => clearInterval(timer); }, []);
  const getWaitTime = (createdAt: string) => {
    const mins = Math.floor((new Date().getTime() - new Date(createdAt).getTime()) / 60000);
    return mins;
  };

  const activeOrders = orders.filter(o => ['accepted', 'preparing'].includes(o.status));

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans flex flex-col">
      {/* Header */}
      <header className="bg-slate-950 border-b border-slate-800 p-6 flex justify-between items-center sticky top-0 z-10 shadow-md shadow-black/20">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-purple-500/20 text-purple-400 rounded-xl">
            <ChefHat className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white">Kitchen Display</h1>
            <p className="text-slate-400 text-sm font-medium">Service view</p>
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <div className="flex gap-2">
            <span className="px-4 py-2 bg-slate-800 rounded-lg text-sm font-bold border border-slate-700">
              <span className="text-yellow-500 mr-2">{activeOrders.filter(o => o.status === 'accepted').length}</span> New
            </span>
            <span className="px-4 py-2 bg-slate-800 rounded-lg text-sm font-bold border border-slate-700">
              <span className="text-purple-400 mr-2">{activeOrders.filter(o => o.status === 'preparing').length}</span> Cooking
            </span>
          </div>
          <Link href="/staff/orders" className="text-sm font-medium text-slate-500 hover:text-white transition-colors ml-4 border-l border-slate-700 pl-4">
            Exit KDS
          </Link>
        </div>
      </header>

      {/* Main Ticket Area */}
      <main className="flex-1 p-6 overflow-x-auto">
        {error && <p role="alert" className="p-4 bg-red-50 text-red-700">{error}</p>}
        {activeOrders.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 mt-20">
            <CheckCircle2 className="w-16 h-16 text-slate-700 mb-4" />
            <h2 className="text-2xl font-bold text-slate-400">All caught up!</h2>
            <p className="mt-2">No active orders in the kitchen.</p>
          </div>
        ) : (
          <div className="flex gap-6 h-full items-start">
            {activeOrders.map(order => {
              const waitTime = getWaitTime(order.created_at);
              const isUrgent = waitTime > 20;

              return (
                <div 
                  key={order.id} 
                  className={`flex-shrink-0 w-80 rounded-2xl flex flex-col border overflow-hidden ${
                    order.status === 'accepted' 
                      ? 'bg-slate-800 border-slate-700' 
                      : 'bg-purple-900/20 border-purple-800/50'
                  }`}
                >
                  {/* Ticket Header */}
                  <div className={`p-4 border-b flex justify-between items-start ${
                    order.status === 'accepted' ? 'border-slate-700 bg-slate-800' : 'border-purple-800/30 bg-purple-900/40'
                  }`}>
                    <div>
                      <h3 className="text-2xl font-black text-white">{order.table_number}</h3>
                      <p className="text-xs font-mono text-slate-400 mt-1">#{order.id.substring(0,6).toUpperCase()}</p>
                    </div>
                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold ${
                      isUrgent ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-slate-700 text-slate-300'
                    }`}>
                      <Clock className="w-4 h-4" />
                      {waitTime}m
                    </div>
                  </div>

                  {/* Items */}
                  <div className="p-4 flex-1 space-y-4 min-h-[250px]">
                    {order.items.map((item) => (
                      <div key={item.id} className="border-b border-slate-700/50 pb-4 last:border-0 last:pb-0">
                        <div className="flex gap-3">
                          <span className="text-xl font-black text-white shrink-0">{item.quantity}x</span>
                          <div>
                            <p className="text-lg font-bold text-slate-200 leading-tight">{item.dish_name}</p>
                            {item.notes && (
                              <div className="mt-2 bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 rounded-lg flex gap-2 items-start">
                                <AlertCircle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                                <p className="text-sm font-bold text-yellow-500 uppercase tracking-wide">{item.notes}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="p-4 border-t border-slate-700/50 bg-black/20">
                    {order.status === 'accepted' ? (
                      <button 
                        onClick={() => updateStatus(order.id, 'preparing')} 
                        className="w-full py-4 rounded-xl font-black text-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors active:scale-95"
                      >
                        Start Preparing
                      </button>
                    ) : (
                      <button 
                        onClick={() => updateStatus(order.id, 'served')} 
                        className="w-full py-4 rounded-xl font-black text-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors active:scale-95"
                      >
                        Mark Ready
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
