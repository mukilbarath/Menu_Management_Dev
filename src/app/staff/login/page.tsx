'use client';

import { useState } from 'react';
import { isDemo } from '@/lib/config';
import { getStaff } from '@/lib/staff';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { ChefHat, Lock, Mail } from 'lucide-react';

export default function StaffLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');

    try {
          
      if (isDemo) {
        // Mock login for demo
        await new Promise(r => setTimeout(r, 1000));
        if (email === 'admin@demo.com' && password === 'password') {
          sessionStorage.setItem('demo_staff', 'true');
          router.push('/staff/orders');
          return;
        } else {
          throw new Error('Invalid credentials. Use admin@demo.com / password for demo.');
        }
      }

      if (email.trim().toLowerCase() === 'admin@demo.com') {
        throw new Error('These credentials are for the demo preview. This site is configured for live sign-in. Use your assigned restaurant staff account.');
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;
      
      const staff = await getStaff();
      router.push(staff.role === 'kitchen' ? '/staff/kitchen' : '/staff/orders');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Request failed';
      setError(/failed to fetch|fetch failed|networkerror|network request failed|load failed/i.test(message)
        ? 'Unable to reach the sign-in service. Check your connection. If this continues, the restaurant administrator needs to check the Supabase project connection.'
        : message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-6 font-sans">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-orange-500/20 text-orange-500 mb-6">
            <ChefHat className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">Staff Portal</h1>
          <p className="text-slate-400 mt-2">{isDemo ? 'Demo preview — sample orders and menu' : 'Sign in with your restaurant staff account'}</p>
        </div>

        <div className="bg-slate-800 rounded-3xl p-8 shadow-2xl border border-slate-700">
          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <div role="alert" className="bg-red-500/10 border border-red-500/50 text-red-400 text-sm p-4 rounded-xl">
                {error}
              </div>
            )}
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 ml-1">Email Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-700 text-white rounded-xl pl-11 pr-4 py-3 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all placeholder:text-slate-500"
                  autoComplete="username"
                  placeholder={isDemo ? 'admin@demo.com' : 'Your staff email address'}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 ml-1">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-700 text-white rounded-xl pl-11 pr-4 py-3 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all placeholder:text-slate-500"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white font-bold text-lg py-3 rounded-xl transition-colors shadow-lg shadow-orange-500/20"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
        
        {isDemo && <p className="text-center text-slate-500 text-sm mt-8">
          Demo Credentials: admin@demo.com / password
        </p>}
      </div>
    </div>
  );
}
