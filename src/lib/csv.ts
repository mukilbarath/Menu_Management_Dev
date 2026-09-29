export function parseMenuCsv(text: string) {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false; let endedQuote = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i=0; i<text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i+1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; endedQuote = true; }
      else field += c;
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(field.trim()); field = ''; endedQuote = false;
      if (c !== ',') { if (row.some(Boolean)) rows.push(row); row = []; if (c === '\r' && text[i+1] === '\n') i++; }
    } else if (c === '"' && !field && !endedQuote) quoted = true;
    else if (endedQuote && !/\s/.test(c)) throw new Error('Invalid CSV quoting');
    else if (c === '"') throw new Error('Invalid CSV quoting');
    else field += c;
  }
  if (quoted) throw new Error('Unterminated quoted field');
  row.push(field.trim()); if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift()?.map(h => h.toLowerCase()) ?? [];
  if (new Set(headers).size !== headers.length || !['category','name','price'].every(h=>headers.includes(h))) throw new Error('Required columns: category, name, price');
  if (rows.length === 0 || rows.length > 1000) throw new Error('CSV must contain 1–1000 dishes');
  return rows.map((values, index) => {
    if (values.length !== headers.length) throw new Error(`Row ${index+2}: column count does not match header`);
    const r = Object.fromEntries(headers.map((h,i)=>[h,values[i]]));
    if (!r.name || !r.category || !/^\d+(\.\d{1,2})?$/.test(r.price) || Number(r.price)>99999999.99) throw new Error(`Row ${index+2}: invalid name, category, or price`);
    if (r.is_veg && !/^(true|false)$/i.test(r.is_veg)) throw new Error(`Row ${index+2}: is_veg must be true or false`);
    if (r.image_url && !/^https?:\/\//i.test(r.image_url)) throw new Error(`Row ${index+2}: invalid image URL`);
    return { category:r.category, name:r.name, price:Number(r.price), description:r.description ?? '', is_veg:r.is_veg?.toLowerCase() !== 'false', image_url:r.image_url ?? '' };
  });
}
