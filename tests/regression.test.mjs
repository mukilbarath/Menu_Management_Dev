import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { parseMenuCsv } from '../src/lib/csv.ts';
import { toPaise, validSignature } from '../src/lib/payment-security.ts';

test('CSV preserves quoted commas, line breaks, escaped quotes and BOM', () => {
  const rows = parseMenuCsv('\uFEFFcategory,name,price,description,is_veg\r\nMains,"Rice, bowl",10.25,"Line 1\nLine ""2""",false\r\n');
  assert.deepEqual(rows, [{category:'Mains',name:'Rice, bowl',price:10.25,description:'Line 1\nLine "2"',is_veg:false,image_url:''}]);
});
test('CSV rejects invalid or empty imports before any database writes', () => {
  for (const text of ['name,price\na,1','category,name,price','category,name,price\nx,y,-1','category,name,price\nx,y,NaN','category,name,price\nx,y,1.234','category,name,price\nx,y,','category,name,price\nx,"y,1','category,name,price\nx,y,1,extra','category,name,price,is_veg\nx,y,1,no','category,name,price,image_url\nx,y,1,javascript:alert(1)']) assert.throws(()=>parseMenuCsv(text));
});
test('CSV accepts zero-price dishes and defaults vegetarian explicitly', () => {
  assert.equal(parseMenuCsv('category,name,price\nDrinks,Water,0')[0].price,0);
  assert.equal(parseMenuCsv('category,name,price\nDrinks,Water,0')[0].is_veg,true);
});
test('Payment conversion handles decimal rupees and rejects invalid charges', () => {
  assert.equal(toPaise('123.45'),12345); assert.equal(toPaise(0.29),29);
  for (const amount of [0,-1,NaN,Infinity,'invalid',Number.MAX_SAFE_INTEGER]) assert.throws(()=>toPaise(amount));
});
test('Signature verification rejects altered payments, malformed signatures and wrong secrets', () => {
  const message='order_123|pay_456'; const secret='test_secret';
  const signature=createHmac('sha256',secret).update(message).digest('hex');
  assert.equal(validSignature(message,signature,secret),true);
  assert.equal(validSignature('order_other|pay_456',signature,secret),false);
  assert.equal(validSignature(message,signature,'different'),false);
  for (const value of ['', 'a', 'z'.repeat(64), signature.slice(2)]) assert.equal(validSignature(message,value,secret),false);
});
test('Webhook signatures use exact raw body bytes', () => {
  const body='{"event":"payment.captured"}'; const secret='webhook_secret';
  const signature=createHmac('sha256',secret).update(body).digest('hex');
  assert.equal(validSignature(body,signature,secret),true);
  assert.equal(validSignature(body+'\n',signature,secret),false);
});
