import { readFileSync, writeFileSync } from 'node:fs';
const sources = ['database.sql', 'phase2_database.sql', 'fix_rls_and_cart.sql', 'hardening.sql', 'production_migration.sql'];
const parts = sources.map(file => {
  let sql = readFileSync(file, 'utf8');
  if (file === 'database.sql') sql = sql.split('-- Seed Data for Prototype')[0];
  return `-- Source: ${file}\n${sql.replace(/^\s*(BEGIN|COMMIT);\s*$/gm, '')}`;
});
writeFileSync('supabase_bootstrap.sql', `-- FRESH EMPTY PROJECT ONLY. No demo seed data.\nBEGIN;\n${parts.join('\n')}\nGRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;\nGRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;\nGRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;\nCOMMIT;\n`);
console.log('Prepared atomic setup in supabase_bootstrap.sql');
