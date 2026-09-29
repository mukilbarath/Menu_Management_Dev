'use client';

import { useState, useEffect } from 'react';
import { isDemo } from '@/lib/config';
import { supabase } from '@/lib/supabase';
import { fetchStaffOrders, changeOrderStatus } from '@/lib/staff';
import { ChefHat, Utensils, ReceiptText, QrCode } from 'lucide-react';
import Link from 'next/link';
import ServiceCalls from '@/components/ServiceCalls';

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
  total_amount: number;
  items: OrderItem[];
  created_at: string;
  order_type?: string;
};

const DEMO_ORDER: Order = {
  id: 'demo-123',
  table_number: 'Table 1',
  status: 'placed',
  total_amount: 600,
  created_at: new Date().toISOString(),
  items: [
    { id: '1', dish_name: 'Paneer Tikka', quantity: 1, notes: 'Less spicy' },
    { id: '2', dish_name: 'Chicken Wings', quantity: 1, notes: '' }
  ]
};

export default function StaffPortal() {
  const [error, setError] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    if (isDemo) {
      const demoTimer = setTimeout(() => setOrders([DEMO_ORDER]), 0);
      return () => clearTimeout(demoTimer);
    }

    // Load full order tickets and keep them synchronized with database changes.
    const fetchOrders = async () => {
      try { setOrders(await fetchStaffOrders()); setError(''); }
      catch (err) { setError(err instanceof Error ? err.message : 'Unable to load orders'); }
    };
    fetchOrders();

    const channel = supabase
      .channel('staff_orders')
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

  const recordCounterPayment = async (orderId: string, method: 'cash' | 'counter_card') => {
    try {
      const { error } = await supabase.rpc('record_counter_payment', { p_order: orderId, p_method: method });
      if (error) throw error;
      setOrders(await fetchStaffOrders());
    } catch (err) { setError(err instanceof Error ? err.message : 'Payment could not be recorded'); }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'placed': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'accepted': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'preparing': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'served': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'billed': return 'bg-slate-100 text-slate-800 border-slate-200';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-slate-900 text-white p-6 flex flex-col">
        <h1 className="text-2xl font-black tracking-tight mb-12 text-orange-500">Staff Portal</h1>
        
        <nav className="space-y-4 flex-1">
          <Link href="/staff/orders" className="flex items-center gap-3 text-slate-200 bg-slate-800 px-4 py-3 rounded-xl font-medium">
            <Utensils className="w-5 h-5" />
            Active Orders
          </Link>
          <Link href="/staff/tables" className="flex items-center gap-3 text-slate-400 hover:text-slate-200 hover:bg-slate-800 px-4 py-3 rounded-xl font-medium transition-colors">
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

        <div className="pt-8 border-t border-slate-800">
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
            &larr; Back to Home
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8">
        {error && <p role="alert" className="p-4 bg-red-50 text-red-700">{error}</p>}
        <header className="mb-8 flex justify-between items-end">
          <div>
            <h2 className="text-3xl font-bold text-slate-800">Active Orders</h2>
            <p className="text-slate-500 mt-1">Manage incoming requests</p>
          </div>
          <div className="text-sm bg-white px-4 py-2 rounded-lg border border-slate-200 text-slate-600 shadow-sm">
            Last updated: Just now
          </div>
        </header>

        <ServiceCalls />
        {orders.filter(o => o.status !== 'closed').length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 bg-white rounded-2xl shadow-sm border border-slate-200 text-center">
            <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-6">
              <Utensils className="w-12 h-12 text-slate-300" />
            </div>
            <h3 className="text-2xl font-bold text-slate-800">No active orders</h3>
            <p className="text-slate-500 mt-2 max-w-sm">Waiting for customers to place new orders. They will appear here automatically.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {orders.filter(o => o.status !== 'closed').map(order => (
              <div key={order.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                {/* Card Header */}
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <div>
                    <h3 className="text-xl font-bold text-slate-800">{order.table_number}</h3>
                    <p className="text-xs text-slate-400 font-mono mt-1">ID: {order.id.substring(0,8)}</p>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider ${getStatusColor(order.status)}`}>
                    {order.status}
                  </div>
                </div>

                {/* Items */}
                <div className="p-5 flex-1 space-y-4">
                  {order.items.map(item => (
                    <div key={item.id} className="flex gap-3 text-sm">
                      <span className="font-bold text-slate-800 shrink-0">{item.quantity}x</span>
                      <div>
                        <p className="font-semibold text-slate-700">{item.dish_name}</p>
                        {item.notes && (
                          <p className="text-orange-600 mt-0.5 text-xs font-medium bg-orange-50 inline-block px-2 py-0.5 rounded">Note: {item.notes}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="p-5 bg-slate-50 border-t border-slate-100">
                  <div className="flex justify-between items-center mb-4 text-sm text-slate-500">
                    <span>Total Amount</span>
                    <span className="font-bold text-lg text-slate-800">₹{order.total_amount}</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    {order.status === 'placed' && (
                      <button onClick={() => updateStatus(order.id, 'accepted')} className="col-span-2 bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition-colors shadow-sm">
                        Accept Order
                      </button>
                    )}
                    {order.status === 'accepted' && (
                      <button onClick={() => updateStatus(order.id, 'preparing')} className="col-span-2 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl transition-colors shadow-sm">
                        Send to Kitchen
                      </button>
                    )}
                    {order.status === 'preparing' && (
                      <button onClick={() => updateStatus(order.id, 'served')} className="col-span-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition-colors shadow-sm">
                        Mark Served
                      </button>
                    )}
                    {order.status === 'served' && (
                      <button onClick={() => updateStatus(order.id, 'billed')} className="col-span-2 bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl transition-colors shadow-sm">
                        Generate Bill
                      </button>
                    )}
                    {order.status === 'billed' && (
                      <>
                        <button onClick={() => recordCounterPayment(order.id, 'cash')} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition-colors shadow-sm">Paid Cash</button>
                        <button onClick={() => recordCounterPayment(order.id, 'counter_card')} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors shadow-sm">Paid by Card</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
