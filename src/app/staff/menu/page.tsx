'use client';

import { useState, useEffect, useRef } from 'react';
import { isDemo } from '@/lib/config';
import { supabase } from '@/lib/supabase';
import { ChefHat, Utensils, ReceiptText, QrCode, UploadCloud, ImageIcon, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { getStaff } from '@/lib/staff';

export default function MenuManagement() {
  const [isUploading, setIsUploading] = useState(false);
  const [dishName, setDishName] = useState('');
  const [dishPrice, setDishPrice] = useState('');
  const [dishDescription, setDishDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [categories, setCategories] = useState<{id:string;name:string}[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [menu, setMenu] = useState<{id:string;name:string;is_available:boolean;price:number}[]>([]);
  const [categoryName, setCategoryName] = useState('');
  const [selectedDish, setSelectedDish] = useState('');
  const [variantName, setVariantName] = useState('');
  const [variantPrice, setVariantPrice] = useState('');
  const [groups, setGroups] = useState<{id:string;name:string}[]>([]);
  const [groupName, setGroupName] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [optionName, setOptionName] = useState('');
  const [optionPrice, setOptionPrice] = useState('0');
  const [dietaryType, setDietaryType] = useState('veg');
  const [ingredients, setIngredients] = useState('');
  const [allergens, setAllergens] = useState('');
  const [stockQuantity, setStockQuantity] = useState('');
  const [availableFrom, setAvailableFrom] = useState('');
  const [availableUntil, setAvailableUntil] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const refresh = async () => {
    if (isDemo) return;
    const staff = await getStaff();
    const result = await supabase.from('categories').select('id,name').eq('restaurant_id',staff.restaurant_id).order('sort_order');
    if (result.error) throw result.error;
    setCategories(result.data ?? []);
    if (result.data?.length) {
      const dishes = await supabase.from('dishes').select('id,name,is_available,price').in('category_id',result.data.map(c=>c.id));
      if (dishes.error) throw dishes.error;
      setMenu(dishes.data ?? []);
    }
    const groupResult=await supabase.from('modifier_groups').select('id,name').eq('restaurant_id',staff.restaurant_id).order('sort_order');
    if(groupResult.error)throw groupResult.error; setGroups(groupResult.data??[]);
  };

  const addCategory = async (event: React.FormEvent) => { event.preventDefault(); try { const staff=await getStaff(); const {error}=await supabase.from('categories').insert({restaurant_id:staff.restaurant_id,name:categoryName.trim()}); if(error)throw error; setCategoryName(''); await refresh(); } catch(err){alert(err instanceof Error?err.message:'Unable to add category');} };
  const addVariant = async (event: React.FormEvent) => { event.preventDefault(); const price=Number(variantPrice); if(!selectedDish||!variantName.trim()||!Number.isFinite(price)||price<0)return; const {error}=await supabase.from('dish_variants').insert({dish_id:selectedDish,name:variantName.trim(),price}); if(error)alert(error.message); else {setVariantName('');setVariantPrice('');} };
  const addGroup = async (event: React.FormEvent) => { event.preventDefault(); try{const staff=await getStaff();const {data,error}=await supabase.from('modifier_groups').insert({restaurant_id:staff.restaurant_id,name:groupName.trim()}).select('id').single();if(error)throw error;setGroupName('');setSelectedGroup(data.id);await refresh();}catch(err){alert(err instanceof Error?err.message:'Unable to add group');} };
  const addOption = async (event: React.FormEvent) => { event.preventDefault(); if(!selectedDish||!selectedGroup||!optionName.trim())return; const price=Number(optionPrice); const option=await supabase.from('modifier_options').insert({group_id:selectedGroup,name:optionName.trim(),price_delta:price}); if(option.error)return alert(option.error.message); const link=await supabase.from('dish_modifier_groups').upsert({dish_id:selectedDish,group_id:selectedGroup}); if(link.error)return alert(link.error.message); setOptionName('');setOptionPrice('0'); };
  useEffect(() => {
    // This loads an external data source; state changes occur after awaited network calls.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch(err=>alert(err.message));
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUploading(true);

    try {
          
      if (isDemo) throw new Error('Connect Supabase to save dishes. Demo data is read-only.');
      if (!dishName.trim() || !categoryId || !Number.isFinite(Number(dishPrice)) || Number(dishPrice)<0) throw new Error('Enter a name, category and valid price.');
      if (file && (file.size > 5*1024*1024 || !['image/jpeg','image/png','image/webp'].includes(file.type))) throw new Error('Use a JPEG, PNG or WEBP image up to 5 MB.');
      const staff = await getStaff();
      let imageUrl: string | null = null;
      
      if (!isDemo && file) {
        // Upload to Supabase Storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${staff.restaurant_id}/${crypto.randomUUID()}.${fileExt}`;
        const { error } = await supabase.storage
          .from('menu-images')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false
          });
          
        if (error) throw error;
        
        const { data: { publicUrl } } = supabase.storage.from('menu-images').getPublicUrl(fileName);
        imageUrl = publicUrl;
      } else if (isDemo) {
        // Mock upload delay
        await new Promise(r => setTimeout(r, 1500));
      }

      const stock = stockQuantity === '' ? null : Number(stockQuantity);
      if (stock !== null && (!Number.isInteger(stock) || stock < 0)) throw new Error('Stock must be a whole number of zero or more.');
      const { error } = await supabase.from('dishes').insert({ name: dishName.trim(), price: Number(dishPrice), description: dishDescription.trim(), image_url: imageUrl, category_id: categoryId, is_veg: dietaryType === 'veg' || dietaryType === 'vegan', dietary_type: dietaryType, ingredients: ingredients.split(',').map(value=>value.trim()).filter(Boolean), allergens: allergens.split(',').map(value=>value.trim()).filter(Boolean), stock_tracking: stock !== null, stock_quantity: stock, available_from: availableFrom || null, available_until: availableUntil || null });
      if (error) throw error;
      await refresh();
      if (fileInput.current) fileInput.current.value='';

      alert('Dish added successfully! ' + (isDemo ? '(Demo Mode)' : ''));
      setDishName('');
      setDishPrice('');
      setDishDescription('');
      setIngredients(''); setAllergens(''); setStockQuantity(''); setAvailableFrom(''); setAvailableUntil('');
      setFile(null);
      
    } catch (err: unknown) {
      console.error(err);
      alert('Failed to add dish: ' + (err instanceof Error ? err.message : 'Request failed'));
    } finally {
      setIsUploading(false);
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
          <Link href="/staff/tables" className="flex items-center gap-3 text-slate-400 hover:text-slate-200 hover:bg-slate-800 px-4 py-3 rounded-xl font-medium transition-colors">
            <QrCode className="w-5 h-5" />
            Tables & QR
          </Link>
          <Link href="/staff/menu" className="flex items-center gap-3 text-slate-200 bg-slate-800 px-4 py-3 rounded-xl font-medium">
            <ChefHat className="w-5 h-5" />
            Menu Management
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
          <h2 className="text-3xl font-bold text-slate-800">Menu Management</h2>
          <p className="text-slate-500 mt-1">Add dishes, upload photos and manage availability</p>
        </header>

        <div className="max-w-2xl bg-white rounded-3xl shadow-sm border border-slate-200 p-8">
          <form onSubmit={addCategory} className="mb-6 flex gap-2 border-b pb-6"><input value={categoryName} onChange={e=>setCategoryName(e.target.value)} required maxLength={80} placeholder="New category name" className="flex-1 rounded-xl border p-3"/><button className="rounded-xl bg-slate-900 px-4 font-bold text-white">Add category</button></form>
          <form onSubmit={handleUpload} className="space-y-6">
            <label className="block">Category<select required value={categoryId} onChange={e=>setCategoryId(e.target.value)} className="block w-full border rounded-xl p-3"><option value="">Select category</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            {!categories.length && <p>Create categories through <Link className="underline" href="/staff/menu/import">CSV import</Link> before adding a dish.</p>}
            <label className="block">Dietary type<select value={dietaryType} onChange={e=>setDietaryType(e.target.value)} className="mt-1 block w-full rounded-xl border p-3"><option value="veg">Vegetarian</option><option value="non_veg">Non-vegetarian</option><option value="egg">Contains egg</option><option value="vegan">Vegan</option></select></label>
            
            <div className="grid grid-cols-2 gap-6">
              <div className="col-span-2 md:col-span-1 space-y-2">
                <label className="text-sm font-bold text-slate-700 ml-1">Dish Name</label>
                <input
                  type="text"
                  value={dishName}
                  onChange={(e) => setDishName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                  required
                />
              </div>
              <div className="col-span-2 md:col-span-1 space-y-2">
                <label className="text-sm font-bold text-slate-700 ml-1">Price (₹)</label>
                <input
                  type="number" min="0" max="99999999.99" step="0.01"
                  value={dishPrice}
                  onChange={(e) => setDishPrice(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 ml-1">Description</label>
              <textarea
                value={dishDescription}
                onChange={(e) => setDishDescription(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 h-24 resize-none"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">Ingredients, comma separated<input value={ingredients} onChange={e=>setIngredients(e.target.value)} className="mt-1 w-full rounded-xl border p-3"/></label><label className="text-sm font-bold">Allergens, comma separated<input value={allergens} onChange={e=>setAllergens(e.target.value)} className="mt-1 w-full rounded-xl border p-3"/></label><label className="text-sm font-bold">Stock quantity (blank = unlimited)<input type="number" min="0" step="1" value={stockQuantity} onChange={e=>setStockQuantity(e.target.value)} className="mt-1 w-full rounded-xl border p-3"/></label><div className="grid grid-cols-2 gap-2"><label className="text-sm font-bold">From<input type="time" value={availableFrom} onChange={e=>setAvailableFrom(e.target.value)} className="mt-1 w-full rounded-xl border p-3"/></label><label className="text-sm font-bold">Until<input type="time" value={availableUntil} onChange={e=>setAvailableUntil(e.target.value)} className="mt-1 w-full rounded-xl border p-3"/></label></div></div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 ml-1">Dish Photo</label>
              <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-slate-300 border-dashed rounded-2xl cursor-pointer hover:bg-slate-50 hover:border-orange-500 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  {file ? (
                    <>
                      <ImageIcon className="w-10 h-10 text-orange-500 mb-3" />
                      <p className="text-sm text-slate-700 font-medium">{file.name}</p>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-10 h-10 text-slate-400 mb-3" />
                      <p className="text-sm text-slate-600 font-medium"><span className="text-orange-500">Click to upload</span> </p>
                      <p className="text-xs text-slate-400 mt-1">PNG, JPG or WEBP (Max. 5MB)</p>
                    </>
                  )}
                </div>
                <input 
                  type="file" 
                  className="hidden" 
                  ref={fileInput} accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
                />
              </label>
            </div>

            <button 
              type="submit" 
              disabled={isUploading}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-400 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-orange-500/30"
            >
              {isUploading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Saving Dish & Uploading Photo...</>
              ) : 'Save Dish'}
            </button>
          </form>
        </div>
        <section className="mt-8 max-w-2xl rounded-3xl border border-slate-200 bg-white p-8">
          <h3 className="text-xl font-bold">Variants and add-ons</h3><p className="mb-5 text-sm text-slate-500">Create sizes or variants, then attach reusable add-on groups to a dish.</p>
          <label className="block text-sm font-bold">Dish<select value={selectedDish} onChange={e=>setSelectedDish(e.target.value)} className="mt-1 w-full rounded-xl border p-3"><option value="">Select dish</option>{menu.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
          <form onSubmit={addVariant} className="mt-4 grid grid-cols-[1fr_8rem_auto] gap-2"><input value={variantName} onChange={e=>setVariantName(e.target.value)} required placeholder="Variant, e.g. Large" className="rounded-xl border p-3"/><input type="number" min="0" step="0.01" value={variantPrice} onChange={e=>setVariantPrice(e.target.value)} required placeholder="Price" className="rounded-xl border p-3"/><button className="rounded-xl bg-orange-500 px-4 font-bold text-white">Add</button></form>
          <form onSubmit={addGroup} className="mt-6 flex gap-2"><input value={groupName} onChange={e=>setGroupName(e.target.value)} required placeholder="New add-on group" className="flex-1 rounded-xl border p-3"/><button className="rounded-xl bg-slate-900 px-4 font-bold text-white">Create group</button></form>
          <form onSubmit={addOption} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_7rem_auto]"><select value={selectedGroup} onChange={e=>setSelectedGroup(e.target.value)} required className="rounded-xl border p-3"><option value="">Select group</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select><input value={optionName} onChange={e=>setOptionName(e.target.value)} required placeholder="Option name" className="rounded-xl border p-3"/><input type="number" min="0" step="0.01" value={optionPrice} onChange={e=>setOptionPrice(e.target.value)} required className="rounded-xl border p-3"/><button className="rounded-xl bg-orange-500 px-4 font-bold text-white">Add</button></form>
        </section>
        <section className="mt-8 max-w-2xl space-y-3"><h3 className="text-xl font-bold">Menu availability</h3>{menu.map(d=><div key={d.id} className="flex justify-between bg-white p-4 rounded-xl"><span>{d.name}</span><button onClick={async()=>{const {error}=await supabase.from('dishes').update({is_available:!d.is_available}).eq('id',d.id); if(error) alert(error.message); else await refresh();}} className="font-bold text-orange-700">{d.is_available?'Mark sold out':'Make available'}</button></div>)}</section>
      </main>
    </div>
  );
}
