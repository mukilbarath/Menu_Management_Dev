import Link from 'next/link';
import QRScanner from '@/components/QRScanner';
import { isDemo } from '@/lib/config';

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      
      {/* Background Decor */}
      <div className="absolute top-0 right-0 -mt-20 -mr-20 w-80 h-80 bg-orange-500 rounded-full blur-[100px] opacity-20 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-80 h-80 bg-purple-500 rounded-full blur-[100px] opacity-20 pointer-events-none"></div>

      <div className="bg-white/80 backdrop-blur-xl p-8 rounded-[2rem] shadow-2xl border border-white max-w-md w-full text-center relative z-10">
        <div className="w-20 h-20 bg-orange-100 text-orange-500 rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>
        </div>
        
        <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Welcome</h1>
        <p className="text-slate-500 mb-8 font-medium">Scan the QR code on your table to start ordering.</p>
        
        <div className="space-y-4">
          
          <QRScanner />
          
          <div className="relative flex items-center py-4">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink-0 mx-4 text-slate-400 text-sm font-medium">or</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          {isDemo && <Link 
            href="/11111111-1111-1111-1111-111111111111/menu/22222222-2222-2222-2222-222222222221"
            className="block w-full bg-slate-100 text-slate-700 rounded-xl py-3.5 font-bold hover:bg-slate-200 transition-colors border border-slate-200 shadow-sm"
          >
            Open sample table
          </Link>}
          
          <Link 
            href="/staff/login" 
            className="block w-full text-slate-400 hover:text-slate-600 rounded-xl py-2 text-sm font-semibold transition-colors mt-8"
          >
            Staff Portal Login &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
