'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { getStaff, type Staff } from '@/lib/staff';
import { supabase } from '@/lib/supabase';

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (path === '/staff/login') return;
    let active = true;
    getStaff().then(value => { if (active) { setStaff(value); setError(''); } })
      .catch(err => { if (active) { setStaff(null); setError((err instanceof Error ? err.message : 'Request failed')); } });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { setStaff(null); setError('Please sign in.'); }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [path]);
  if (path === '/staff/login') return children;
  if (error) return <main className="p-8 text-slate-900">{error} <Link href="/staff/login" className="underline">Staff login</Link></main>;
  if (!staff) return <p className="p-8">Checking staff access…</p>;
  const allowed = ['owner', 'manager'].includes(staff.role) ||
    (staff.role === 'kitchen' && path === '/staff/kitchen') ||
    (staff.role === 'waiter' && ['/staff/orders', '/staff/tables'].includes(path)) ||
    (staff.role === 'cashier' && ['/staff/orders', '/staff/billing'].includes(path));
  if (!allowed) return <p className="p-8">This page is unavailable for your role. <Link href={staff.role === 'kitchen' ? '/staff/kitchen' : '/staff/orders'}>Return to your portal</Link></p>;
  return <><nav className="flex flex-wrap gap-4 bg-white p-3 text-sm text-slate-800 border-b"><span>{staff.full_name}</span><Link href="/staff/orders">Orders</Link><Link href="/staff/kitchen">Kitchen</Link><Link href="/staff/tables">Tables</Link><Link href="/staff/menu">Menu</Link><Link href="/staff/menu/import">Import</Link><Link href="/staff/billing">Billing</Link><button onClick={async () => { sessionStorage.removeItem('demo_staff'); await supabase.auth.signOut(); setStaff(null); setError('Signed out.'); }}>Sign out</button></nav>{children}</>;
}
