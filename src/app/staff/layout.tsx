'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChefHat, ClipboardList, CookingPot, LogOut, Menu as MenuIcon, QrCode, ReceiptText, Upload } from 'lucide-react';
import { getStaff, type Staff } from '@/lib/staff';
import { supabase } from '@/lib/supabase';

const navigation = [
  { href: '/staff/orders', label: 'Orders', icon: ClipboardList, roles: ['owner', 'manager', 'waiter', 'cashier'] },
  { href: '/staff/tables', label: 'Tables & QR', icon: QrCode, roles: ['owner', 'manager', 'waiter'] },
  { href: '/staff/kitchen', label: 'Kitchen', icon: CookingPot, roles: ['owner', 'manager', 'kitchen'] },
  { href: '/staff/menu', label: 'Menu', icon: MenuIcon, roles: ['owner', 'manager'] },
  { href: '/staff/menu/import', label: 'Import', icon: Upload, roles: ['owner', 'manager'] },
  { href: '/staff/billing', label: 'Billing', icon: ReceiptText, roles: ['owner', 'manager', 'cashier'] },
] as const;

function isCurrentPath(path: string, href: string) {
  if (href === '/staff/menu') return path === href;
  return path === href || path.startsWith(`${href}/`);
}

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
  if (error) return <main className="grid min-h-screen place-items-center bg-slate-100 p-6 text-slate-900"><div className="rounded-2xl border bg-white p-6 shadow-sm">{error} <Link href="/staff/login" className="font-bold text-orange-600 underline">Staff login</Link></div></main>;
  if (!staff) return <div className="grid min-h-screen place-items-center bg-slate-100 text-slate-600">Checking staff access…</div>;

  const visibleNavigation = navigation.filter(item => (item.roles as readonly string[]).includes(staff.role));
  const allowed = visibleNavigation.some(item => isCurrentPath(path, item.href));
  if (!allowed) {
    const destination = visibleNavigation[0]?.href ?? '/staff/login';
    return <main className="grid min-h-screen place-items-center bg-slate-100 p-6 text-slate-900"><div className="rounded-2xl border bg-white p-6 shadow-sm">This page is unavailable for your role. <Link href={destination} className="font-bold text-orange-600 underline">Return to your portal</Link></div></main>;
  }

  const signOut = async () => {
    sessionStorage.removeItem('demo_staff');
    await supabase.auth.signOut();
    window.location.assign('/staff/login');
  };

  return (
    <div className="staff-shell min-h-screen bg-slate-100 md:flex">
      <aside className="staff-shell-nav bg-slate-950 text-white md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col">
        <div className="flex items-center justify-between gap-4 px-4 py-4 md:block md:px-6 md:py-7">
          <Link href={visibleNavigation[0]?.href ?? '/staff/orders'} className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-500/15 text-orange-500"><ChefHat className="h-6 w-6" /></span>
            <span className="min-w-0"><span className="block truncate text-lg font-black tracking-tight">Staff Portal</span><span className="block truncate text-xs text-slate-400">{staff.full_name}</span></span>
          </Link>
          <button onClick={signOut} aria-label="Sign out" className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white md:hidden"><LogOut className="h-5 w-5" /></button>
        </div>
        <nav aria-label="Staff navigation" className="flex gap-2 overflow-x-auto px-4 pb-4 md:flex-1 md:flex-col md:overflow-visible md:px-4 md:pb-6">
          {visibleNavigation.map(item => {
            const Icon = item.icon;
            const active = isCurrentPath(path, item.href);
            return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${active ? 'bg-orange-500 text-white shadow-lg shadow-orange-950/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}><Icon className="h-5 w-5" /><span>{item.label}</span></Link>;
          })}
        </nav>
        <div className="hidden border-t border-slate-800 p-4 md:block"><button onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-slate-400 transition hover:bg-slate-800 hover:text-white"><LogOut className="h-5 w-5" />Sign out</button></div>
      </aside>
      <div className="staff-content min-w-0 flex-1">{children}</div>
    </div>
  );
}
