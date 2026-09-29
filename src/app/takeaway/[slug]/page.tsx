import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import MenuClient, { type DishModifierGroup } from '@/app/[restaurant_id]/menu/[table_id]/MenuClient';
import { isDemo } from '@/lib/config';

export default async function TakeawayMenu({ params }: PageProps<'/takeaway/[slug]'>) {
  const { slug } = await params;
  if (isDemo || !/^[a-z0-9-]{2,80}$/i.test(slug)) notFound();
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const restaurantResult = await db.from('restaurants').select('id,name').ilike('slug', slug).maybeSingle();
  if (restaurantResult.error || !restaurantResult.data) notFound();
  const restaurant = restaurantResult.data;
  const categoriesResult = await db.from('categories').select('id,name').eq('restaurant_id', restaurant.id).order('sort_order');
  if (categoriesResult.error) throw new Error('Unable to load menu categories.');
  const categories = categoriesResult.data ?? [];
  let dishes: Array<{ id:string;category_id:string;name:string;price:number;description:string;image_url:string;is_veg:boolean;is_available:boolean }> = [];
  if (categories.length) {
    const result = await db.from('dishes').select('*').in('category_id', categories.map(category => category.id)).order('sort_order');
    if (result.error) throw new Error('Unable to load menu items.');
    dishes = (result.data ?? []).map(dish => ({ ...dish, price: Number(dish.price) }));
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
  return <MenuClient key={restaurant.id} restaurant={{ name: restaurant.name }} categories={categories} dishes={dishes} tableName="Takeaway" restaurantId={restaurant.id} tableId="takeaway" orderType="takeaway" variants={variants} modifierGroups={modifierGroups} />;
}
