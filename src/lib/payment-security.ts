import { createHmac, timingSafeEqual } from 'node:crypto';
export function validSignature(message: string, signature: string, secret: string) {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(message).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
export function toPaise(amount: number | string) {
  const value = Number(amount);
  const paise = Math.round(value * 100);
  if (!Number.isFinite(value) || !Number.isSafeInteger(paise) || paise <= 0) throw new Error('Invalid payment amount');
  return paise;
}
