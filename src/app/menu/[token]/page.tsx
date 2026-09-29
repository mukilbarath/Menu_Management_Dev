import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import MenuClient, { type DishModifierGroup } from '@/app/[restaurant_id]/menu/[table_id]/MenuClient';
import { isDemo, uuidPattern } from '@/lib/config';

export default async function PublicTableMenu({ params }: PageProps<'/menu/[token]'>) {
  const { token } = await params;
  if (!uuidPattern.test(token) || isDemo) notFound();
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const resolved = await db.rpc('resolve_table_qr', { p_token: token }).single();
  if (resolved.error || !resolved.data) notFound();
  const table = resolved.data as { restaurant_id: string; restaurant_name: string; table_id: string; table_number: string };
  const categoriesResult = await db.from('categories').select('id,name').eq('restaurant_id', table.restaurant_id).order('sort_order');
  if (categoriesResult.error) throw new Error('Unable to load menu categories.');
  const categories = categoriesResult.data ?? [];
  let dishes: Array<{ id:string;category_id:string;name:string;price:number;description:string;image_url:string;is_veg:boolean;is_available:boolean }> = [];
  if (categories.length) {
    const dishResult = await db.from('dishes').select('*').in('category_id', categories.map(category => category.id)).order('sort_order');
    if (dishResult.error) throw new Error('Unable to load menu items.');
    dishes = (dishResult.data ?? []).map(dish => ({ ...dish, price: Number(dish.price) }));
  }
  const dishIds = dishes.map(dish => dish.id);
  const [variantResult, linkResult] = dishIds.length ? await Promise.all([
    db.from('dish_variants').select('id,dish_id,name,price,is_default').in('dish_id',dishIds).eq('is_available',true).order('sort_order'),
    db.from('dish_modifier_groups').select('dish_id,group_id').in('dish_id',dishIds)
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (variantResult.error || linkResult.error) throw new Error('Unable to load menu options.');
  const groupIds = [...new Set((linkResult.data ?? []).map(link => link.group_id))];
  const [groupResult, optionResult] = groupIds.length ? await Promise.all([
    db.from('modifier_groups').select('id,name,min_selections,max_selections').in('id',groupIds).order('sort_order'),
    db.from('modifier_options').select('id,group_id,name,price_delta').in('group_id',groupIds).eq('is_available',true).order('sort_order')
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (groupResult.error || optionResult.error) throw new Error('Unable to load add-ons.');
  const modifierGroups: DishModifierGroup[] = (linkResult.data ?? []).map(link => {
    const group = (groupResult.data ?? []).find(value => value.id === link.group_id)!;
    return { dish_id: link.dish_id, ...group, options: (optionResult.data ?? []).filter(option => option.group_id === link.group_id).map(option => ({...option,price_delta:Number(option.price_delta)})) };
  }).filter(group => group.id);
  const variants = (variantResult.data ?? []).map(variant => ({...variant,price:Number(variant.price)}));
  return <MenuClient key={token} restaurant={{ name: table.restaurant_name }} categories={categories} dishes={dishes} tableName={table.table_number} restaurantId={table.restaurant_id} tableId={table.table_id} qrToken={token} variants={variants} modifierGroups={modifierGroups} />;
}
