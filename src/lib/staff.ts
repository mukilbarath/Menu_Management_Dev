import { supabase } from './supabase';
import { demoRestaurantId, isDemo } from './config';

export type Staff = { id: string; restaurant_id: string; full_name: string; role: string };
export async function getStaff(): Promise<Staff> {
  if (isDemo) {
    if (sessionStorage.getItem('demo_staff') !== 'true') throw new Error('Please sign in.');
    return { id: 'demo', restaurant_id: demoRestaurantId, full_name: 'Demo Staff', role: 'owner' };
  }
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || user.is_anonymous) throw new Error('Please sign in with a staff account.');
  const { data, error: profileError } = await supabase.from('staff_profiles').select('*').eq('id', user.id).single();
  if (profileError || !data) throw new Error('No restaurant staff profile is assigned to this account.');
  return data;
}

export type StaffOrder = {
  id: string; table_number: string; status: string; total_amount: number; created_at: string; order_type: string;
  items: { id: string; dish_name: string; quantity: number; notes: string }[];
};
export async function fetchStaffOrders(): Promise<StaffOrder[]> {
  const staff = await getStaff();
  const { data, error } = await supabase.from('orders')
    .select('id, status, order_type, total_amount, created_at, tables(table_number), order_items(id, quantity, notes, dish_name, dishes(name))')
    .eq('restaurant_id', staff.restaurant_id).neq('status','pending_payment').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(order => {
    const table = Array.isArray(order.tables) ? order.tables[0] : order.tables;
    return { ...order, total_amount: Number(order.total_amount), table_number: order.order_type === 'takeaway' ? 'Takeaway' : table?.table_number ?? 'Unknown table',
      items: order.order_items.map(item => {
        const dish = Array.isArray(item.dishes) ? item.dishes[0] : item.dishes;
        return { ...item, dish_name: item.dish_name ?? dish?.name ?? 'Removed dish', notes: item.notes ?? '' };
      }) };
  });
}

export async function changeOrderStatus(orderId: string, status: string) {
  const { error } = await supabase.rpc('change_order_status', { p_order: orderId, p_status: status });
  if (error) throw error;
}
