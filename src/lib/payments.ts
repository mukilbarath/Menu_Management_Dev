import Razorpay from 'razorpay';
import { adminClient, HttpError } from './server';
import { toPaise } from './payment-security';

export function gateway() {
  const key_id = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret || /your_|placeholder/.test(key_id)) throw new HttpError('Payments are not configured. Please ask staff to settle your bill.', 503);
  return { client: new Razorpay({ key_id, key_secret }), key_id, key_secret };
}

export async function settlePayment(paymentId: string, gatewayOrderId: string) {
  const db = adminClient();
  const { data: expected, error } = await db.from('payments').select('amount,status,provider_payment_id').eq('provider_order_id',gatewayOrderId).single();
  if (error || !expected) throw new HttpError('Payment order not found.',404);
  if (expected.status === 'captured' && expected.provider_payment_id === paymentId) return;
  const payment=await gateway().client.payments.fetch(paymentId);
  if(payment.order_id!==gatewayOrderId || payment.status!=='captured' || payment.currency!=='INR' || Number(payment.amount)!==toPaise(expected.amount)) throw new HttpError('Payment is not yet captured or does not match this bill.',409);
  const {error:settleError}=await db.rpc('capture_online_payment',{p_provider_order:gatewayOrderId,p_provider_payment:paymentId});
  if(settleError)throw settleError;
}
