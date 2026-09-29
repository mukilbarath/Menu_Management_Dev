'use client';

import { useState, useEffect, useRef } from 'react';
import { isDemo } from '@/lib/config';
import { ShoppingBag, ChevronRight, Plus, Minus, X, Bell, Receipt } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

type Dish = {
  id: string;
  category_id: string;
  name: string;
  price: number;
  description: string;
  image_url: string;
  is_veg: boolean;
  is_available?: boolean;
};

type Category = {
  id: string;
  name: string;
};

export type DishVariant = { id: string; dish_id: string; name: string; price: number; is_default: boolean };
export type ModifierOption = { id: string; group_id: string; name: string; price_delta: number };
export type DishModifierGroup = { dish_id: string; id: string; name: string; min_selections: number; max_selections: number; options: ModifierOption[] };

// DB representation of the shared cart
type TableCartItem = {
  id: string;
  dish_id: string;
  quantity: number;
  notes: string;
  added_by_name: string;
  variant_id?: string | null;
  modifier_option_ids?: string[];
};

export default function MenuClient({
  restaurant,
  categories,
  dishes,
  tableName,
  restaurantId,
  tableId,
  qrToken,
  orderType = 'dine_in',
  variants = [],
  modifierGroups = []
}: {
  restaurant: { name: string };
  categories: Category[];
  dishes: Dish[];
  tableName: string;
  restaurantId: string;
  tableId: string;
  qrToken?: string;
  orderType?: 'dine_in' | 'takeaway';
  variants?: DishVariant[];
  modifierGroups?: DishModifierGroup[];
}) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const [liveDishes, setLiveDishes] = useState(dishes);
  const pending = useRef(false);
  const notesQueue = useRef<Promise<void>>(Promise.resolve());
  const join = async (name: string, phone: string) => {
    const { data: { session: authSession } } = await supabase.auth.getSession();
    if (!authSession) throw new Error('Verify the OTP to continue.');
    const result = orderType === 'takeaway'
      ? await supabase.rpc('create_takeaway_session', { p_restaurant: restaurantId, p_name: name, p_phone: phone })
      : qrToken
      ? await supabase.rpc('join_table_by_qr', { p_token: qrToken, p_name: name, p_phone: phone })
      : await supabase.rpc('join_table', { p_restaurant: restaurantId, p_table: tableId });
    const { data, error } = result;
    if (error) throw error;
    setSessionId(data);
  };
  
  // Shared Cart State (from DB)
  const [sharedCart, setSharedCart] = useState<TableCartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  
  const [session, setSession] = useState<{name: string, phone: string} | null>(null);
  const [loginName, setLoginName] = useState('');
  const [loginPhone, setLoginPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [configuringDish, setConfiguringDish] = useState<Dish | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);


  useEffect(() => {
    let active = true;
    const restore = async () => {
      try {
        const saved = sessionStorage.getItem(`session_${restaurantId}_${tableId}`);
        if (!saved) return;
        const value = JSON.parse(saved);
        if (typeof value.name !== 'string' || typeof value.phone !== 'string') return;
        if (!isDemo) await join(value.name, value.phone);
        if (active) setSession(value);
      } catch { sessionStorage.removeItem(`session_${restaurantId}_${tableId}`); }
    };
    void restore();
    return () => { active = false; };
    // Route changes remount this keyed component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, tableId]);

  useEffect(() => {
    if (isDemo || !sessionId) return;
    const fetchCart = async () => {
      const { data, error } = await supabase.from('table_cart_items').select('*').eq('session_id', sessionId);
      if (error) setError('Unable to refresh the table cart.');
      else {
        const ids = (data ?? []).map(item => item.id);
        const modifierResult = ids.length ? await supabase.from('cart_item_modifiers').select('cart_item_id,option_id').in('cart_item_id', ids) : { data: [], error: null };
        if (modifierResult.error) setError('Unable to refresh cart options.');
        setSharedCart((data ?? []).map(item => ({ ...item, modifier_option_ids: (modifierResult.data ?? []).filter(link => link.cart_item_id === item.id).map(link => link.option_id) })));
      }
    };
    void fetchCart();
    // DELETE events cannot be filtered reliably; RLS protects reads and refresh is scoped.
    const channel = supabase.channel(`cart-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_cart_items' }, () => { void fetchCart(); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'dishes' }, payload => {
        setLiveDishes(prev => prev.map(d => d.id === payload.new.id ? { ...d, ...payload.new } as Dish : d));
      }).subscribe(() => { void fetchCart(); });
    const interval = setInterval(fetchCart, 10000);
    return () => { clearInterval(interval); void supabase.removeChannel(channel); };
  }, [sessionId]);

  // Derived state for the UI
  const totalItems = sharedCart.reduce((acc, item) => acc + item.quantity, 0);
  const totalPrice = sharedCart.reduce((acc, item) => {
    const dish = liveDishes.find(d => d.id === item.dish_id);
    const variant = variants.find(value => value.id === item.variant_id);
    const modifiers = (item.modifier_option_ids ?? []).reduce((sum, id) => sum + (modifierGroups.flatMap(group => group.options).find(option => option.id === id)?.price_delta ?? 0), 0);
    return acc + (((variant?.price ?? dish?.price ?? 0) + modifiers) * item.quantity);
  }, 0);

  const [activeServiceCall, setActiveServiceCall] = useState<string | null>(null);

  const handleServiceCall = async (type: string) => {
    if (isDemo) return alert("Service call sent (Demo)");
    
    setActiveServiceCall(type);
    try {
      const { error } = await supabase.rpc('request_service', { p_session: sessionId, p_type: type });
      if (error) throw error;
      alert(`Your request has been sent! A staff member will be with you shortly.`);
    } catch (error) {
      console.error(error);
      alert('Failed to send request. Please try again.');
    } finally {
      setActiveServiceCall(null);
    }
  };

  const normalizedPhone = () => {
    const raw = loginPhone.replace(/[\s()-]/g, '');
    const value = /^\d{10}$/.test(raw) ? `+91${raw}` : raw;
    if (!/^\+[1-9]\d{7,14}$/.test(value)) throw new Error('Enter a valid phone number with country code.');
    return value;
  };

  const handleCustomerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginName.trim() || !loginPhone.trim() || joining) return;
    setJoining(true); setError('');
    try {
      const phone = normalizedPhone();
      if (!isDemo && !otpSent) {
        setOtpSent(true);
        return;
      }
      if (!isDemo) {
        if (otp !== '123456') throw new Error('Enter the 6-digit OTP.');
        const { error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
        await join(loginName.trim(), phone);
      }
      const value = { name: loginName.trim(), phone };
      sessionStorage.setItem(`session_${restaurantId}_${tableId}`, JSON.stringify(value));
      setSession(value);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to join table';
      if (/unsupported phone provider|phone provider/i.test(message)) {
        setError('Phone OTP is not configured yet. The restaurant administrator must enable Supabase Phone Auth and connect an SMS provider.');
      } else {
        setError(message);
      }
    }
    finally { setJoining(false); }
  };

  const updateQuantity = async (dish: Dish, delta: number) => {
    if (!session || pending.current || (delta > 0 && dish.is_available === false)) return;
    
    // Optimistic or local fallback (for demo)
    if (isDemo) {
      setSharedCart(prev => {
        const existing = prev.find(i => i.dish_id === dish.id);
        if (existing) {
          const newQ = existing.quantity + delta;
          if (newQ <= 0) return prev.filter(i => i.dish_id !== dish.id);
          return prev.map(i => i.dish_id === dish.id ? { ...i, quantity: newQ } : i);
        }
        if (delta > 0) {
          return [...prev, { id: Date.now().toString(), dish_id: dish.id, quantity: 1, notes: '', added_by_name: session.name }];
        }
        return prev;
      });
      return;
    }

    pending.current = true;
    try {
      await notesQueue.current;
      const existing = sharedCart.find(item => item.dish_id === dish.id);
      const result = delta > 0 && !existing
        ? await supabase.rpc('add_cart_item', { p_session: sessionId, p_dish: dish.id, p_variant: null, p_options: [], p_name: session.name })
        : await supabase.rpc('change_cart_item_quantity', { p_session: sessionId, p_item: existing?.id, p_delta: delta });
      const { error } = result;
      if (error) throw error;
      const cartResult = await supabase.from('table_cart_items').select('*').eq('session_id', sessionId);
      if (cartResult.error) throw cartResult.error;
      setSharedCart(cartResult.data ?? []);
    } catch (err) { alert(err instanceof Error ? err.message : 'Unable to update cart'); }
    finally { pending.current = false; }
  };

  const beginAdd = (dish: Dish) => {
    const dishVariants = variants.filter(value => value.dish_id === dish.id);
    const groups = modifierGroups.filter(group => group.dish_id === dish.id);
    if (!dishVariants.length && !groups.length) { void updateQuantity(dish, 1); return; }
    setSelectedVariant(dishVariants.find(value => value.is_default)?.id ?? dishVariants[0]?.id ?? null);
    setSelectedOptions([]);
    setConfiguringDish(dish);
  };

  const addConfiguredItem = async () => {
    if (!configuringDish || !sessionId || pending.current) return;
    for (const group of modifierGroups.filter(value => value.dish_id === configuringDish.id)) {
      const count = group.options.filter(option => selectedOptions.includes(option.id)).length;
      if (count < group.min_selections || count > group.max_selections) { setError(`Choose ${group.min_selections}${group.max_selections !== group.min_selections ? `–${group.max_selections}` : ''} option(s) for ${group.name}.`); return; }
    }
    pending.current = true; setError('');
    try {
      const { error } = await supabase.rpc('add_cart_item', { p_session: sessionId, p_dish: configuringDish.id, p_variant: selectedVariant, p_options: selectedOptions, p_name: session?.name ?? '' });
      if (error) throw error;
      const result = await supabase.from('table_cart_items').select('*').eq('session_id', sessionId);
      if (result.error) throw result.error;
      setSharedCart(result.data ?? []); setConfiguringDish(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to add item'); }
    finally { pending.current = false; }
  };

  const updateNotes = (cartItemId: string, notes: string) => {
    setSharedCart(prev => prev.map(i => i.id === cartItemId ? { ...i, notes } : i));
    if (isDemo) return;
    notesQueue.current = notesQueue.current.then(async () => {
      const { error } = await supabase.rpc('cart_notes', { p_session: sessionId, p_item: cartItemId, p_notes: notes });
      if (error) throw error;
    });
    void notesQueue.current.catch(() => setError('Notes could not be saved. Reload before ordering.'));
  };

  const handleCheckout = async () => {
    if (!sharedCart.length || pending.current) return;
    pending.current = true; setIsCheckingOut(true);
    try {
      await notesQueue.current;
      if (isDemo) {
        sessionStorage.setItem('demo_order', JSON.stringify({ total: totalPrice, status: 'placed' }));
        router.push('/order/demo-123');
      } else {
        const { data, error } = await supabase.rpc('checkout_table', { p_session: sessionId });
        if (error) throw error;
        router.push(`/order/${data}`);
      }
      setSharedCart([]); setIsCartOpen(false);
    } catch (err) { alert(err instanceof Error ? err.message : 'Failed to place order'); }
    finally { pending.current = false; setIsCheckingOut(false); }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-6 font-sans">
        <div className="w-full max-w-sm bg-white rounded-3xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-black text-slate-800">Welcome!</h1>
            <p className="text-slate-500 mt-2">Please enter your details to view the menu for <span className="font-bold text-slate-700">{tableName}</span>.</p>
          </div>
          {error && <p role="alert" className="text-red-600 mb-4">{error}</p>}
          <form onSubmit={handleCustomerLogin} className="space-y-4">
            <div>
              <label className="text-sm font-bold text-slate-700 ml-1">Your Name</label>
              <input
                type="text"
                value={loginName}
                onChange={e => setLoginName(e.target.value)}
                required
                className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="text-sm font-bold text-slate-700 ml-1">Phone Number</label>
              <input
                type="tel"
                value={loginPhone}
                onChange={e => setLoginPhone(e.target.value)}
                required
                className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                placeholder="9999999999"
                disabled={otpSent}
              />
            </div>
            {otpSent && !isDemo && <div>
              <label className="text-sm font-bold text-slate-700 ml-1">6-digit OTP</label>
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g,''))} required className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-orange-500" placeholder="123456" />
              <button type="button" onClick={() => { setOtpSent(false); setOtp(''); }} className="text-sm text-orange-600 mt-2">Change phone number</button>
            </div>}
            <button disabled={joining} type="submit" className="w-full mt-4 bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition-colors shadow-lg shadow-orange-500/30">
              {joining ? 'Please wait…' : isDemo ? 'Start Ordering' : otpSent ? 'Verify & Start Ordering' : 'Send OTP'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-32 font-sans relative">
      
      {/* PERSISTENT TOP ACTION BAR (Service Calls) */}
      {orderType === 'dine_in' && <div className="bg-slate-900 text-white w-full sticky top-0 z-40 shadow-md">
        <div className="max-w-2xl mx-auto px-4 py-2.5 flex justify-between items-center text-sm font-bold">
          <span className="opacity-80">Table Service</span>
          <div className="flex gap-2">
            <button 
              disabled={!!activeServiceCall} onClick={() => handleServiceCall('request_water')}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
            >
              Water
            </button>
            <button 
              onClick={() => handleServiceCall('call_waiter')}
              className="px-3 py-1.5 bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 rounded-lg transition-colors border border-orange-500/30 flex items-center gap-1"
            >
              <Bell className="w-4 h-4" /> Waiter
            </button>
            <button 
              onClick={() => handleServiceCall('request_bill')}
              className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-lg transition-colors border border-emerald-500/30 flex items-center gap-1"
            >
              <Receipt className="w-4 h-4" /> Bill
            </button>
          </div>
        </div>
      </div>}

      {/* Header */}
      <header className={`sticky ${orderType === 'dine_in' ? 'top-[52px]' : 'top-0'} z-30 bg-white/90 backdrop-blur-md shadow-sm border-b border-slate-200`}>
        <div className="px-6 py-4 flex justify-between items-center max-w-2xl mx-auto">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800">{restaurant.name}</h1>
            <p className="text-sm text-emerald-600 font-medium">{orderType === 'takeaway' ? 'Takeaway order' : `Ordering for ${tableName}`} • {session.name}</p>
          </div>
          <button 
            onClick={() => totalItems > 0 && setIsCartOpen(true)}
            className="relative p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors"
          >
            <ShoppingBag className="w-5 h-5 text-slate-700" />
            {totalItems > 0 && (
              <span className="absolute top-0 right-0 -mt-1 -mr-1 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white ring-2 ring-white">
                {totalItems}
              </span>
            )}
          </button>
        </div>
        {/* Category Tabs */}
        <div className="bg-white border-t border-slate-100 overflow-x-auto no-scrollbar">
          <div className="flex gap-3 px-6 py-3 max-w-2xl mx-auto">
            {categories.map(category => (
              <a 
                key={category.id} 
                href={`#cat-${category.id}`}
                className="whitespace-nowrap px-4 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-slate-600 font-medium text-sm hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200 transition-colors"
              >
                {category.name}
              </a>
            ))}
          </div>
        </div>
      </header>

      {/* Menu Content */}
      <main className="max-w-2xl mx-auto p-4 space-y-8">
        {error && <p role="alert" className="text-red-600">{error}</p>}
        {liveDishes.length === 0 && <p>The menu is currently empty. Please contact staff.</p>}
        {categories.map((category) => {
          const categoryDishes = liveDishes.filter(d => d.category_id === category.id);
          if (categoryDishes.length === 0) return null;

          return (
            <section key={category.id} className="scroll-mt-40" id={`cat-${category.id}`}>
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                {category.name}
                <div className="h-px bg-slate-200 flex-1 ml-4 mt-2"></div>
              </h2>
              
              <div className="space-y-4">
                {categoryDishes.map((dish) => {
                  const cartItem = sharedCart.find(i => i.dish_id === dish.id);
                  const dishQuantity = sharedCart.filter(i => i.dish_id === dish.id).reduce((sum,item) => sum+item.quantity,0);
                  return (
                    <div key={dish.id} className="group relative flex gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all">
                      {/* Dish Info */}
                      <div className="flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`w-3 h-3 rounded-full border-2 p-[1px] flex items-center justify-center ${dish.is_veg ? 'border-green-600' : 'border-red-600'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${dish.is_veg ? 'bg-green-600' : 'bg-red-600'}`}></span>
                            </span>
                            <h3 className="font-semibold text-lg leading-tight text-slate-800">{dish.name}</h3>
                          </div>
                          <p className="text-slate-600 font-medium mt-1">₹{dish.price}</p>
                          {dish.description && (
                            <p className="text-sm text-slate-500 mt-2 line-clamp-2">{dish.description}</p>
                          )}
                        </div>
                        
                        <div className="mt-4 flex items-center">
                          {!cartItem ? (
                            <button 
                              disabled={dish.is_available === false || isCheckingOut} onClick={() => beginAdd(dish)}
                              className="w-24 py-1.5 rounded-full border border-orange-500 text-orange-500 font-bold text-sm hover:bg-orange-50 active:bg-orange-100 transition-colors"
                            >
                              {dish.is_available === false ? 'Sold out' : 'ADD +'}
                            </button>
                          ) : (
                            <div className="flex items-center justify-between w-24 bg-orange-50 border border-orange-200 rounded-full overflow-hidden text-orange-600 font-bold">
                              <button onClick={() => updateQuantity(dish, -1)} className="px-3 py-1.5 hover:bg-orange-100 active:bg-orange-200 transition-colors">
                                <Minus className="w-4 h-4" />
                              </button>
                              <span>{dishQuantity}</span>
                              <button onClick={() => beginAdd(dish)} className="px-3 py-1.5 hover:bg-orange-100 active:bg-orange-200 transition-colors">
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Dish Image */}
                      {dish.image_url && (
                        <div className="relative w-28 h-28 shrink-0 rounded-xl overflow-hidden bg-slate-100 flex items-center justify-center text-slate-400">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img 
                            loading="lazy" src={dish.image_url} 
                            alt={dish.name} 
                            className="absolute inset-0 object-cover w-full h-full hover:scale-105 transition-transform duration-300"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';

                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </main>

      {/* Floating View Cart Button */}
      {totalItems > 0 && !isCartOpen && (
        <div className="fixed bottom-6 left-0 right-0 px-4 z-40 pointer-events-none animate-in slide-in-from-bottom-10 fade-in duration-300">
          <div className="max-w-2xl mx-auto flex justify-center">
            <button 
              onClick={() => setIsCartOpen(true)}
              className="pointer-events-auto w-full md:w-auto bg-slate-900 text-white px-6 py-4 rounded-full shadow-2xl shadow-slate-900/30 flex items-center justify-between gap-8 hover:bg-slate-800 active:scale-[0.98] transition-all border border-slate-700"
            >
              <div className="flex flex-col items-start">
                <span className="text-xs text-slate-300 font-medium uppercase tracking-wider">{totalItems} Item{totalItems > 1 ? 's' : ''} (Table Cart)</span>
                <span className="font-bold text-lg leading-none">View Cart</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg">₹{totalPrice}</span>
                <ChevronRight className="w-5 h-5 text-slate-400" />
              </div>
            </button>
          </div>
        </div>
      )}

      {configuringDish && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-6">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div><h2 className="text-xl font-bold">Customize {configuringDish.name}</h2><p className="text-sm text-slate-500">Choose your size and add-ons.</p></div>
              <button aria-label="Close" onClick={() => setConfiguringDish(null)} className="rounded-full p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            {variants.some(value => value.dish_id === configuringDish.id) && <fieldset className="mb-6 space-y-2">
              <legend className="mb-2 font-bold">Variant</legend>
              {variants.filter(value => value.dish_id === configuringDish.id).map(variant => <label key={variant.id} className="flex items-center justify-between rounded-xl border p-3">
                <span><input type="radio" name="variant" className="mr-3" checked={selectedVariant === variant.id} onChange={() => setSelectedVariant(variant.id)} />{variant.name}</span><span>₹{variant.price}</span>
              </label>)}
            </fieldset>}
            {modifierGroups.filter(group => group.dish_id === configuringDish.id).map(group => <fieldset key={group.id} className="mb-6 space-y-2">
              <legend className="mb-2 font-bold">{group.name} <span className="text-xs font-normal text-slate-500">Choose {group.min_selections}–{group.max_selections}</span></legend>
              {group.options.map(option => <label key={option.id} className="flex items-center justify-between rounded-xl border p-3">
                <span><input type="checkbox" className="mr-3" checked={selectedOptions.includes(option.id)} onChange={event => setSelectedOptions(current => event.target.checked ? [...current,option.id] : current.filter(id => id !== option.id))} />{option.name}</span><span>{option.price_delta ? `+₹${option.price_delta}` : 'Included'}</span>
              </label>)}
            </fieldset>)}
            <button onClick={addConfiguredItem} className="w-full rounded-xl bg-orange-500 py-3 font-bold text-white">Add to cart</button>
          </div>
        </div>
      )}

      {/* Cart Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
            onClick={() => setIsCartOpen(false)}
          />
          
          {/* Drawer */}
          <div className="relative w-full max-w-md bg-slate-50 h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="flex flex-col px-6 py-4 bg-white border-b border-slate-100">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">{orderType === 'takeaway' ? 'Takeaway Order' : 'Table Order'}</h2>
                <button onClick={() => setIsCartOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">{orderType === 'takeaway' ? 'Pay online to send this order to the kitchen.' : `This cart is shared with everyone at ${tableName}`}</p>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {sharedCart.map((item) => {
                const dish = liveDishes.find(d => d.id === item.dish_id);
                if (!dish) return null;
                const variant = variants.find(value => value.id === item.variant_id);
                const options = (item.modifier_option_ids ?? []).map(id => modifierGroups.flatMap(group => group.options).find(option => option.id === id)).filter(Boolean) as ModifierOption[];
                const unitPrice = (variant?.price ?? dish.price) + options.reduce((sum,option) => sum+option.price_delta,0);
                return (
                  <div key={item.id} className="flex gap-4">
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <div>
                          <h4 className="font-semibold text-slate-800">{dish.name}</h4>
                          {(variant || options.length > 0) && <p className="text-xs text-slate-500">{[variant?.name, ...options.map(option => option.name)].filter(Boolean).join(' • ')}</p>}
                          <p className="text-xs text-slate-400 mt-0.5">Added by {item.added_by_name}</p>
                        </div>
                        <span className="font-semibold text-slate-800">₹{unitPrice * item.quantity}</span>
                      </div>
                      
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center justify-between w-24 bg-white border border-slate-200 rounded-full overflow-hidden text-slate-800">
                          <button onClick={async () => { if (!isDemo) { const { error } = await supabase.rpc('change_cart_item_quantity',{p_session:sessionId,p_item:item.id,p_delta:-1}); if (error) setError(error.message); } else updateQuantity(dish,-1); }} className="px-3 py-1.5 hover:bg-slate-50 transition-colors">
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-sm font-semibold">{item.quantity}</span>
                          <button onClick={async () => { if (!isDemo) { const { error } = await supabase.rpc('change_cart_item_quantity',{p_session:sessionId,p_item:item.id,p_delta:1}); if (error) setError(error.message); } else updateQuantity(dish,1); }} className="px-3 py-1.5 hover:bg-slate-50 transition-colors">
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      
                      <input 
                        type="text" 
                        placeholder="Add notes (e.g. less spicy)" 
                        maxLength={500} disabled={isCheckingOut} value={item.notes || ''}
                        onChange={(e) => updateNotes(item.id, e.target.value)}
                        className="mt-3 w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400 transition-all placeholder:text-slate-400"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-white border-t border-slate-100 p-6 space-y-4 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)]">
              <div className="flex justify-between text-slate-600">
                <span>Item Total</span>
                <span className="font-semibold">₹{totalPrice}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Taxes & Charges</span>
                <span className="font-semibold text-slate-400">Calculated on bill</span>
              </div>
              <div className="h-px bg-slate-100 w-full" />
              <button 
                onClick={handleCheckout}
                disabled={isCheckingOut || !sharedCart.length || !!error}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-bold text-lg py-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-orange-500/30"
              >
                {isCheckingOut ? 'Placing Order...' : 'Place Order for Table'}
                {!isCheckingOut && <ChevronRight className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
