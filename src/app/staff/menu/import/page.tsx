'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { UploadCloud, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function BulkMenuImport() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setStatus('idle');
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    
    setIsUploading(true);
    setStatus('idle');
    
    try {
      // In a real implementation, we would send this to the Next.js API route
      // which would parse the CSV using something like 'csv-parse' and insert into Supabase
      
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/menu/import', {
        method: 'POST',
        body: formData,
        headers: { Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ''}` },
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to import menu');
      }
      
      setStatus('success');
      setMessage(`Successfully imported ${data.dishesCount} dishes across ${data.categoriesCount} categories!`);
      setFile(null);
    } catch (err: unknown) {
      setStatus('error');
      setMessage((err instanceof Error ? err.message : 'Request failed') || 'An error occurred during import.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex flex-col md:flex-row">
      <aside className="w-full md:w-64 bg-slate-900 text-white p-6 flex flex-col shrink-0">
        <h1 className="text-2xl font-black tracking-tight mb-12 text-orange-500">Staff Portal</h1>
        <nav className="space-y-4 flex-1">
          <Link href="/staff/orders" className="flex items-center gap-3 text-slate-400 hover:text-slate-200 hover:bg-slate-800 px-4 py-3 rounded-xl font-medium transition-colors">
            &larr; Back to Orders
          </Link>
        </nav>
      </aside>

      <main className="flex-1 p-8 max-w-3xl">
        <header className="mb-8">
          <h2 className="text-3xl font-bold text-slate-800">Bulk Menu Import</h2>
          <p className="text-slate-500 mt-1">Upload a CSV file to instantly populate your menu.</p>
        </header>

        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <div className="mb-6">
            <h3 className="font-bold text-slate-800 mb-2">CSV Format Requirements:</h3>
            <p className="text-sm text-slate-600 mb-4">Your CSV must contain the following columns exactly as written:</p>
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl overflow-x-auto">
              <code className="text-sm text-slate-700 whitespace-nowrap">category, name, price, description, is_veg, image_url</code>
            </div>
          </div>

          <div 
            className={`rounded-2xl border-2 border-dashed p-6 text-center transition-colors sm:p-12 ${
              file ? 'border-orange-500 bg-orange-50' : 'border-slate-300 hover:border-slate-400 bg-slate-50'
            }`}
          >
            {file ? (
              <div className="flex flex-col items-center">
                <FileText className="w-12 h-12 text-orange-500 mb-4" />
                <p className="font-bold text-slate-800 text-lg">{file.name}</p>
                <p className="text-sm text-slate-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                <button 
                  onClick={() => setFile(null)}
                  className="mt-4 text-sm font-bold text-red-500 hover:text-red-600"
                >
                  Remove File
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center cursor-pointer">
                <UploadCloud className="w-12 h-12 text-slate-400 mb-4" />
                <p className="font-bold text-slate-700">Click to upload CSV</p>
                <p className="text-sm text-slate-500 mt-1">CSV files up to 1 MB</p>
                <input 
                  type="file" 
                  accept=".csv" 
                  className="hidden" 
                  onChange={handleFileChange}
                />
              </label>
            )}
          </div>

          {status === 'success' && (
            <div className="mt-6 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl flex gap-3 items-start">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <p className="font-medium">{message}</p>
            </div>
          )}

          {status === 'error' && (
            <div className="mt-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl flex gap-3 items-start">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="font-medium">{message}</p>
            </div>
          )}

          <div className="mt-8">
            <button
              onClick={handleUpload}
              disabled={!file || isUploading}
              className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all shadow-lg"
            >
              {isUploading ? 'Importing Menu...' : 'Upload & Import Menu'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
