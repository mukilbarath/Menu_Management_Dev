'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Clock, CheckCircle2, ChefHat, Utensils, ReceiptText } from 'lucide-react';
import { useParams } from 'next/navigation';

import Script from 'next/script';
import { isDemo as demoEnvironment } from '@/lib/config';
type PaymentResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type CheckoutOptions = { key: string; amount: number; currency: string; name: string; order_id: string; handler: (response: PaymentResponse) => Promise<void>; modal: { ondismiss: () => void } };
declare global { interface Window { Razorpay?: new (options: CheckoutOptions) => { open: () => void; on: (event: string, handler: (response: { error: { description: string } }) => void) => void }; } }

const STATUS_STEPS = [
  { id: 'placed', label: 'Order Placed', icon: Clock },
  { id: 'accepted', label: 'Accepted', icon: CheckCircle2 },
  { id: 'preparing', label: 'Preparing', icon: ChefHat },
  { id: 'served', label: 'Served', icon: Utensils },
  { id: 'billed', label: 'Billed', icon: ReceiptText },
];

export default function OrderStatusPage() {
  const params = useParams();
  const orderId = params.order_id as string;
  const [status, setStatus] = useState('placed');
  const [total, setTotal] = useState(0);
  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [requestingBill, setRequestingBill] = useState(false);
  const [billSplits, setBillSplits] = useState<{id:string;label:string;amount:number;status:string}[]>([]);
  
  const isDemo = demoEnvironment && orderId === 'demo-123';

  useEffect(() => {
    let active = true;
    const fetchOrder = async () => {
      try {
        if (isDemo) {
          const saved = JSON.parse(sessionStorage.getItem('demo_order') ?? 'null');
          if (!saved) throw new Error('Demo order not found. Please place an order first.');
          if (active) { setTotal(saved.total); setStatus(saved.status); }
        } else {
          if (demoEnvironment) throw new Error('Order not found.');
          const { data, error } = await supabase.from('orders').select('status,total_amount,session_id,order_type').eq('id', orderId).single();
          if (error || !data) throw new Error('Order not found or your session has expired.');
          if (active) { setStatus(data.status); setTotal(Number(data.total_amount)); setSessionId(data.session_id); }
          const billResult=await supabase.from('bills').select('bill_splits(id,label,amount,status)').eq('order_id',orderId).maybeSingle();
          if(!billResult.error && active)setBillSplits((billResult.data?.bill_splits??[]).map(split=>({...split,amount:Number(split.amount)})));
        }
        if (active) setError('');
      } catch (err) { if (active) setError(err instanceof Error ? err.message : 'Unable to load order'); }
      finally { if (active) setLoading(false); }
    };
    void fetchOrder();
    if (isDemo || demoEnvironment) return () => { active = false; };
    const channel = supabase.channel(`order_status_${orderId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, () => { void fetchOrder(); })
      .subscribe(() => { void fetchOrder(); });
    const timer = setInterval(fetchOrder, 10000);
    return () => { active = false; clearInterval(timer); void supabase.removeChannel(channel); };
  }, [orderId, isDemo]);

  const requestBill = async () => {
    setRequestingBill(true);
    try {
      const { error } = await supabase.rpc('request_service', { p_session: sessionId, p_type: 'request_bill' });
      if (error) throw error;
      alert('Bill requested. Staff will prepare it shortly.');
    } catch (err) { alert(err instanceof Error ? err.message : 'Could not request bill'); }
    finally { setRequestingBill(false); }
  };

  const handlePayment = async (splitId?: string) => {
    if (isPaying || isDemo) return;
    setIsPaying(true);
    try {
      if (!window.Razorpay) throw new Error('Payment checkout is still loading. Please try again.');
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` };
      const res = await fetch('/api/razorpay', { method: 'POST', headers, body: JSON.stringify({ orderId, splitId }) });
      const order = await res.json();
      if (!res.ok) throw new Error(order.error ?? 'Unable to start payment');
      const rzp = new window.Razorpay({
        key: order.key, amount: order.amount, currency: order.currency, name: 'Table Order', order_id: order.id,
        handler: async (response) => {
          try {
            const verification = await fetch('/api/razorpay/verify', { method: 'POST', headers, body: JSON.stringify({ orderId, ...response }) });
            const result = await verification.json();
            if (!verification.ok) throw new Error(result.error ?? 'Payment verification pending');
            window.location.reload();
          } catch (err) { alert(err instanceof Error ? err.message : 'Verification pending. Please contact staff before paying again.'); }
          finally { setIsPaying(false); }
        },
        modal: { ondismiss: () => setIsPaying(false) }
      });
      rzp.on('payment.failed', response => { alert(response.error.description); setIsPaying(false); });
      rzp.open();
    } catch (err) { alert(err instanceof Error ? err.message : 'Unable to start payment'); setIsPaying(false); }
  };

  const currentStepIndex = STATUS_STEPS.findIndex(s => s.id === status);

  if (loading) return <p className="p-8">Loading order…</p>;
  if (error) return <p role="alert" className="p-8 text-red-700">{error}</p>;
  if (status === 'closed') {
    return (
      <div className="min-h-screen bg-emerald-50 flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-emerald-500/30">
          <CheckCircle2 className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-black text-slate-900 mb-2">Thank you!</h1>
        <p className="text-slate-600 font-medium">Your payment was successful and the order is closed.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {!isDemo && <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" onReady={() => setScriptReady(true)} onError={() => setError('Payment checkout failed to load. Please reload or contact staff.')} />}
      
      <header className="bg-white border-b border-slate-200 px-6 py-4 shadow-sm text-center">
        <h1 className="text-xl font-bold text-slate-800">Order Status</h1>
        <p className="text-sm text-slate-500 font-medium">#{orderId.substring(0,8)}</p>
      </header>

      <main className="flex-1 max-w-md w-full mx-auto p-6 flex flex-col justify-center">
        {isDemo && <p className="mb-4 text-orange-700">Demo order preview. No order or payment has been sent.</p>}
        <div className="bg-white rounded-3xl p-8 shadow-xl shadow-slate-200/50 border border-slate-100">
          
          <div className="text-center mb-10">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">
              {status === 'placed' && 'We got your order!'}
              {status === 'pending_payment' && 'Complete payment to place your order'}
              {status === 'accepted' && 'Order Accepted!'}
              {status === 'preparing' && 'Cooking now...'}
              {status === 'served' && 'Enjoy your meal!'}
              {status === 'billed' && 'Please pay the bill.'}
            </h2>
            <p className="text-slate-500 mt-2 font-medium text-lg">Amount: ₹{total}</p>
          </div>

          <div className="space-y-8 relative before:absolute before:inset-0 before:ml-[1.1rem] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-slate-200 before:via-slate-200 before:to-transparent">
            {STATUS_STEPS.map((step, idx) => {
              const isCompleted = idx <= currentStepIndex;
              const isCurrent = idx === currentStepIndex;
              const Icon = step.icon;
              
              return (
                <div key={step.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className={`flex items-center justify-center w-9 h-9 rounded-full border-4 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 ${isCompleted ? 'bg-orange-500 border-white text-white' : 'bg-slate-100 border-white text-slate-400'}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="w-[calc(100%-3rem)] md:w-[calc(50%-2.5rem)] px-4">
                    <div className="flex flex-col">
                      <span className={`font-bold ${isCurrent ? 'text-orange-600 text-lg' : isCompleted ? 'text-slate-800' : 'text-slate-400'}`}>{step.label}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {status === 'served' && !isDemo && (
            <button onClick={requestBill} disabled={requestingBill} className="mt-12 w-full bg-slate-900 text-white font-bold text-lg py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20">
              Request Bill
            </button>
          )}

          {(status === 'billed' || status === 'pending_payment') && billSplits.length <= 1 && (
            <button 
              onClick={() => handlePayment()}
              disabled={isPaying || !scriptReady || isDemo}
              className="mt-12 w-full bg-emerald-600 text-white font-bold text-lg py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/30 disabled:bg-emerald-400"
            >
              {isPaying ? 'Processing...' : 'Pay Online'}
            </button>
          )}
          {status === 'billed' && billSplits.length > 1 && <div className="mt-10 space-y-3"><p className="text-center font-bold">Pay your part</p>{billSplits.map(split=><button key={split.id} onClick={()=>split.status==='unpaid'&&handlePayment(split.id)} disabled={isPaying||split.status!=='unpaid'||!scriptReady} className="flex w-full justify-between rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white disabled:bg-slate-300"><span>{split.label}</span><span>{split.status==='paid'?'Paid':`₹${split.amount}`}</span></button>)}</div>}

        </div>
      </main>
    </div>
  );
}
