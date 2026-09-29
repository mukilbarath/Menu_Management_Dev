import { NextResponse } from 'next/server';
import { authenticatedClient, apiError, HttpError } from '@/lib/server';
import { gateway, settlePayment } from '@/lib/payments';
import { validSignature } from '@/lib/payment-security';
import { uuidPattern } from '@/lib/config';
export async function POST(request: Request) {
  try {
    const { client } = await authenticatedClient(request);
    const body = await request.json().catch(() => { throw new HttpError('Invalid JSON'); });
    if (!body || typeof body.orderId !== 'string' || !uuidPattern.test(body.orderId) || typeof body.razorpay_payment_id !== 'string' || typeof body.razorpay_signature !== 'string') throw new HttpError('Invalid payment response');
    const { data: order, error } = await client.from('orders').select('id').eq('id', body.orderId).single();
    if (error || !order) throw new HttpError('Order not found.', 404);
    if (typeof body.razorpay_order_id !== 'string' || !validSignature(`${body.razorpay_order_id}|${body.razorpay_payment_id}`, body.razorpay_signature, gateway().key_secret)) throw new HttpError('Invalid payment signature');
    await settlePayment(body.razorpay_payment_id, body.razorpay_order_id);
    return NextResponse.json({ success: true });
  } catch (error) { return apiError(error); }
}
